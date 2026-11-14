/**
 * The slot component: reads the three session snapshots, owns the menu's
 * interaction state, and hands pure data to the view modules.
 *
 * Deliberate boundaries:
 * - data in: the standard props `useSessions` / `useSessionStatus` /
 *   `useWorkspaces` (resolved through `contract`), nothing else from the Host;
 * - data out: `nav.openSession` for a row click;
 * - no stylesheet, no dictionary, no geometry logic here — each lives in its own
 *   module.
 *
 * Split in two on purpose. `RunningSessionsPill` is the value registered at the
 * seat: it only checks that the seat gave it what it needs and otherwise renders
 * nothing. `SessionPill` is the real component, mounted only once those props are
 * present, so it calls its hooks — including the three standard-prop hooks —
 * unconditionally on every render. A change in the prop set then mounts a fresh
 * child instead of changing the hook count of a mounted one.
 *
 * The two expensive passes are gated: the collapsed pill only computes the two
 * counts (the roster snapshot changes on every streamed token), and the row
 * groups are built only while the menu is open.
 */
const platform = require('./platform');
const contract = require('./contract');
const configStore = require('./config');
const hintStore = require('./hint');
const { resolveTranslator } = require('./i18n');
const { countRunning, buildRows, pillVisible } = require('./rows');
const { reviveOpen, rememberOpen } = require('./mount-state');
const { placeMenu } = require('./geometry');
const nav = require('./nav');
const { renderPill } = require('./view/pill');
const { renderMenu } = require('./view/menu');

/**
 * One press must toggle the menu exactly once.
 *
 * Two handlers can observe the same pointer press: a capture listener on `window`
 * (needed because the header is a window-drag surface that handles the event
 * before bubbling reaches the button) and the button's own React handler (the only
 * path when no drag surface is installed). The first handler claims the press and
 * the second becomes a no-op, so the menu cannot open and immediately close.
 *
 * The claim is tracked in a `WeakSet` keyed on the *native* event rather than by
 * writing a property onto it. Two reasons: the capture listener sees the DOM event
 * while React hands its handler a `SyntheticEvent` wrapper, so the two paths must
 * agree on one key; and a host event object is not guaranteed extensible, where a
 * write would fail silently and quietly disable the guard.
 */
const claimedPresses = new WeakSet();

/** Toggle once per press; the same press seen again by another handler is ignored. */
function toggleOnce(event, flip) {
  // No event means nothing to correlate, so the call is honoured as-is.
  if (!event) {
    flip();
    return;
  }
  const press = event.nativeEvent || event;
  if (typeof press !== 'object' && typeof press !== 'function') {
    flip();
    return;
  }
  if (claimedPresses.has(press)) return;
  claimedPresses.add(press);
  flip();
}

/** True once the missing-prop case has been logged, so it is reported only once. */
let missingPropReported = false;

/**
 * The seat component.
 *
 * No hooks are called before the prop check, so an incomplete seat renders
 * nothing at all rather than throwing inside the conversation header. When the
 * props are there, the inner component is mounted and owns every hook.
 */
function RunningSessionsPill(props) {
  const sessions = contract.hook(props, contract.HOOKS.sessions);
  const status = contract.hook(props, contract.HOOKS.status);
  const workspaces = contract.hook(props, contract.HOOKS.workspaces);
  if (!sessions || !status || !workspaces) {
    // Report once per page load: the seat re-renders on every streamed token.
    if (!missingPropReported) {
      missingPropReported = true;
      const missing = [
        !sessions ? contract.HOOKS.sessions : '',
        !status ? contract.HOOKS.status : '',
        !workspaces ? contract.HOOKS.workspaces : '',
      ].filter(Boolean).join(', ');
      console.error(`[running-sessions] the header seat is missing ${missing}; the pill stays hidden`);
    }
    return null;
  }
  return platform.element(SessionPill, {
    t: resolveTranslator(props),
    useSessions: sessions,
    useSessionStatus: status,
    useWorkspaces: workspaces,
  });
}

