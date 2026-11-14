/**
 * @local/running-sessions — GENERATED BUNDLE. Source lives in src/; edit there and run
 * `npm run build`. `npm test` refuses to run against a stale bundle.
 */
window.__ModuleLoader__.load({
  id: "@local/running-sessions",
  factory(require) {
    // Package-local registry. Kept inside the factory on purpose: the kernel
    // calls it once per activation and nothing leaks into the page.
    const definitions = Object.create(null);
    const cache = Object.create(null);
    function define(name, body) {
      definitions[name] = body;
    }
    // `./x` resolves against the requiring module, exactly as Node would; a
    // bare word falls through to the kernel module table.
    function resolveName(fromName, spec) {
      const slash = fromName.lastIndexOf('/');
      const parts = (slash === -1 ? '' : fromName.slice(0, slash)).split('/');
      const out = parts.filter(function (part) { return part !== ''; });
      for (const part of spec.split('/')) {
        if (part === '' || part === '.') continue;
        if (part === "..") out.pop();
        else out.push(part);
      }
      return out.join('/');
    }
    function load(name) {
      const cached = cache[name];
      if (cached !== undefined) return cached.exports;
      const body = definitions[name];
      if (body === undefined) {
        throw new Error("[running-sessions] missing module: " + name);
      }
      const module = { exports: {} };
      cache[name] = module;
      body(module, module.exports, localRequire(name));
      return module.exports;
    }
    function localRequire(fromName) {
      return function (spec) {
        return spec.startsWith('.') ? load(resolveName(fromName, spec)) : require(spec);
      };
    }
    define("component", function (module, exports, require) {
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
    });

    define("config", function (module, exports, require) {
/**
 * User options, persisted in `localStorage`.
 *
 * Kept out of the profile on purpose: a toggle flips one string in the browser,
 * so no profile file is rewritten and no plugin reload is triggered.
 *
 * The module is the single owner of the option bag: readers get a frozen-shaped
 * snapshot, writers persist and notify. The component subscribes rather than
 * keeping its own copy, so two mounted headers (or a remount) cannot disagree.
 */

const storage = require('./platform').storage;

const CONFIG_KEY = 'dsh-running-sessions:config';

/**
 * Option defaults. Every key here is a user-visible switch in the panel.
 *
 * The two `subagent*` keys decide how subagent sessions are surfaced: a subagent
 * runs inside a session it belongs to, so by default its activity keeps the
 * owning session in the running list and its own session appears as an indented
 * row underneath it instead of an extra top-level "running session".
 */
const DEFAULT_CONFIG = Object.freeze({
  showWhenIdle: false,
  recentLimit: 3,
  showWorkspace: true,
  showTime: true,
  showPending: true,
  subagentActivity: true,
  subagentRows: true,
});

/** Boolean options, in the order the settings panel lists them. */
const TOGGLE_KEYS = Object.freeze([
  'showWhenIdle',
  'showWorkspace',
  'showTime',
  'showPending',
  'subagentActivity',
  'subagentRows',
]);

/** Offered values for "recently finished"; `0` hides the group. */
const RECENT_CHOICES = Object.freeze([0, 1, 3, 5]);

/** Subagent rows are a diagnostic aid; a large fan-out must not stretch the menu. */
const SUBAGENT_LIMIT = 6;

let cache = null;
/** Subscribers, notified after a successful write. */
let listeners = [];

function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

/**
 * Coerce a stored/partial bag into a complete, validated option set. Unknown
 * keys are dropped rather than carried: the bag that reaches a render always has
 * exactly the documented keys.
 *
 * `recentLimit` snaps to the nearest offered value rather than merely staying in
 * range, so a hand-edited or stale stored `7` cannot render a segmented control
 * with no segment selected.
 */
function normalizeConfig(raw) {
  const next = Object.assign({}, DEFAULT_CONFIG);
  if (!raw || typeof raw !== 'object') return next;
  for (const key of TOGGLE_KEYS) {
    if (typeof raw[key] === 'boolean') next[key] = raw[key];
  }
  if (raw.recentLimit !== undefined) {
    next.recentLimit = nearestChoice(clampInt(raw.recentLimit, 0, RECENT_CHOICES[RECENT_CHOICES.length - 1]));
  }
  return next;
}

/** Snap one integer to the closest offered value, preferring the smaller on a tie. */
function nearestChoice(value) {
  let best = RECENT_CHOICES[0];
  for (const choice of RECENT_CHOICES) {
    if (Math.abs(choice - value) < Math.abs(best - value)) best = choice;
  }
  return best;
}

/** The current option set, read once per page load and then cached. */
function getConfig() {
  if (cache) return cache;
  let stored = null;
  try {
    const localStorage = storage();
    stored = JSON.parse((localStorage && localStorage.getItem(CONFIG_KEY)) || 'null');
  } catch (error) {
    stored = null;
  }
  cache = normalizeConfig(stored);
  return cache;
}

/** Persist a full option set and notify subscribers. */
function setConfig(next) {
  const normalized = normalizeConfig(next);
  cache = normalized;
  try {
    const localStorage = storage();
    if (localStorage) localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
  } catch (error) {
    console.error('[running-sessions] could not persist settings', error);
  }
  for (const listener of listeners) {
    try {
      listener(normalized);
    } catch (error) {
      console.error('[running-sessions] settings listener failed', error);
    }
  }
  return normalized;
}

/** Apply one patch on top of the current set, returning the result. */
function patchConfig(patch) {
  return setConfig(Object.assign({}, getConfig(), patch));
}

/** Subscribe to option changes; returns the unsubscribe function. */
function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners = listeners.concat(listener);
  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

/** Drop the read cache (headless checks only). */
function resetConfigCache() {
  cache = null;
  listeners = [];
}

module.exports = {
  DEFAULT_CONFIG,
  TOGGLE_KEYS,
  RECENT_CHOICES,
  SUBAGENT_LIMIT,
  normalizeConfig,
  getConfig,
  setConfig,
  patchConfig,
  subscribe,
  resetConfigCache,
};
    });

    define("contract", function (module, exports, require) {
/**
 * The one place where this plugin names anything that DSH owns.
 *
 * Everything version-fragile lives here: the slot id, the locale namespace, the
 * standard props it reads, the service it calls, and every field name of the
 * session / status / workspace snapshots. A DSH upgrade that renames or reshapes
 * one of those facts is a one-file change; `test/contract.test.mjs` pins the
 * expectations against a recorded fixture and fails when the adapter starts
 * returning nothing.
 *
 * Every reader is deliberately shy: an absent field degrades to "no data",
 * never to a thrown render. A missing shape therefore hides the pill instead of
 * breaking the conversation header it lives in.
 */

/** Header slot: the global navigation seat left of the conversation title. */
const SLOT = 'conversation.header.leading';
/** Slot registration id, unique within the seat. */
const SLOT_ID = 'running-sessions';
/** Draw order inside the seat. */
const SLOT_ORDER = 10;
/**
 * Attribute DSH's macOS Desktop window-region pass reads to keep an overlay out
 * of the window-drag area. A body portal has no layout box, so the exclusion has
 * to sit on the visible menu box.
 */
const DRAG_EXCLUDE_ATTR = 'data-window-drag-exclude';
/** Locale namespace registered through the client locale service. */
const LOCALE_NS = 'runningSessions';
/** Services this plugin hard-depends on, as named in `inject`. */
const SERVICE_SLOTS = 'slots';
const SERVICE_LOCALE = 'locale';
const SERVICE_WORKSPACE = 'uiWorkspace';

/** Standard props (rendered into the slot) this plugin reads. */
const HOOKS = {
  sessions: 'useSessions',
  status: 'useSessionStatus',
  workspaces: 'useWorkspaces',
};

/** Session-row facts. */
const SESSION = {
  /** `'subagent'` is the authoritative subagent marker; a bare parent id is not. */
  origin: 'origin',
  originSubagent: 'subagent',
  parentId: 'parentId',
  running: 'running',
  updatedAt: 'updatedAt',
  title: 'title',
  displayTitle: 'displayTitle',
  /**
   * A provisional session that exists but holds no conversation yet (the "New
   * Session" tab). The official sidebar hides these unless they are the session
   * on screen, so a list of *conversations* must skip them too.
   */
  blank: 'blank',
};

/** Session-list snapshot: `ids` is Host-list membership, `byId` may hold more. */
const ROSTER = {
  ids: 'ids',
  byId: 'byId',
  projections: 'projectionsBySession',
};

/** Per-session projection bag and the subagent catalog inside it. */
const PROJECTION = {
  values: 'values',
  subagentCatalog: 'subagentCatalog',
};

/**
 * Catalog entry modes with no local child session. `external` names a subagent
 * that lives outside this Host, so treating it as a session would invent rows.
 */
const CATALOG_MODES_WITHOUT_SESSION = ['external'];

/**
 * The two display names a catalog entry can carry: the durable creation `label`
 * every mode may have, and the `name` a newer catalog reserves unique among the
 * parent's children.
 */
const CATALOG_ENTRY = {
  label: 'label',
  name: 'name',
};

/** Session UI status: running flag plus the pending interaction. */
const STATUS = {
  running: 'running',
  pendingInteraction: 'pendingInteraction',
  pendingKind: 'kind',
};

/** Pending interaction kinds and the dictionary key each one renders. */
const PENDING_LABELS = {
  approval: 'row.pending.approval',
  'plan-review': 'row.pending.plan',
  question: 'row.pending.question',
};
/**
 * A kind this plugin does not know yet still deserves a badge — the alternative
 * is silently swallowing "waiting for something" after a DSH upgrade.
 */
const PENDING_LABEL_UNKNOWN = 'row.pending.other';

/** Workspace snapshot facts. */
const WORKSPACE = {
  items: 'items',
  archivedSessionIds: 'archivedSessionIds',
  sessionIds: 'sessionIds',
  title: 'title',
};

/** A standard prop, or `null` when the seat does not provide it. */
function hook(props, name) {
  const value = props ? props[name] : undefined;
  return typeof value === 'function' ? value : null;
}

/** The Host-list order, or an empty list when the snapshot is unusable. */
function hostOrder(sessions) {
  const value = sessions ? sessions[ROSTER.ids] : undefined;
  return Array.isArray(value) ? value : [];
}

/** The row bag, or `null` when the snapshot is unusable. */
function rows(sessions) {
  const value = sessions ? sessions[ROSTER.byId] : undefined;
  return value && typeof value === 'object' ? value : null;
}

/** Whether one row is a subagent session (only the durable origin counts). */
function isSubagentRow(entry) {
  return Boolean(entry) && entry[SESSION.origin] === SESSION.originSubagent;
}

/**
 * Whether one row is a provisional session with no conversation yet.
 *
 * A missing field reads as `false`, so a Host that stops sending `blank` shows
 * the row instead of silently dropping it — the wrong direction to fail, but the
 * safe one: showing one extra row beats hiding a real conversation.
 */
function isBlankRow(entry) {
  return Boolean(entry) && entry[SESSION.blank] === true;
}

/** The session id a row claims as its parent, if it claims one. */
function parentIdOf(entry) {
  const value = entry ? entry[SESSION.parentId] : undefined;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Every `[parentId, entry]` pair from the workspaces' subagent catalogs. */
function catalogEntries(sessions) {
  const projections = sessions ? sessions[ROSTER.projections] : undefined;
  const pairs = [];
  if (!projections || typeof projections !== 'object') return pairs;
  for (const parentId of Object.keys(projections)) {
    const snapshot = projections[parentId];
    const values = snapshot ? snapshot[PROJECTION.values] : undefined;
    const catalog = values ? values[PROJECTION.subagentCatalog] : undefined;
    if (!Array.isArray(catalog)) continue;
    for (const entry of catalog) pairs.push([parentId, entry]);
  }
  return pairs;
}

/** Whether a catalog entry can stand for a session on this Host. */
function catalogEntryHasSession(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return false;
  return CATALOG_MODES_WITHOUT_SESSION.indexOf(entry.mode) === -1;
}

/**
 * The name each child was created under, keyed by child session id.
 *
 * A subagent session has no title of its own: DSH fills its `title` from the
 * opening prompt, so a row built from the session snapshot alone reads as the
 * first line of the task text instead of the name the parent gave the child. The
 * parent's catalog is where that name actually lives — `label` is the display
 * description handed to the spawner, `name` the short unique handle a newer
 * catalog records. `label` wins because it is prose meant for a human.
 *
 * The catalog is a live projection, so this map tracks children created after the
 * row above was first drawn.
 *
 * @returns `Map<SessionId, string>` — only entries that actually carry a name.
 */
function catalogLabels(sessions) {
  const names = new Map();
  for (const [, entry] of catalogEntries(sessions)) {
    if (!catalogEntryHasSession(entry)) continue;
    const label = entry[CATALOG_ENTRY.label];
    const name = entry[CATALOG_ENTRY.name];
    const text = typeof label === 'string' && label.trim()
      ? label.trim()
      : typeof name === 'string' && name.trim() ? name.trim() : '';
    if (text) names.set(entry.id, text);
  }
  return names;
}

/** Archived session ids, or `null` when nothing is archived. */
function archivedIds(workspaces) {
  const value = workspaces ? workspaces[WORKSPACE.archivedSessionIds] : undefined;
  return Array.isArray(value) && value.length > 0 ? value : null;
}

/** Workspace rows, or an empty list. */
function workspaceItems(workspaces) {
  const value = workspaces ? workspaces[WORKSPACE.items] : undefined;
  return Array.isArray(value) ? value : [];
}

/** The session ids one workspace owns, or an empty list. */
function workspaceSessionIds(workspace) {
  const value = workspace ? workspace[WORKSPACE.sessionIds] : undefined;
  return Array.isArray(value) ? value : [];
}

/** The label a workspace row shows for itself. */
function workspaceTitle(workspace) {
  const value = workspace ? workspace[WORKSPACE.title] : undefined;
  return typeof value === 'string' ? value : '';
}

/**
 * Whether a session is running: the status snapshot wins (it is the live view),
 * and the list row is the fallback when no status has arrived yet.
 */
function isRunning(entry, state) {
  const status = state ? state[STATUS.running] : undefined;
  if (typeof status === 'boolean') return status;
  return Boolean(entry) && entry[SESSION.running] === true;
}

/** The pending interaction kind of one session, or an empty string. */
function pendingKind(state) {
  const pending = state ? state[STATUS.pendingInteraction] : undefined;
  const kind = pending ? pending[STATUS.pendingKind] : undefined;
  return typeof kind === 'string' ? kind : '';
}

/** The dictionary key a pending kind renders as; unknown kinds stay visible. */
function pendingLabelKey(kind) {
  if (!kind) return '';
  if (Object.prototype.hasOwnProperty.call(PENDING_LABELS, kind)) return PENDING_LABELS[kind];
  return PENDING_LABEL_UNKNOWN;
}

/** The best title a session row carries, trimmed; empty when it has none. */
function titleOf(entry) {
  if (!entry) return '';
  const title = entry[SESSION.title];
  if (typeof title === 'string' && title.trim()) return title.trim();
  const display = entry[SESSION.displayTitle];
  if (typeof display === 'string' && display.trim()) return display.trim();
  return '';
}

/** Last activity timestamp, or `0` so sorting stays total. */
function updatedAtOf(entry) {
  const value = entry ? entry[SESSION.updatedAt] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

module.exports = {
  SLOT,
  SLOT_ID,
  SLOT_ORDER,
  DRAG_EXCLUDE_ATTR,
  LOCALE_NS,
  SERVICE_SLOTS,
  SERVICE_LOCALE,
  SERVICE_WORKSPACE,
  HOOKS,
  PENDING_LABEL_UNKNOWN,
  hook,
  hostOrder,
  rows,
  isSubagentRow,
  isBlankRow,
  parentIdOf,
  catalogEntries,
  catalogEntryHasSession,
  catalogLabels,
  archivedIds,
  workspaceItems,
  workspaceSessionIds,
  workspaceTitle,
  isRunning,
  pendingKind,
  pendingLabelKey,
  titleOf,
  updatedAtOf,
};
    });

    define("dictionaries", function (module, exports, require) {
/**
 * UI copy, in one place.
 *
 * `zh` is the key-set source of truth: every key exists here first, and `en`
 * mirrors it. `test/integration.test.mjs` enforces both directions — a key used
 * by the view must exist in `zh`, and a key in `zh` must actually be rendered —
 * so an unused or misspelled string fails a test instead of sitting dead.
 *
 * Only main-agent sessions are counted: a subagent's session is a compact row
 * nested under the session that owns it, never a second total on the pill. Its
 * activity still keeps the pill's aria text honest when no main session runs.
 */
const zh = {
  'pill.label': '运行中',
  'pill.count': '{count} 个',
  'pill.aria': '正在运行的会话：{count} 个',
  'pill.subaria': '另有 {count} 个子 agent 在运行',
  'pill.empty.aria': '当前没有正在运行的会话',
  'list.title': '正在运行的会话',
  'list.hint': '点击即切换',
  'list.recent': '最近完成',
  'list.empty': '现在没有正在运行的会话',
  'row.pending.approval': '等待授权',
  'row.pending.plan': '等待确认计划',
  'row.pending.question': '等待回答',
  'row.pending.other': '等待处理',
  'ago.now': '刚刚',
  'ago.minutes': '{count} 分钟',
  'ago.hours': '{count} 小时',
  'ago.days': '{count} 天',
  'settings.open': '设置',
  'settings.title': '设置',
  'settings.back': '返回会话列表',
  'settings.idle': '没有运行中会话时也显示胶囊',
  'settings.recent': '最近完成',
  'settings.workspace': '显示工作区',
  'settings.time': '显示时间',
  'settings.pending': '显示待处理标记',
  'settings.subagentActive': '子 agent 活动算作运行中',
  'settings.subagentRows': '在主会话下面列出子 agent',
  'settings.off': '关闭',
  'settings.reset': '恢复默认',
};

/** English dictionary, key-identical to the Chinese source of truth. */
const en = {
  'pill.label': 'Running',
  'pill.count': '{count}',
  'pill.aria': 'Running sessions: {count}',
  'pill.subaria': '{count} more sub-agent(s) running',
  'pill.empty.aria': 'No session is running',
  'list.title': 'Running sessions',
  'list.hint': 'Click to switch',
  'list.recent': 'Recently finished',
  'list.empty': 'No session is running right now',
  'row.pending.approval': 'Waiting for approval',
  'row.pending.plan': 'Waiting for plan review',
  'row.pending.question': 'Waiting for an answer',
  'row.pending.other': 'Waiting',
  'ago.now': 'just now',
  'ago.minutes': '{count}m',
  'ago.hours': '{count}h',
  'ago.days': '{count}d',
  'settings.open': 'Settings',
  'settings.title': 'Settings',
  'settings.back': 'Back to sessions',
  'settings.idle': 'Keep the pill visible when nothing runs',
  'settings.recent': 'Recently finished',
  'settings.workspace': 'Show workspace',
  'settings.time': 'Show elapsed time',
  'settings.pending': 'Show pending badges',
  'settings.subagentActive': 'Sub-agent activity counts as running',
  'settings.subagentRows': 'Nest sub-agents under their session',
  'settings.off': 'Off',
  'settings.reset': 'Reset to defaults',
};

module.exports = { zh, en };
    });

    define("geometry", function (module, exports, require) {
/**
 * Popover placement.
 *
 * A pure geometry function: given the pill's box, the viewport, and the menu's
 * current height, decide where the fixed-position menu goes. Kept separate from
 * the component so the flip/clamp rules can be checked without a layout engine,
 * and so a future menu-surface primitive can replace the maths in one place.
 */

/** Gaps: below/above the pill, and from every viewport edge. */
const GAP = 6;
const EDGE = 8;
/**
 * Menu width bounds. The maximum is sized to the content the menu actually
 * carries — a title and a short meta line — so the panel does not open a wide
 * empty gutter on the right of every row.
 */
const WIDTH_MIN = 200;
const WIDTH_MAX = 240;

/**
 * @param rect - `{ left, top, bottom, width }` of the pill
 * @param viewport - `{ width, height }`
 * @param menuHeight - measured menu height, or `0` before it is known
 * @returns `{ left, top, width }`
 */
function placeMenu(rect, viewport, menuHeight) {
  const viewportWidth = viewport && viewport.width > 0 ? viewport.width : 1280;
  const viewportHeight = viewport && viewport.height > 0 ? viewport.height : 800;
  // A viewport narrower than the minimum still gets a menu that fits: a 240px
  // floor would otherwise push the box past the right edge on a split pane.
  const available = Math.max(1, viewportWidth - EDGE * 2);
  const width = available < WIDTH_MIN ? available : Math.min(WIDTH_MAX, available);
  const left = Math.max(EDGE, Math.min(rect.left, viewportWidth - width - EDGE));
  let top = rect.bottom + GAP;
  if (menuHeight > 0 && top + menuHeight > viewportHeight - EDGE) {
    // Prefer flipping above the pill; fall back to hugging the bottom edge when
    // the menu is taller than the space on either side.
    const above = rect.top - GAP - menuHeight;
    top = above >= EDGE ? above : Math.max(EDGE, viewportHeight - EDGE - menuHeight);
  }
  return { left, top, width };
}

module.exports = { placeMenu, EDGE };
    });

    define("hint", function (module, exports, require) {
/**
 * The one-time "click to switch" hint flag.
 *
 * Onboarding copy, not a caption: it shows on the first open and never again.
 * Kept under its own storage key so the option bag stays a bag of options.
 */

const storage = require('./platform').storage;

const HINT_KEY = 'dsh-running-sessions:hint-seen';

let seen = null;

function hasSeenHint() {
  if (seen !== null) return seen;
  let value = false;
  try {
    const localStorage = storage();
    value = Boolean(localStorage) && localStorage.getItem(HINT_KEY) === '1';
  } catch (error) {
    value = false;
  }
  seen = value;
  return value;
}

function markHintSeen() {
  if (seen === true) return;
  seen = true;
  try {
    const localStorage = storage();
    if (localStorage) localStorage.setItem(HINT_KEY, '1');
  } catch (error) {
    console.error('[running-sessions] could not persist the hint flag', error);
  }
}

/** Forget the cached flag (headless checks only; storage is untouched). */
function resetHintState() {
  seen = null;
}

module.exports = { hasSeenHint, markHintSeen, resetHintState };
    });

    define("i18n", function (module, exports, require) {
/**
 * Locale adapter.
 *
 * The dictionaries are the plugin's own; everything else about locales — which
 * locale is active, the `t` prop a slot may render, the fallback chain — belongs
 * to DSH. This module keeps that split explicit: it registers the dictionaries
 * with the locale service and resolves a translator for a render.
 *
 * A missing translation falls back to `en` and then to the key itself, so a
 * dictionary edit can never blank out the UI.
 */

const contract = require('./contract');
const { zh, en } = require('./dictionaries');

/** The dictionaries handed to `ctx.locale.register`. */
const DICTIONARIES = { zh, en };

/** Substitute `{name}` placeholders; unknown names stay literal. */
function format(template, params) {
  if (!params) return template;
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

/** Look up one key in one dictionary. */
function lookup(dictionary, key) {
  const value = dictionary ? dictionary[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Resolve the translator for one render.
 *
 * A slot may pass its own `t` (already scoped to this plugin's namespace); when
 * it does not, this module translates against its own dictionaries. Either way
 * the fallback order is the same, so a missing key is visible but harmless.
 */
function resolveTranslator(props) {
  const supplied = props ? props.t : undefined;
  if (typeof supplied === 'function') return supplied;
  return (key, params) => {
    const template = lookup(zh, key) !== undefined
      ? lookup(zh, key)
      : lookup(en, key) !== undefined
        ? lookup(en, key)
        : key;
    return format(template, params);
  };
}

/** Register the dictionaries with the client locale service. */
function registerDictionaries(ctx) {
  return ctx[contract.SERVICE_LOCALE].register(contract.LOCALE_NS, DICTIONARIES);
}

module.exports = { DICTIONARIES, resolveTranslator, registerDictionaries };
    });

    define("main", function (module, exports, require) {
/**
 * Bundle entry: bind the platform modules, register the dictionaries and the
 * header seat.
 *
 * The registration surface is the part of this plugin most exposed to a DSH
 * upgrade, so it is also the smallest module: everything it names lives in
 * `contract.js`, and every registration is wrapped in `ctx.effect` so a reload
 * or a disable takes it back out.
 */
const platform = require('./platform');
const contract = require('./contract');
const i18n = require('./i18n');
const style = require('./style');
const nav = require('./nav');
const config = require('./config');
const hint = require('./hint');
const roster = require('./roster');
const rows = require('./rows');
const mountState = require('./mount-state');
const geometry = require('./geometry');
const { RunningSessionsPill } = require('./component');

/**
 * Bind the two platform modules the kernel table provides.
 * @param requireHook - the kernel `require` handed to `factory(require)`
 */
function bindPlatform(requireHook) {
  const reactDom = requireHook('react-dom');
  platform.configure({
    React: requireHook('react'),
    createPortal: reactDom ? reactDom.createPortal : null,
  });
}

/**
 * Build the plugin exports for one activation.
 * @param requireHook - the kernel `require` handed to `factory(require)`
 */
function createPlugin(requireHook) {
  bindPlatform(requireHook);
  return {
    // Hard dependencies: the seat this renders into, the namespace its copy
    // lives in, and the service a row click calls.
    inject: [contract.SERVICE_SLOTS, contract.SERVICE_LOCALE, contract.SERVICE_WORKSPACE],
    apply(ctx) {
      nav.bindRuntime(ctx);
      style.injectStyles();
      ctx.effect(() => i18n.registerDictionaries(ctx), 'running-sessions: dictionaries');
      ctx.effect(
        () =>
          ctx[contract.SERVICE_SLOTS].inject(contract.SLOT, () =>
            ctx[contract.SERVICE_SLOTS].register(
              {
                name: contract.SLOT,
                id: contract.SLOT_ID,
                order: contract.SLOT_ORDER,
                locale: contract.LOCALE_NS,
              },
              RunningSessionsPill,
            ),
          ),
        'running-sessions: header seat',
      );
    },
  };
}

module.exports = {
  createPlugin,
  /**
   * Pure helpers, exposed so the headless checks drive the same functions the
   * component does instead of a re-implementation. This is the entire test seam;
   * the loader-facing plugin face above stays clean.
   */
  __internals: {
    // roster classification
    classifySessions: roster.classifySessions,
    resolveActivity: roster.resolveActivity,
    // counts and rows
    countRunning: rows.countRunning,
    buildRows: rows.buildRows,
    // options
    DEFAULT_CONFIG: config.DEFAULT_CONFIG,
    SUBAGENT_LIMIT: config.SUBAGENT_LIMIT,
    normalizeConfig: config.normalizeConfig,
    getConfig: config.getConfig,
    setConfig: config.setConfig,
    patchConfig: config.patchConfig,
    resetConfigCache: config.resetConfigCache,
    // onboarding hint
    hasSeenHint: hint.hasSeenHint,
    resetHintState: hint.resetHintState,
    // interaction state + pure helpers
    resetOpenState: mountState.resetOpenState,
    placeMenu: geometry.placeMenu,
    dictionaries: i18n.DICTIONARIES,
    // the component and the platform seam the render checks bind
    RunningSessionsPill,
    configurePlatform: platform.configure,
    dragExcludeAttr: contract.DRAG_EXCLUDE_ATTR,
  },
};
    });

    define("mount-state", function (module, exports, require) {
/**
 * State that must outlive one component instance.
 *
 * The conversation header is re-created whenever the active session changes, so
 * a plain `useState` would drop an already-open menu on the floor. The flag is
 * therefore kept here — but only for a moment, so a later remount does not
 * resurrect a stale menu.
 *
 * This module is intentionally tiny and side-effect free: it holds values and
 * nothing else, which is what makes it safe to reach from a render.
 */

/** The open flag that survives a header remount, with the time it was set. */
let openAcrossMounts = { at: 0, open: false };

/** How long a remount may restore the menu. */
const OPEN_REVIVE_MS = 3000;

/** Read the flag for a fresh mount, honouring the revive window. */
function reviveOpen() {
  return openAcrossMounts.open && Date.now() - openAcrossMounts.at < OPEN_REVIVE_MS;
}

/** Record the latest open state (called on every toggle). */
function rememberOpen(open) {
  openAcrossMounts = { at: Date.now(), open: Boolean(open) };
}

/** Drop the cross-mount flag (headless checks only). */
function resetOpenState() {
  openAcrossMounts = { at: 0, open: false };
}

module.exports = { reviveOpen, rememberOpen, resetOpenState };
    });

    define("nav", function (module, exports, require) {
/**
 * Workspace navigation: turn a row click into the same call the sidebar makes.
 *
 * The service handle is kept here rather than in the component so the view never
 * sees a Cordis context. Binding is best-effort by design: if the service is not
 * reachable (not yet provided, or renamed by a future DSH), a click logs once and
 * does nothing rather than throwing inside a React event handler.
 */
const contract = require('./contract');

/** The client root context, bound at activation. */
let runtime = null;
/** True once an unavailable service has been reported, so a click cannot spam. */
let reported = false;

/** Bind the client context; called from `apply`. */
function bindRuntime(ctx) {
  runtime = ctx;
  reported = false;
}

/**
 * Resolve the workspace service from the context, either access shape.
 *
 * A Cordis context THROWS when a declared service has no active provider
 * (`cannot get required service "…" in inactive context`), so both reads are
 * guarded: during a workspace switch or teardown a click must stay inert, not
 * propagate an exception into the click handler.
 */
function workspaceService() {
  if (!runtime) return null;
  try {
    const direct = runtime[contract.SERVICE_WORKSPACE];
    if (direct && typeof direct.openSession === 'function') return direct;
    // The `get` form is the optional-access shape and covers a late registration.
    if (typeof runtime.get === 'function') {
      const fetched = runtime.get(contract.SERVICE_WORKSPACE);
      if (fetched && typeof fetched.openSession === 'function') return fetched;
    }
  } catch {
    // Unavailable for now; the caller reports and stays inert.
  }
  return null;
}

/**
 * Switch to one session.
 * @returns whether the navigation was handed to the Host.
 */
function openSession(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
  const workspace = workspaceService();
  if (!workspace) {
    if (!reported) {
      reported = true;
      console.error('[running-sessions] uiWorkspace service unavailable; row clicks are inert');
    }
    return false;
  }
  try {
    workspace.openSession(sessionId);
    return true;
  } catch (error) {
    console.error('[running-sessions] openSession failed', error);
    return false;
  }
}

module.exports = { bindRuntime, openSession };
    });

    define("platform", function (module, exports, require) {
/**
 * The only module that binds React and the page.
 *
 * Everything else in `src/` asks this module for what it needs. Two reasons:
 *
 * 1. Version surface. `react` and `react-dom` are the only platform modules the
 *    bundle requires, so the kernel module table is read here and nowhere else.
 * 2. Headless checks. `configure()` lets a test hand over a React stand-in and
 *    drive the components under plain `node`, with no browser and no bundler.
 */

/** Bound at activation by `main.js`; a test binds its stand-in the same way. */
const platform = {
  React: null,
  createPortal: null,
};

/**
 * Bind the platform modules.
 * @param bindings - `{ React, createPortal }`; missing entries are left alone.
 */
function configure(bindings) {
  if (!bindings) return;
  if (bindings.React) platform.React = bindings.React;
  if (bindings.createPortal) platform.createPortal = bindings.createPortal;
}

/** React, or a clear failure when a component is rendered before activation. */
function react() {
  const value = platform.React;
  if (!value) throw new Error('[running-sessions] React is not bound yet');
  return value;
}

/** `React.createElement`, resolved lazily so binding order does not matter. */
function element(...args) {
  return react().createElement(...args);
}

/** `React.Fragment`, resolved lazily for the same reason. */
function fragment() {
  return react().Fragment;
}

/**
 * Portal a node into the page body.
 * Returns `null` when no portal implementation is bound, so a caller can render a
 * tree without one (the headless checks use a plain stand-in).
 */
function portal(node) {
  const createPortal = platform.createPortal;
  if (typeof createPortal !== 'function') return null;
  const document = doc();
  if (!document || !document.body) return null;
  return createPortal(node, document.body);
}

/** The window, or `null` while rendering outside a page. */
function view() {
  const value = globalThis.window;
  return value && typeof value === 'object' ? value : null;
}

/** The document, or `null` while rendering outside a page. */
function doc() {
  const value = globalThis.document;
  return value && typeof value === 'object' ? value : null;
}

/** `window.localStorage`, or `null` when storage is blocked or absent. */
function storage() {
  const win = view();
  return win && win.localStorage ? win.localStorage : null;
}

module.exports = { platform, configure, react, element, fragment, portal, view, doc, storage };
    });

    define("roster", function (module, exports, require) {
/**
 * Roster classification: which sessions are main agents, which are subagents,
 * and which session owns which.
 *
 * Every subagent runs in its own DSH session, and the Host list flattens them
 * beside ordinary sessions — that is what turned one busy conversation into a
 * crowd of near-empty "running sessions". Classification therefore follows
 * proven lineage only:
 *
 * - a row's durable `origin: 'subagent'` + `parentId` is authoritative;
 * - a parent's `subagentCatalog` projection names children that may not have
 *   reached the Host list yet;
 * - an ordinary fork keeps a parent id without being a subagent, so a bare
 *   parent id is never treated as subagent evidence;
 * - a subagent whose parent is not loaded stays a subagent (never promoted to a
 *   top-level session row) and is left out of the menu when its owner is not
 *   rendered;
 * - a blank session holds no conversation yet (the "New Session" tab), so it is
 *   not a session row at all — the official sidebar hides it for the same reason.
 *
 * The result is a plain data structure, not a class: the callers are pure
 * functions over a snapshot, and a snapshot is replaced wholesale on each
 * streamed token.
 */

const contract = require('./contract');

/**
 * @typedef {object} RosterIndex
 * @property {string[]} ids ordered rows: Host-list members, then retained subagent fallbacks
 * @property {object} byId row lookup (the raw snapshot bag)
 * @property {Map<string,string>} parentOf child → parent edges, when the parent is loaded
 * @property {Map<string,string[]>} childrenOf parent → children edges
 * @property {string[]} subagentIds subagent rows in `ids` order
 * @property {(id: string) => boolean} isSubagent
 * @property {(id: string) => string} rootOf topmost loaded ancestor of an id
 */

/** An index that reports "everything is a plain top-level session". */
function emptyIndex() {
  return {
    ids: [],
    byId: {},
    parentOf: new Map(),
    childrenOf: new Map(),
    subagentIds: [],
    isSubagent: () => false,
    rootOf: (id) => id,
  };
}

/**
 * Classify a session snapshot.
 * @param sessions - `{ ids, byId, projectionsBySession }` from `useSessions`
 * @returns {RosterIndex}
 */
function classifySessions(sessions) {
  const result = emptyIndex();
  const byId = contract.rows(sessions);
  if (!byId) return result;

  const hostIds = contract.hostOrder(sessions);
  // A blank row holds no conversation yet, so it is not a session row and cannot
  // act as a parent either: a subagent whose parent is blank degrades to the
  // orphan case below instead of pointing at a row that is never rendered.
  const known = (id) =>
    typeof id === 'string' && byId[id] !== undefined && !contract.isBlankRow(byId[id]);
  const subagents = new Set();

  const link = (childId, parentId) => {
    if (!known(childId) || childId === parentId) return;
    subagents.add(childId);
    if (!known(parentId)) return;
    if (!result.parentOf.has(childId)) result.parentOf.set(childId, parentId);
    const siblings = result.childrenOf.get(parentId);
    if (!siblings) result.childrenOf.set(parentId, [childId]);
    else if (siblings.indexOf(childId) === -1) siblings.push(childId);
  };

  // `byId` carries retained subagent fallbacks that `ids` does not, so scan the
  // rows rather than Host-list order.
  for (const id of Object.keys(byId)) {
    const entry = byId[id];
    if (contract.isSubagentRow(entry)) link(id, contract.parentIdOf(entry));
  }
  // The projection names children the list may not carry yet.
  for (const [parentId, entry] of contract.catalogEntries(sessions)) {
    if (!contract.catalogEntryHasSession(entry)) continue;
    link(entry.id, parentId);
  }

  const ordered = [];
  const seen = new Set();
  for (const id of hostIds) {
    if (!known(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  // Only `ids` expresses Host-list membership; extra `byId` rows are retained
  // subagent fallbacks, and anything else there is not a session row yet.
  for (const id of Object.keys(byId)) {
    if (seen.has(id) || !subagents.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  result.ids = ordered;
  result.byId = byId;
  result.subagentIds = ordered.filter((id) => subagents.has(id));
  result.isSubagent = (id) => subagents.has(id);
  result.rootOf = (id) => {
    let current = id;
    const visited = new Set();
    while (!visited.has(current)) {
      visited.add(current);
      const parent = result.parentOf.get(current);
      if (parent === undefined) break;
      current = parent;
    }
    return current;
  };
  return result;
}

/**
 * Running state for one classified roster.
 *
 * `own` is a session's own turn; `active` folds subagent activity upward while
 * `subagentActivity` is on, so a session whose own turn reads idle but whose
 * subagents are working still counts as running — the "main agent quiet,
 * subagent busy" case.
 *
 * @param index - from `classifySessions`
 * @param status - `Map<id, SessionStatus>`
 * @param config - normalized option bag
 */
function resolveActivity(index, status, config) {
  const own = new Map();
  const active = new Map();

  const ownRunning = (id) => {
    if (own.has(id)) return own.get(id);
    const state = status ? status.get(id) : undefined;
    const value = contract.isRunning(index.byId[id] || {}, state);
    own.set(id, value);
    return value;
  };

  const compute = (id, seen) => {
    if (active.has(id)) return active.get(id);
    // A cycle degrades to "own state only" rather than spinning.
    if (seen.has(id)) return ownRunning(id);
    seen.add(id);
    let value = ownRunning(id);
    if (!value && config.subagentActivity) {
      for (const child of index.childrenOf.get(id) || []) {
        if (child === id) continue;
        if (compute(child, seen)) {
          value = true;
          break;
        }
      }
    }
    active.set(id, value);
    return value;
  };

  return {
    own: ownRunning,
    active: (id) => compute(id, new Set()),
  };
}

/** Archived session ids as a set, or `null` when nothing is archived. */
function archivedSet(workspaces) {
  const ids = contract.archivedIds(workspaces);
  return ids ? new Set(ids) : null;
}

/**
 * "Should this session's rows be hidden?" Archived sessions disappear from the
 * menu, and an archived main session takes its subagents with it.
 */
function hiddenTest(index, workspaces) {
  const archived = archivedSet(workspaces);
  if (!archived) return () => false;
  return (id) => archived.has(id) || archived.has(index.rootOf(id));
}

module.exports = {
  classifySessions,
  resolveActivity,
  hiddenTest,
};
    });

    define("rows", function (module, exports, require) {
/**
 * The two numbers the pill shows, and the groups the menu renders.
 *
 * Both are projections of one snapshot rebuilt from scratch on every change, so
 * there is no cache to invalidate and no stale row to reconcile. The split is
 * about cost, not state: `countRunning` is the cheap pass the collapsed pill runs
 * on every streamed token, `buildRows` is the full pass that only runs while the
 * menu is open.
 */
const contract = require('./contract');
const { classifySessions, resolveActivity, hiddenTest } = require('./roster');
const { SUBAGENT_LIMIT } = require('./config');

/**
 * Cheap pass: only the counts.
 *
 * `main` counts main-agent sessions (subagent activity included according to the
 * setting); `sub` counts subagents that are running on their own.
 *
 * @returns {{main: number, sub: number}}
 */
function countRunning(sessions, status, workspaces, config) {
  const index = classifySessions(sessions);
  if (index.ids.length === 0 && index.subagentIds.length === 0) return { main: 0, sub: 0 };
  const activity = resolveActivity(index, status, config);
  const hidden = hiddenTest(index, workspaces);
  let main = 0;
  let sub = 0;
  for (const id of index.ids) {
    if (index.isSubagent(id) || hidden(id)) continue;
    if (activity.active(id)) main += 1;
  }
  for (const id of index.subagentIds) {
    if (hidden(id)) continue;
    if (activity.own(id)) sub += 1;
  }
  return { main, sub };
}

/** Workspace label per session; only built when the menu is open. */
function workspaceOwners(workspaces, config) {
  const owner = new Map();
  if (!config.showWorkspace) return owner;
  for (const workspace of contract.workspaceItems(workspaces)) {
    for (const sessionId of contract.workspaceSessionIds(workspace)) {
      owner.set(sessionId, contract.workspaceTitle(workspace));
    }
  }
  return owner;
}

/**
 * The running subagents of one session, flattened into tree order with a depth.
 *
 * Depth is what expresses the hierarchy: a subagent that spawned its own
 * subagent appears one indent further in, directly under the row it belongs to,
 * so the menu reads as an outline instead of two unrelated lists.
 *
 * A child is listed when it is active — its own turn is running, or (with
 * subagent activity folded upward) a descendant of it is. The second case matters
 * for the outline: an intermediate subagent whose own turn went quiet but whose
 * child is still working has to stay on screen, or its child would be indented
 * under nothing.
 */
function runningChildren(index, activity, hidden, titleOf, pendingOf, parentId) {
  const rows = [];
  const walk = (ownerId, depth) => {
    const kids = (index.childrenOf.get(ownerId) || [])
      .filter((id) => index.byId[id] && !hidden(id) && activity.active(id))
      .sort((left, right) => contract.updatedAtOf(index.byId[right]) - contract.updatedAtOf(index.byId[left]));
    for (const id of kids) {
      rows.push({
        id,
        title: titleOf(id),
        pending: pendingOf(id),
        depth,
        updatedAt: contract.updatedAtOf(index.byId[id]),
      });
      walk(id, depth + 1);
    }
  };
  walk(parentId, 1);
  return rows;
}

/**
 * Build the menu groups: running main-agent sessions and the most recently
 * active main sessions that already ended.
 *
 * Each running session carries its own running subagents as `children`, indented
 * underneath it. They are not a separate section: a subagent belongs to one
 * session, and listing it away from that session was the thing that made the menu
 * confusing.
 *
 * Only called while the menu is open.
 *
 * @returns {{running: object[], recent: object[]}}
 */
function buildRows(sessions, status, workspaces, config) {
  const empty = { running: [], recent: [] };
  const index = classifySessions(sessions);
  if (index.ids.length === 0) return empty;

  const activity = resolveActivity(index, status, config);
  const hidden = hiddenTest(index, workspaces);
  const owner = workspaceOwners(workspaces, config);
  const labels = contract.catalogLabels(sessions);

  const titleOf = (id) => {
    // A subagent session has no title of its own — DSH fills one in from the
    // opening prompt, so the row would read as the first line of the task text.
    // The name the parent gave the child lives in the parent's catalog and is a
    // live projection, so the row keeps up as children are created and renamed.
    const named = labels.get(id);
    if (named) return named;
    const entry = index.byId[id];
    const title = contract.titleOf(entry);
    return title || id;
  };
  const pendingOf = (id) => contract.pendingLabelKey(
    contract.pendingKind(status ? status.get(id) : undefined),
  );
  const rowOf = (id) => ({
    id,
    title: titleOf(id),
    workspace: owner.get(id) || '',
    pending: pendingOf(id),
    updatedAt: contract.updatedAtOf(index.byId[id]),
  });

  const running = [];
  const recent = [];
  for (const id of index.ids) {
    if (!index.byId[id] || hidden(id) || index.isSubagent(id)) continue;
    if (!activity.active(id)) {
      // `active` is false only when the session's own turn is idle and no child
      // was folded in, so anything left here has genuinely finished.
      recent.push(rowOf(id));
      continue;
    }
    const row = rowOf(id);
    if (config.subagentRows) {
      const children = runningChildren({ byId: index.byId, childrenOf: index.childrenOf }, activity, hidden, titleOf, pendingOf, id);
      if (children.length > SUBAGENT_LIMIT) {
        // A large fan-out must not stretch the menu; the remainder is reported
        // under the row it belongs to rather than silently dropped.
        row.children = children.slice(0, SUBAGENT_LIMIT);
        row.moreChildren = children.length - SUBAGENT_LIMIT;
      } else if (children.length > 0) {
        row.children = children;
      }
    }
    running.push(row);
  }

  running.sort((a, b) => b.updatedAt - a.updatedAt);

  const limit = config.recentLimit;
  // No "and 113 more" counter: the finished list is a short convenience, so the
  // capped remainder is not information anyone acts on — it is only noise.
  const recentRows = limit > 0
    ? recent.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
    : [];
  return { running, recent: recentRows };
}

/** The pill is visible when anything runs, or when the user pinned it. */
function pillVisible(counts, open, config) {
  return counts.main + counts.sub > 0 || open || config.showWhenIdle;
}

module.exports = {
  countRunning,
  buildRows,
  pillVisible,
};
    });

    define("style", function (module, exports, require) {
/**
 * The stylesheet, and the one place it is pushed into the page.
 *
 * Injected once per page from `apply()`, never rendered by the component: a
 * per-render `<style>` element would be diffed on every session update, and the
 * roster snapshot changes on every streamed token.
 *
 * The stylesheet is plain global CSS scoped by the `dsh-rs-` prefix, and it is
 * written against DSH's public theme tokens (`--dsw-alias-*`) plus literal
 * geometry. No CSS modules, no build-time class hashing: class names are the
 * contract between this module and `view/`.
 */
const { doc } = require('./platform');

const CSS = `
.dsh-rs-root{display:flex;align-items:center;flex:none;position:relative;z-index:40;pointer-events:auto;app-region:no-drag;-webkit-app-region:no-drag}
.dsh-rs-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;font-weight:400;line-height:1;cursor:pointer;app-region:no-drag;-webkit-app-region:no-drag;transition:background .12s ease,border-color .12s ease}
.dsh-rs-pill:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsh-rs-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-rs-pill[data-open=true]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsh-rs-pill[data-empty=true]{color:var(--dsw-alias-label-secondary)}
.dsh-rs-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}
.dsh-rs-dot[data-live=true]{background:var(--dsw-alias-state-success-primary);animation:dsh-rs-pulse 1.8s ease-in-out infinite}
@keyframes dsh-rs-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.dsh-rs-count{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}
.dsh-rs-row[data-sub=true]{align-items:center;gap:6px;margin:0 4px 0 12px;padding:2px 8px;line-height:16px}
.dsh-rs-row[data-sub=true] .dsh-rs-dot{width:6px;height:6px;margin-top:0}
.dsh-rs-row[data-sub=true] .dsh-rs-title{color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-rs-row[data-sub=true][data-depth="1"]{padding-left:26px}
.dsh-rs-row[data-sub=true][data-depth="2"]{padding-left:40px}
.dsh-rs-row[data-sub=true][data-depth="3"]{padding-left:54px}
.dsh-rs-more{padding:1px 8px 1px 26px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px;font-variant-numeric:tabular-nums}
.dsh-rs-reset{width:auto;margin:0 2px;box-sizing:border-box;padding:6px 8px 6px 12px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer}
.dsh-rs-reset:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-rs-caret{display:block;flex:none;color:var(--dsw-alias-label-secondary);transition:transform .12s ease}
.dsh-rs-pill[data-open=true] .dsh-rs-caret{transform:rotate(180deg)}
.dsh-rs-iconBtn svg{display:block;flex:none;overflow:visible}
.dsh-rs-menu{position:fixed;z-index:2147483000;box-sizing:border-box;padding:6px;display:flex;flex-direction:column;gap:1px;max-height:min(60vh,420px);overflow:auto;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-overlay));box-shadow:0 8px 24px rgba(0,0,0,.12)}
.dsh-rs-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px 6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dsh-rs-headMain{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-rs-headHint{opacity:.7}
.dsh-rs-iconBtn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;transition:color .12s ease,background .12s ease}
.dsh-rs-iconBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-rs-iconBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-rs-divider{height:.5px;flex:none;margin:4px 6px 2px;background:var(--dsw-alias-border-l1)}
.dsh-rs-row{display:flex;align-items:flex-start;gap:8px;width:auto;box-sizing:border-box;margin:1px 4px 1px 12px;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}
.dsh-rs-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-rs-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-rs-row .dsh-rs-dot{margin-top:6px}
.dsh-rs-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.dsh-rs-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-rs-meta{display:flex;align-items:center;gap:6px;min-width:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:15px}
.dsh-rs-ws{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:45%}
.dsh-rs-sep{opacity:.5}
.dsh-rs-pending{flex:none;color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:15px}
.dsh-rs-empty{padding:16px 10px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;text-align:center}
.dsh-rs-set{display:flex;flex-direction:column;gap:2px;padding:2px 0 0}
.dsh-rs-setRow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 8px;border-radius:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}
.dsh-rs-setRow:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-rs-switch{position:relative;flex:none;width:30px;height:18px;padding:0;border:none;border-radius:9px;background:var(--dsw-alias-border-l2);cursor:pointer;transition:background .12s ease}
.dsh-rs-switch[data-on=true]{background:var(--dsw-alias-brand-primary)}
.dsh-rs-switch::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform .12s ease}
.dsh-rs-switch[data-on=true]::after{transform:translateX(12px)}
.dsh-rs-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-rs-seg{display:flex;flex:none;gap:2px;padding:2px;border-radius:6px;background:var(--dsw-alias-bg-layer-2)}
.dsh-rs-segBtn{min-width:22px;height:18px;padding:0 5px;border:none;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11px;line-height:18px;cursor:pointer}
.dsh-rs-segBtn[data-on=true]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 .5px var(--dsw-alias-border-l1)}
.dsh-rs-segBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:0}
`;

/** Marks the injected tag so a second activation does not double-inject. */
const STYLE_ATTR = 'data-dsh-running-sessions';

/** Styles are global, so they are pushed exactly once per page load. */
let injected = false;

/**
 * Inject the stylesheet into the page, once.
 *
 * `document.head` is the only carrier used on purpose. The kernel's module
 * system exposes a `styles` symbol to a build-time client plugin, but a dynamic
 * plugin bundle has no such service to insert into (DSH 0.2.2-rc.3 provides
 * none), so a `ctx.styles` branch would be dead code that can never run. A page
 * always has `document.head`, so this path is unconditional — one assumption
 * fewer than branching on a service that does not exist.
 *
 * A tag from an earlier activation is rewritten rather than skipped. A plugin
 * that is hot-reloaded keeps the page, so the old tag is still in the head; to
 * skip it would leave the previous sheet in force and a CSS-only change would
 * never reach an already-open window — the JS and the styling would disagree
 * until a full reload.
 */
function injectStyles() {
  if (injected) return;
  try {
    const document = doc();
    if (!document || !document.head || typeof document.head.appendChild !== 'function') return;
    const previous = typeof document.querySelector === 'function'
      ? document.querySelector(`style[${STYLE_ATTR}]`)
      : null;
    if (previous) {
      previous.textContent = CSS;
      injected = true;
      return;
    }
    const style = document.createElement('style');
    if (!style) return;
    style.setAttribute(STYLE_ATTR, '');
    style.textContent = CSS;
    document.head.appendChild(style);
    injected = true;
  } catch (error) {
    console.error('[running-sessions] could not inject styles', error);
  }
}

/** Forget the injected flag (headless checks only; the page tag stays). */
function resetStyles() {
  injected = false;
}

module.exports = { CSS, injectStyles, resetStyles };
    });

    define("time", function (module, exports, require) {
/**
 * Relative "last active" text.
 *
 * Kept out of the view so the arithmetic is testable on its own, and so the
 * rounding rules (and the 30s tick that drives them) have exactly one home.
 */

/** Timestamp → short relative label ("just now", "5m", "3h", "2d"). */
function agoText(t, timestamp, now) {
  if (!timestamp) return '';
  const diff = now - timestamp;
  if (!Number.isFinite(diff)) return '';
  if (diff < 60000) return t('ago.now');
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return t('ago.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('ago.hours', { count: hours });
  return t('ago.days', { count: Math.floor(hours / 24) });
}

module.exports = { agoText };
    });

    define("view/icons", function (module, exports, require) {
/**
 * Inline SVG glyphs.
 *
 * All three are hairline outlines: a filled silhouette at 13-14px reads as a
 * solid blob against the header and steals attention from the title, so the
 * settings affordance in particular is drawn as two 1.15px strokes.
 */
const { element } = require('../platform');

const h = element;

/** Outline "tune" sliders (settings). Two strokes, two hairline circles. */
function settingsIcon() {
  return h(
    'svg',
    { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
    h('path', {
      d: 'M2 5.2h2.4M8.4 5.2h5.6M2 10.8h5.6M11.6 10.8h2.4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
      strokeLinecap: 'round',
    }),
    h('circle', {
      cx: '6.4',
      cy: '5.2',
      r: '1.4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
    }),
    h('circle', {
      cx: '9.6',
      cy: '10.8',
      r: '1.4',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.15,
    }),
  );
}

/** Back chevron (settings → list). */
function backIcon() {
  return h(
    'svg',
    { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
    h('path', {
      d: 'M10 3.5 5.5 8 10 12.5',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
}

/** Disclosure caret on the pill. */
function caretIcon() {
  return h(
    'svg',
    {
      className: 'dsh-rs-caret',
      width: 10,
      height: 10,
      viewBox: '0 0 10 10',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    h('path', {
      d: 'M2.4 3.9 5 6.5 7.6 3.9',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
}

module.exports = { settingsIcon, backIcon, caretIcon };
    });

    define("view/list", function (module, exports, require) {
/**
 * The menu body: running sessions (each followed by its own running subagents),
 * then recently finished sessions.
 *
 * One group of running rows, one "recently finished" heading, one hairline
 * between them. The recent group is dropped together with its heading when it
 * would be empty, so the menu never shows a label over nothing.
 *
 * Subagents are NOT a group of their own: they render nested underneath the
 * session that owns them, as compact one-line rows. A subagent belongs to exactly
 * one session, and a separate section listing them away from that session is what
 * made the menu read as two unrelated lists.
 */
const { element } = require('../platform');
const { renderSessionRow, renderSubagentRow } = require('./row');

const h = element;

/** Indent levels the stylesheet defines; deeper nesting reuses the last one. */
const DEPTH_CAP = 3;

/** A section heading. */
function heading(key, label) {
  return h(
    'div',
    { key, className: 'dsh-rs-head' },
    h('span', null, label),
  );
}

/** A hairline separator. */
function divider(key) {
  return h('div', { key, className: 'dsh-rs-divider', role: 'separator' });
}

/**
 * @param groups - `{ running, recent }`, each running row optionally carrying
 *   `children` / `moreChildren`
 * @param config - normalized options
 * @param t - translator
 * @param now - timestamp for relative labels
 * @param onPick - `(id) => void`
 */
function renderList(groups, config, t, now, onPick) {
  const nodes = [];
  const empty = groups.running.length === 0 && groups.recent.length === 0;
  if (empty) nodes.push(h('div', { key: 'empty', className: 'dsh-rs-empty' }, t('list.empty')));

  for (const row of groups.running) {
    nodes.push(renderSessionRow(row, false, config, t, now, onPick));
    for (const child of row.children || []) {
      nodes.push(renderSubagentRow(child, DEPTH_CAP, config, t, onPick));
    }
    if (row.moreChildren > 0) {
      nodes.push(h('div', { key: row.id + ':more', className: 'dsh-rs-more' }, '+' + row.moreChildren));
    }
  }

  if (groups.recent.length > 0) {
    nodes.push(divider('divider'));
    nodes.push(heading('recentHead', t('list.recent')));
    for (const row of groups.recent) nodes.push(renderSessionRow(row, true, config, t, now, onPick));
  }

  return nodes;
}

module.exports = { renderList };
    });

    define("view/menu", function (module, exports, require) {
/**
 * The popover shell: placement box, header, and either the list or the settings.
 *
 * Rendered through `createPortal` into `document.body` so the header's overflow
 * and stacking cannot clip it. The drag-exclusion attribute comes from
 * `contract.js`: a body portal has no layout box of its own, so the exclusion has
 * to sit on the visible menu box — without it, clicking the open menu on macOS
 * Desktop starts dragging the window instead. Plain Web and Windows ignore it.
 */
const { element } = require('../platform');
const contract = require('../contract');
const { renderHeader, renderSettings } = require('./settings');
const { renderList } = require('./list');

const h = element;

/**
 * @param state - `{ settingsOpen, hintVisible, counts, groups, config, now, pos, menuRef }`
 * @param t - translator
 * @param actions - `{ onToggleSettings, onPick, onConfigChange }`
 */
function renderMenu(state, t, actions) {
  const { settingsOpen, hintVisible, counts, groups, config, now, pos, menuRef } = state;
  const box = h(
    'div',
    {
      ref: menuRef,
      className: 'dsh-rs-menu',
      role: 'dialog',
      'aria-label': settingsOpen ? t('settings.title') : t('list.title'),
      [contract.DRAG_EXCLUDE_ATTR]: '',
      style: {
        left: pos ? pos.left : -9999,
        top: pos ? pos.top : 0,
        width: pos ? pos.width : 320,
        visibility: pos ? 'visible' : 'hidden',
      },
    },
    renderHeader(settingsOpen, hintVisible, counts, t, actions.onToggleSettings),
    settingsOpen
      ? renderSettings(config, t, actions.onConfigChange)
      : renderList(groups, config, t, now, actions.onPick),
  );
  return box;
}

module.exports = { renderMenu };
    });

    define("view/pill", function (module, exports, require) {
/**
 * The pill itself: a button in the conversation header.
 *
 * It shows a live dot, the label, the count of running sessions, and a disclosure
 * caret. Subagents are deliberately absent: they are children of a session, so
 * they are already inside that session's count — a second badge saying "N sub"
 * next to "N sessions" reads as a second, competing total.
 */
const { element } = require('../platform');
const { caretIcon } = require('./icons');

const h = element;

/**
 * @param props - `{ open, empty, label, title, main, t, onToggle, onKeyDown,
 *   buttonRef }`
 *
 * `onToggle` receives the event, not just a call: the component uses it to make
 * one press toggle exactly once even though two handlers observe it (a capture
 * listener on the header's drag surface and this element's own pointer handler).
 */
function renderPill(props) {
  const { open, empty, label, title, main, t, onToggle, onKeyDown, buttonRef } = props;
  return h(
    'div',
    { className: 'dsh-rs-root' },
    h(
      'button',
      {
        type: 'button',
        ref: buttonRef,
        className: 'dsh-rs-pill',
        'data-open': open ? 'true' : 'false',
        'data-empty': empty ? 'true' : 'false',
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        'aria-label': label,
        title,
        onPointerDown: (event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle(event);
        },
        onKeyDown,
      },
      h('span', { className: 'dsh-rs-dot', 'data-live': empty ? 'false' : 'true' }),
      h('span', null, t('pill.label')),
      main > 0 ? h('span', { className: 'dsh-rs-count' }, t('pill.count', { count: main })) : null,
      caretIcon(),
    ),
  );
}

module.exports = { renderPill };
    });

    define("view/row", function (module, exports, require) {
/**
 * One session row in the menu.
 *
 * A row is a `<button>` because it navigates. The dot on the left encodes the
 * two states the menu distinguishes: live (still running) and done (recently
 * finished).
 *
 * Two shapes share this module. A session row is the full form: title plus a
 * meta line (workspace or owner, and elapsed time). A subagent row is the compact
 * form: title only, one line, indented under the session it belongs to, because
 * its owner is already the row above it — repeating that on every child would be
 * noise, and the shorter rows keep a busy fan-out from stretching the menu.
 */
const { element } = require('../platform');
const { agoText } = require('../time');

const h = element;

/**
 * @param row - `{ id, title, workspace, pending, updatedAt }`
 * @param done - render as already finished
 * @param config - normalized options, for the meta line
 * @param t - translator
 * @param now - timestamp used for the relative label
 * @param onPick - `(id) => void`
 */
function renderSessionRow(row, done, config, t, now, onPick) {
  const showMeta = config.showWorkspace || config.showTime;
  const meta = [];
  if (config.showWorkspace && row.workspace) {
    meta.push(h('span', { key: 'ws', className: 'dsh-rs-ws' }, row.workspace));
  }
  if (config.showTime) {
    // The separator belongs between two meta cells, so it appears only when the
    // time cell follows a workspace cell.
    if (meta.length > 0) meta.push(h('span', { key: 'sep', className: 'dsh-rs-sep' }, '·'));
    meta.push(h('span', { key: 'ago' }, agoText(t, row.updatedAt, now)));
  }
  return h(
    'button',
    {
      key: row.id,
      type: 'button',
      role: 'menuitem',
      className: 'dsh-rs-row',
      'data-sub': 'false',
      onClick: () => onPick(row.id),
    },
    h('span', { className: 'dsh-rs-dot', 'data-live': done ? 'false' : 'true' }),
    h(
      'span',
      { className: 'dsh-rs-main' },
      // `buildRows` always resolves a title, falling back to the session id, so
      // this is never empty and needs no placeholder copy of its own.
      h('span', { className: 'dsh-rs-title' }, row.title),
      showMeta && meta.length > 0 ? h('span', { className: 'dsh-rs-meta' }, meta) : null,
    ),
    config.showPending && row.pending ? h('span', { className: 'dsh-rs-pending' }, t(row.pending)) : null,
  );
}

/**
 * A subagent row: one line, indented by nesting depth.
 *
 * No meta line on purpose — the owning session is the row directly above, so the
 * indent and the outline carry the relationship. The indent is capped so a deep
 * chain cannot push a title off the right edge.
 *
 * @param row - `{ id, title, depth }`
 * @param cap - deepest indent level the layout will show
 */
function renderSubagentRow(row, cap, config, t, onPick) {
  const depth = Math.max(1, Math.min(cap, row.depth));
  return h(
    'button',
    {
      key: row.id,
      type: 'button',
      role: 'menuitem',
      className: 'dsh-rs-row',
      'data-sub': 'true',
      'data-depth': String(depth),
      onClick: () => onPick(row.id),
    },
    h('span', { className: 'dsh-rs-dot', 'data-live': 'true' }),
    h('span', { className: 'dsh-rs-main' }, h('span', { className: 'dsh-rs-title' }, row.title)),
    config.showPending && row.pending ? h('span', { className: 'dsh-rs-pending' }, t(row.pending)) : null,
  );
}

module.exports = { renderSessionRow, renderSubagentRow };
    });

    define("view/settings", function (module, exports, require) {
/**
 * The settings panel.
 *
 * A pure view over the option bag: it renders the current values and calls back
 * with a patch, and never keeps its own copy of the options.
 *
 * `TOGGLE_KEYS` decides the row order, `LABELS` maps each option to its copy. The
 * two are separate so the panel can list options in a deliberate order without
 * the dictionary inheriting option names as keys.
 */
const { element } = require('../platform');
const { TOGGLE_KEYS, RECENT_CHOICES, DEFAULT_CONFIG } = require('../config');
const { settingsIcon, backIcon } = require('./icons');

const h = element;

/**
 * Option key → dictionary key.
 *
 * Kept as an explicit table rather than derived from the key name: the option
 * bag is an implementation detail, and a dictionary whose keys track it exactly
 * would rename user-facing copy every time an option is renamed.
 */
const LABELS = {
  showWhenIdle: 'settings.idle',
  showWorkspace: 'settings.workspace',
  showTime: 'settings.time',
  showPending: 'settings.pending',
  subagentActivity: 'settings.subagentActive',
  subagentRows: 'settings.subagentRows',
};

/** Panel rows from this key onward form the subagent-policy group. */
const SUBAGENT_KEYS = ['subagentActivity', 'subagentRows'];

/** The dictionary key for one option name. */
function labelKey(key) {
  return LABELS[key] || 'settings.' + key;
}

/** One label/control row. */
function settingsRow(key, label, control) {
  return h(
    'div',
    { className: 'dsh-rs-setRow', key },
    h('span', null, label),
    control,
  );
}

/** A boolean switch bound to one option. */
function toggle(key, value, t, onChange) {
  return h('button', {
    type: 'button',
    className: 'dsh-rs-switch',
    role: 'switch',
    'aria-checked': value ? 'true' : 'false',
    'aria-label': t(labelKey(key)),
    'data-on': value ? 'true' : 'false',
    onClick: () => onChange({ [key]: !value }),
  });
}

/** "Recently finished" segmented control. */
function recentSegments(config, t, onChange) {
  return h(
    'div',
    { className: 'dsh-rs-seg', role: 'group', 'aria-label': t('settings.recent') },
    RECENT_CHOICES.map((choice) =>
      h(
        'button',
        {
          key: choice,
          type: 'button',
          className: 'dsh-rs-segBtn',
          'data-on': config.recentLimit === choice ? 'true' : 'false',
          'aria-pressed': config.recentLimit === choice ? 'true' : 'false',
          onClick: () => onChange({ recentLimit: choice }),
        },
        choice === 0 ? t('settings.off') : String(choice),
      ),
    ),
  );
}

/**
 * The panel header: title plus the back/settings affordance.
 * @param settingsOpen - whether the panel (not the list) is showing
 */
function renderHeader(settingsOpen, hintVisible, counts, t, onToggleSettings) {
  return h(
    'div',
    { className: 'dsh-rs-head' },
    h(
      'div',
      { className: 'dsh-rs-headMain' },
      h('span', null, settingsOpen ? t('settings.title') : t('list.title')),
      !settingsOpen && hintVisible && counts.main > 0
        ? h('span', { className: 'dsh-rs-headHint' }, t('list.hint'))
        : null,
    ),
    h(
      'button',
      {
        type: 'button',
        className: 'dsh-rs-iconBtn',
        'aria-label': settingsOpen ? t('settings.back') : t('settings.open'),
        title: settingsOpen ? t('settings.back') : t('settings.open'),
        onClick: onToggleSettings,
      },
      settingsOpen ? backIcon() : settingsIcon(),
    ),
  );
}

/** The settings panel body. */
function renderSettings(config, t, onChange) {
  const rows = [];
  let sawSubagentGroup = false;
  for (const key of TOGGLE_KEYS) {
    const isSubagent = SUBAGENT_KEYS.indexOf(key) !== -1;
    // Split the boolean list where the subagent policy starts.
    if (isSubagent && !sawSubagentGroup) {
      sawSubagentGroup = true;
      rows.push(h('div', { key: 'divSubagents', className: 'dsh-rs-divider', role: 'separator' }));
    }
    rows.push(settingsRow(key, t(labelKey(key)), toggle(key, config[key], t, onChange)));
    if (key === 'showWhenIdle') {
      rows.push(settingsRow('recent', t('settings.recent'), recentSegments(config, t, onChange)));
    }
  }
  rows.push(h('div', { key: 'divReset', className: 'dsh-rs-divider', role: 'separator' }));
  rows.push(
    h(
      'button',
      {
        key: 'reset',
        type: 'button',
        className: 'dsh-rs-reset',
        onClick: () => onChange(DEFAULT_CONFIG),
      },
      t('settings.reset'),
    ),
  );
  return h('div', { className: 'dsh-rs-set' }, rows);
}

module.exports = { renderHeader, renderSettings };
    });
    return load("main").createPlugin(require);
  },
});
