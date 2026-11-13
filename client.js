window.__ModuleLoader__.load({
  id: '@local/running-sessions',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'pill.label': '运行中',
      'pill.count': '{count} 个',
      'pill.aria': '正在运行的会话：{count} 个',
      'pill.empty.aria': '当前没有正在运行的会话',
      'list.title': '正在运行的会话',
      'list.hint': '点击即切换',
      'list.recent': '最近完成',
      'list.empty': '现在没有正在运行的会话',
      'row.untitled': '未命名会话',
      'row.pending.approval': '等待授权',
      'row.pending.plan': '等待确认计划',
      'row.pending.question': '等待回答',
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
      'settings.off': '关闭',
      'settings.reset': '恢复默认',
    };

    /** English dictionary, key-identical to the Chinese source of truth. */
    const en = {
      'pill.label': 'Running',
      'pill.count': '{count}',
      'pill.aria': 'Running sessions: {count}',
      'pill.empty.aria': 'No session is running',
      'list.title': 'Running sessions',
      'list.hint': 'Click to switch',
      'list.recent': 'Recently finished',
      'list.empty': 'No session is running right now',
      'row.untitled': 'Untitled session',
      'row.pending.approval': 'Waiting for approval',
      'row.pending.plan': 'Waiting for plan review',
      'row.pending.question': 'Waiting for an answer',
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
      'settings.off': 'Off',
      'settings.reset': 'Reset to defaults',
    };

    /**
     * Injected once from `apply`, not rendered by the component: a per-render <style>
     * element would be diffed on every session update (the roster snapshot changes on
     * every streamed token).
     */
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
.dsh-rs-caret{display:block;flex:none;color:var(--dsw-alias-label-secondary);transition:transform .12s ease}
.dsh-rs-pill[data-open=true] .dsh-rs-caret{transform:rotate(180deg)}
.dsh-rs-menu{position:fixed;z-index:2147483000;box-sizing:border-box;padding:6px;display:flex;flex-direction:column;gap:1px;max-height:min(60vh,420px);overflow:auto;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-overlay));box-shadow:0 8px 24px rgba(0,0,0,.12)}
.dsh-rs-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px 6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dsh-rs-headSub{padding-top:2px}
.dsh-rs-headMain{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-rs-headHint{opacity:.7}
.dsh-rs-iconBtn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit}
.dsh-rs-iconBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-rs-iconBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-rs-divider{height:.5px;flex:none;margin:4px 6px 2px;background:var(--dsw-alias-border-l1)}
.dsh-rs-row{display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}
.dsh-rs-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-rs-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-rs-row .dsh-rs-dot{margin-top:6px}
.dsh-rs-row[data-current=true] .dsh-rs-title{color:var(--dsw-alias-brand-primary)}
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

    /** The client root context, kept so a row click can navigate. */
    let runtime = null;

    /** Styles are global, so they are pushed exactly once per page load. */
    let stylesInjected = false;
    function injectStyles(ctx) {
      if (stylesInjected) return;
      stylesInjected = true;
      try {
        if (ctx && ctx.styles && typeof ctx.styles.insert === 'function') {
          ctx.styles.insert(CSS);
          return;
        }
      } catch (error) {
        console.error('[running-sessions] styles.insert failed', error);
      }
      try {
        if (document.querySelector('style[data-dsh-running-sessions]')) return;
        const style = document.createElement('style');
        style.setAttribute('data-dsh-running-sessions', '');
        style.textContent = CSS;
        document.head.appendChild(style);
      } catch (error) {
        console.error('[running-sessions] style fallback failed', error);
      }
    }

    /**
     * User options. Kept in localStorage rather than in the profile, so switching a
     * toggle never rewrites profile files: the value is read once per page load and
     * published to every mounted instance through `configCache`.
     */
    const CONFIG_KEY = 'dsh-running-sessions:config';
    const DEFAULT_CONFIG = {
      showWhenIdle: false,
      recentLimit: 3,
      showWorkspace: true,
      showTime: true,
      showPending: true,
    };
    const RECENT_CHOICES = [0, 1, 3, 5];
    let configCache = null;

    function clampInt(value, min, max) {
      const number = Math.round(Number(value));
      if (!Number.isFinite(number)) return min;
      return Math.min(max, Math.max(min, number));
    }

    function normalizeConfig(raw) {
      const next = Object.assign({}, DEFAULT_CONFIG);
      if (!raw || typeof raw !== 'object') return next;
      if (typeof raw.showWhenIdle === 'boolean') next.showWhenIdle = raw.showWhenIdle;
      if (typeof raw.showWorkspace === 'boolean') next.showWorkspace = raw.showWorkspace;
      if (typeof raw.showTime === 'boolean') next.showTime = raw.showTime;
      if (typeof raw.showPending === 'boolean') next.showPending = raw.showPending;
      if (raw.recentLimit !== undefined) next.recentLimit = clampInt(raw.recentLimit, 0, 10);
      return next;
    }

    function readConfig() {
      if (configCache) return configCache;
      let stored = null;
      try {
        stored = JSON.parse(window.localStorage.getItem(CONFIG_KEY) || 'null');
      } catch (error) {
        stored = null;
      }
      configCache = normalizeConfig(stored);
      return configCache;
    }

    function writeConfig(next) {
      configCache = next;
      try {
        window.localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
      } catch (error) {
        console.error('[running-sessions] could not persist settings', error);
      }
    }

    function resolveT(props) {
      const supplied = props && props.t;
      if (typeof supplied === 'function') return supplied;
      return (key, params) => {
        const template = zh[key] !== undefined ? zh[key] : en[key] !== undefined ? en[key] : key;
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
      };
    }

    function isRunning(session, state) {
      if (state && typeof state.running === 'boolean') return state.running;
      return session.running === true;
    }

    /** Cheap pass used by the pill itself: no row objects, only the count. */
    function countRunning(sessions, status, workspaces) {
      if (!sessions || !sessions.ids) return 0;
      const archivedIds = (workspaces && workspaces.archivedSessionIds) || null;
      const archived = archivedIds && archivedIds.length ? new Set(archivedIds) : null;
      let count = 0;
      for (const sessionId of sessions.ids) {
        const session = sessions.byId[sessionId];
        if (!session) continue;
        if (archived && archived.has(sessionId)) continue;
        const state = status ? status.get(sessionId) : undefined;
        if (isRunning(session, state)) count += 1;
      }
      return count;
    }

    /**
     * Build the two menu groups: sessions that are running now, and the most recently
     * active ones that already finished. Only called while the menu is open.
     */
    function buildRows(sessions, status, workspaces, config) {
      const empty = { running: [], recent: [], more: 0 };
      if (!sessions || !sessions.ids) return empty;
      const archivedIds = (workspaces && workspaces.archivedSessionIds) || null;
      const archived = archivedIds && archivedIds.length ? new Set(archivedIds) : null;
      const owner = new Map();
      if (config.showWorkspace) {
        for (const workspace of (workspaces && workspaces.items) || []) {
          for (const sessionId of workspace.sessionIds || []) owner.set(sessionId, workspace.title || '');
        }
      }
      const running = [];
      const recent = [];
      for (const sessionId of sessions.ids) {
        const session = sessions.byId[sessionId];
        if (!session) continue;
        if (archived && archived.has(sessionId)) continue;
        const state = status ? status.get(sessionId) : undefined;
        const live = isRunning(session, state);
        const row = {
          id: sessionId,
          title: (typeof session.title === 'string' && session.title.trim()) || session.displayTitle || '',
          workspace: owner.get(sessionId) || '',
          pending: live && state && state.pendingInteraction ? state.pendingInteraction.kind : '',
          updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : 0,
        };
        (live ? running : recent).push(row);
      }
      running.sort((a, b) => b.updatedAt - a.updatedAt);
      const limit = config.recentLimit;
      let recentRows = [];
      if (limit > 0) {
        recent.sort((a, b) => b.updatedAt - a.updatedAt);
        recentRows = recent.slice(0, limit);
      }
      return { running, recent: recentRows, more: Math.max(0, recent.length - recentRows.length) };
    }

    function agoText(t, timestamp, now) {
      if (!timestamp) return '';
      const diff = now - timestamp;
      if (diff < 60000) return t('ago.now');
      const minutes = Math.floor(diff / 60000);
      if (minutes < 60) return t('ago.minutes', { count: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t('ago.hours', { count: hours });
      return t('ago.days', { count: Math.floor(hours / 24) });
    }

    function pendingText(t, pending) {
      if (pending === 'approval') return t('row.pending.approval');
      if (pending === 'plan-review') return t('row.pending.plan');
      if (pending === 'question') return t('row.pending.question');
      return '';
    }

    /**
     * The conversation header is re-created whenever the active session changes, so a
     * plain component state would drop an already-open menu on the floor. The flag is
     * therefore kept at module scope — but only for a moment, so a later remount does
     * not resurrect a stale menu.
     */
    let openAcrossMounts = { at: 0, open: false };
    const OPEN_REVIVE_MS = 3000;

    function RunningSessionsPill(props) {
      const t = resolveT(props);
      const sessions = props.useSessions((snapshot) => snapshot);
      const status = props.useSessionStatus((snapshot) => snapshot);
      const workspaces = props.useWorkspaces((snapshot) => snapshot);

      const revived = openAcrossMounts.open && Date.now() - openAcrossMounts.at < OPEN_REVIVE_MS;
      const [open, setOpenState] = React.useState(revived);
      const [settingsOpen, setSettingsOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const [config, setConfig] = React.useState(readConfig);
      const [now, setNow] = React.useState(() => Date.now());
      const openRef = React.useRef(revived);
      const buttonRef = React.useRef(null);
      const menuRef = React.useRef(null);

      /** The ref is the source of truth so a fast pointer sequence cannot flip twice. */
      const setOpen = React.useCallback((next) => {
        if (openRef.current === next) return;
        openRef.current = next;
        openAcrossMounts = { at: Date.now(), open: next };
        setOpenState(next);
        if (!next) setSettingsOpen(false);
      }, []);

      // The roster snapshot changes on every streamed token; the pill only needs the
      // number, so keep the expensive group build behind `open`.
      const count = React.useMemo(
        () => countRunning(sessions, status, workspaces),
        [sessions, status, workspaces],
      );
      const groups = React.useMemo(
        () => (open ? buildRows(sessions, status, workspaces, config) : null),
        [open, sessions, status, workspaces, config],
      );

      const updateConfig = React.useCallback((patch) => {
        const next = normalizeConfig(Object.assign({}, readConfig(), patch));
        writeConfig(next);
        setConfig(next);
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
       */
      React.useEffect(() => {
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
          setOpen(!openRef.current);
        };
        window.addEventListener('pointerdown', onCapture, true);
        window.addEventListener('click', onCapture, true);
        return () => {
          window.removeEventListener('pointerdown', onCapture, true);
          window.removeEventListener('click', onCapture, true);
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
        const viewportWidth = window.innerWidth || 1280;
        const viewportHeight = window.innerHeight || 800;
        const width = Math.min(340, Math.max(240, viewportWidth - 16));
        const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
        const menu = menuRef.current;
        const height = menu ? menu.getBoundingClientRect().height : 0;
        let top = rect.bottom + 6;
        if (height > 0 && top + height > viewportHeight - 8) {
          const above = rect.top - 6 - height;
          top = above >= 8 ? above : Math.max(8, viewportHeight - 8 - height);
        }
        setPos({ left, top, width });
      }, []);

      React.useLayoutEffect(() => {
        if (!open) {
          setPos(null);
          return;
        }
        place();
        // Re-place only when the menu's size can actually change; the roster snapshot
        // itself updates on every streamed token.
      }, [open, settingsOpen, count, groups ? groups.recent.length : 0, place]);

      React.useEffect(() => {
        if (!open) return undefined;
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
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', onResize);
        // No scroll dismissal: a streaming session scrolls the transcript constantly,
        // and the menu is position:fixed so it stays put anyway.
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown, true);
          window.removeEventListener('resize', onResize);
        };
      }, [open, setOpen]);

      const switchTo = React.useCallback(
        (sessionId) => {
          setOpen(false);
          if (!runtime) return;
          // `ctx.uiWorkspace` is a hard dependency (declared in inject); the `get`
          // form is the optional access shape and covers a late-registered service.
          const workspace =
            runtime.uiWorkspace ||
            (typeof runtime.get === 'function' ? runtime.get('uiWorkspace') : undefined);
          if (!workspace || typeof workspace.openSession !== 'function') {
            console.error('[running-sessions] uiWorkspace service unavailable');
            return;
          }
          try {
            workspace.openSession(sessionId);
          } catch (error) {
            console.error('[running-sessions] openSession failed', error);
          }
        },
        [setOpen],
      );

      const pillHidden = count === 0 && !open && !config.showWhenIdle;
      if (pillHidden) return null;

      const label = count === 0 ? t('pill.empty.aria') : t('pill.aria', { count });

      const pill = h(
        'div',
        { className: 'dsh-rs-root' },
        h(
          'button',
          {
            type: 'button',
            ref: buttonRef,
            className: 'dsh-rs-pill',
            'data-open': open ? 'true' : 'false',
            'data-empty': count === 0 ? 'true' : 'false',
            'aria-haspopup': 'menu',
            'aria-expanded': open ? 'true' : 'false',
            'aria-label': label,
            title: count === 0 ? t('pill.empty.aria') : t('list.title'),
            onPointerDown: (event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(!openRef.current);
            },
            onKeyDown: (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              setOpen(!openRef.current);
            },
          },
          h('span', { className: 'dsh-rs-dot', 'data-live': count > 0 ? 'true' : 'false' }),
          h('span', null, t('pill.label')),
          h('span', { className: 'dsh-rs-count' }, t('pill.count', { count })),
          h(
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
          ),
        ),
      );

      if (!open) return pill;

      const renderRow = (row, done) =>
        h(
          'button',
          {
            key: row.id,
            type: 'button',
            role: 'menuitem',
            className: 'dsh-rs-row',
            onClick: () => switchTo(row.id),
          },
          h('span', { className: 'dsh-rs-dot', 'data-live': done ? 'false' : 'true' }),
          h(
            'span',
            { className: 'dsh-rs-main' },
            h('span', { className: 'dsh-rs-title' }, row.title || t('row.untitled')),
            config.showWorkspace || config.showTime
              ? h(
                  'span',
                  { className: 'dsh-rs-meta' },
                  config.showWorkspace && row.workspace
                    ? h(
                        React.Fragment,
                        null,
                        h('span', { className: 'dsh-rs-ws' }, row.workspace),
                        h('span', { className: 'dsh-rs-sep' }, '·'),
                      )
                    : null,
                  config.showTime ? h('span', null, agoText(t, row.updatedAt, now)) : null,
                )
              : null,
          ),
          config.showPending && row.pending
            ? h('span', { className: 'dsh-rs-pending' }, pendingText(t, row.pending))
            : null,
        );

      const settingsRow = (key, label, control) =>
        h(
          'div',
          { className: 'dsh-rs-setRow', key },
          h('span', null, label),
          control,
        );

      const toggle = (key, value) =>
        h('button', {
          type: 'button',
          className: 'dsh-rs-switch',
          role: 'switch',
          'aria-checked': value ? 'true' : 'false',
          'aria-label': t('settings.' + key),
          'data-on': value ? 'true' : 'false',
          onClick: () => updateConfig({ [key]: !value }),
        });

      const recentSegments = h(
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
              onClick: () => updateConfig({ recentLimit: choice }),
            },
            choice === 0 ? t('settings.off') : String(choice),
          ),
        ),
      );

      const gearIcon = h(
        'svg',
        { width: 13, height: 13, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
        h('path', {
          d: 'M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Zm5.2 2.4c0-.3 0-.6-.1-.9l1.4-1.1-1.3-2.2-1.7.7a5.4 5.4 0 0 0-1.5-.9L9.6 1.6H6.4L6 3.6c-.5.2-1 .5-1.5.9l-1.7-.7L1.5 6l1.4 1.1a5.6 5.6 0 0 0 0 1.8L1.5 10l1.3 2.2 1.7-.7c.5.4 1 .7 1.5.9l.4 2h3.2l.4-2c.5-.2 1-.5 1.5-.9l1.7.7 1.3-2.2-1.4-1.1c.1-.3.1-.6.1-.9Z',
          fill: 'currentColor',
        }),
      );

      const menu = h(
        'div',
        {
          ref: menuRef,
          className: 'dsh-rs-menu',
          role: 'dialog',
          'aria-label': settingsOpen ? t('settings.title') : t('list.title'),
          style: {
            left: pos ? pos.left : -9999,
            top: pos ? pos.top : 0,
            width: pos ? pos.width : 320,
            visibility: pos ? 'visible' : 'hidden',
          },
        },
        h(
          'div',
          { className: 'dsh-rs-head' },
          h(
            'div',
            { className: 'dsh-rs-headMain' },
            h('span', null, settingsOpen ? t('settings.title') : t('list.title')),
            !settingsOpen && count > 0 ? h('span', { className: 'dsh-rs-headHint' }, t('list.hint')) : null,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-rs-iconBtn',
              'aria-label': settingsOpen ? t('settings.back') : t('settings.open'),
              title: settingsOpen ? t('settings.back') : t('settings.open'),
              onClick: () => setSettingsOpen(!settingsOpen),
            },
            settingsOpen
              ? h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
                  h('path', {
                    d: 'M10 3.5 5.5 8 10 12.5',
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: 1.6,
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  }))
              : gearIcon,
          ),
        ),
        settingsOpen
          ? h(
              'div',
              { className: 'dsh-rs-set' },
              settingsRow('idle', t('settings.idle'), toggle('showWhenIdle', config.showWhenIdle)),
              settingsRow('recent', t('settings.recent'), recentSegments),
              settingsRow('workspace', t('settings.workspace'), toggle('showWorkspace', config.showWorkspace)),
              settingsRow('time', t('settings.time'), toggle('showTime', config.showTime)),
              settingsRow('pending', t('settings.pending'), toggle('showPending', config.showPending)),
            )
          : [
              count === 0
                ? h('div', { key: 'empty', className: 'dsh-rs-empty' }, t('list.empty'))
                : groups.running.map((row) => renderRow(row, false)),
              groups.recent.length > 0
                ? h('div', { key: 'divider', className: 'dsh-rs-divider', role: 'separator' })
                : null,
              groups.recent.length > 0
                ? h(
                    'div',
                    { key: 'recentHead', className: 'dsh-rs-head dsh-rs-headSub' },
                    h('span', null, t('list.recent')),
                  )
                : null,
              groups.recent.map((row) => renderRow(row, true)),
            ],
      );

      return h(React.Fragment, null, pill, createPortal(menu, document.body));
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        runtime = ctx;
        injectStyles(ctx);
        ctx.effect(
          () => ctx.locale.register('runningSessions', { zh, en }),
          'running-sessions: dictionaries',
        );
        ctx.slots.inject('conversation.header.leading', () =>
          ctx.slots.register(
            {
              name: 'conversation.header.leading',
              id: 'running-sessions',
              order: 10,
              locale: 'runningSessions',
            },
            RunningSessionsPill,
          ),
        );
      },
    };
  },
});