/** The real component; every hook below runs in a fixed order on every render. */
function SessionPill(props) {
  const React = platform.react();
  const t = props.t;

  const sessions = props.useSessions((snapshot) => snapshot);
  const status = props.useSessionStatus((snapshot) => snapshot);
  const workspaces = props.useWorkspaces((snapshot) => snapshot);

  const [open, setOpenState] = React.useState(reviveOpen);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const [config, setConfig] = React.useState(configStore.getConfig);
  const [now, setNow] = React.useState(() => Date.now());
  /**
   * "Click to switch" is onboarding copy, not a caption: it shows until the menu
   * is closed for the first time, then never again. Retiring it in the close
   * handler (rather than an effect) keeps the flag correct even when a remount
   * races the commit.
   */
  const [hintVisible, setHintVisible] = React.useState(() => !hintStore.hasSeenHint());

  const openRef = React.useRef(open);
  const buttonRef = React.useRef(null);
  const menuRef = React.useRef(null);

  /** Keep the local options in sync with the store (another header may toggle). */
  React.useEffect(() => configStore.subscribe(setConfig), []);

  /** The ref is the source of truth so a fast pointer sequence cannot flip twice. */
  const setOpen = React.useCallback((next) => {
    if (openRef.current === next) return;
    openRef.current = next;
    rememberOpen(next);
    setOpenState(next);
    if (!next) {
      setSettingsOpen(false);
      // Closing the list is the "you have seen this" moment for the hint.
      if (!hintStore.hasSeenHint()) {
        hintStore.markHintSeen();
        setHintVisible(false);
      }
    }
  }, []);

  const counts = React.useMemo(
    () => countRunning(sessions, status, workspaces, config),
    [sessions, status, workspaces, config],
  );
  const groups = React.useMemo(
    () => (open ? buildRows(sessions, status, workspaces, config) : null),
    [open, sessions, status, workspaces, config],
  );

  const updateConfig = React.useCallback((patch) => {
    setConfig(configStore.patchConfig(patch));
    setNow(Date.now());
  }, []);

  /** Relative timestamps go stale without a tick; only run it while visible. */
  React.useEffect(() => {
    if (!open) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [open]);

  /**
   * The conversation header is a window-drag surface, and the shell registers its
   * own capture-phase pointer handling there. A capture listener on `window` runs
   * before any document-level capture handler, so the pill keeps working no matter
   * what the header does with the same event.
   *
   * The press is claimed through `toggleOnce`, the same guard the button's own
   * React handler uses, so the two entry points cannot toggle one press twice.
   */
  React.useEffect(() => {
    const pageWindow = platform.view();
    if (!pageWindow || typeof pageWindow.addEventListener !== 'function') return undefined;
    const isInsidePill = (target) =>
      Boolean(buttonRef.current && target && buttonRef.current.contains(target));
    const onCapture = (event) => {
      if (!isInsidePill(event.target)) return;
      if (event.type === 'click') {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      toggleOnce(event, () => setOpen(!openRef.current));
    };
    pageWindow.addEventListener('pointerdown', onCapture, true);
    pageWindow.addEventListener('click', onCapture, true);
    return () => {
      pageWindow.removeEventListener('pointerdown', onCapture, true);
      pageWindow.removeEventListener('click', onCapture, true);
    };
  }, [setOpen]);

  /** On open, move focus onto the first row so the list also works from the keyboard. */
  React.useEffect(() => {
    if (!open || !menuRef.current) return;
    const first = menuRef.current.querySelector('.dsh-rs-row');
    if (first && typeof first.focus === 'function') first.focus();
  }, [open, settingsOpen]);

  const place = React.useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const pageWindow = platform.view() || {};
    const menu = menuRef.current;
    const height = menu ? menu.getBoundingClientRect().height : 0;
    setPos(
      placeMenu(
        { left: rect.left, top: rect.top, bottom: rect.bottom },
        { width: pageWindow.innerWidth, height: pageWindow.innerHeight },
        height,
      ),
    );
  }, []);

  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    // Re-place only when the menu's size can actually change; the roster snapshot
    // itself updates on every streamed token.
  }, [
    open,
    settingsOpen,
    counts.main,
    counts.sub,
    groups ? groups.running.length : 0,
    // Subagent rows are children of a running row, so they change the height too.
    groups
      ? groups.running.reduce((total, row) => total + (row.children ? row.children.length : 0), 0)
      : 0,
    groups ? groups.recent.length : 0,
    place,
  ]);

  /** Dismissal: outside pointer, Escape, viewport resize. */
  React.useEffect(() => {
    if (!open) return undefined;
    const pageDocument = platform.doc();
    const pageWindow = platform.view();
    if (!pageDocument || !pageWindow) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (buttonRef.current && buttonRef.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        if (buttonRef.current) buttonRef.current.focus();
      }
    };
    const onResize = () => {
      setOpen(false);
    };
    pageDocument.addEventListener('pointerdown', onPointerDown, true);
    pageDocument.addEventListener('keydown', onKeyDown, true);
    pageWindow.addEventListener('resize', onResize);
    // No scroll dismissal: a streaming session scrolls the transcript constantly,
    // and the menu is position:fixed so it stays put anyway.
    return () => {
      pageDocument.removeEventListener('pointerdown', onPointerDown, true);
      pageDocument.removeEventListener('keydown', onKeyDown, true);
      pageWindow.removeEventListener('resize', onResize);
    };
  }, [open, setOpen]);

  const switchTo = React.useCallback(
    (sessionId) => {
      setOpen(false);
      nav.openSession(sessionId);
    },
    [setOpen],
  );

  if (!pillVisible(counts, open, config)) return null;

  const live = counts.main + counts.sub;
  const label = counts.main > 0
    ? t('pill.aria', { count: counts.main })
    : counts.sub > 0
      ? t('pill.subaria', { count: counts.sub })
      : t('pill.empty.aria');

  const pill = renderPill({
    open,
    empty: live === 0,
    label,
    title: live === 0 ? t('pill.empty.aria') : t('list.title'),
    main: counts.main,
    t,
    buttonRef,
    // The capture listener on the drag surface usually claims the press first;
    // `toggleOnce` makes this handler a no-op in that case.
    onToggle: (event) => toggleOnce(event, () => setOpen(!openRef.current)),
    onKeyDown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setOpen(!openRef.current);
    },
  });
  if (!open) return pill;

  const menu = renderMenu(
    { settingsOpen, hintVisible, counts, groups, config, now, pos, menuRef },
    t,
    {
      onToggleSettings: () => setSettingsOpen(!settingsOpen),
      onPick: switchTo,
      onConfigChange: updateConfig,
    },
  );
  return platform.element(platform.fragment(), null, pill, platform.portal(menu));
}

module.exports = { RunningSessionsPill };
