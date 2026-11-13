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
    };

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
.dsh-rs-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:4px 8px 6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dsh-rs-headSub{padding-top:2px}
.dsh-rs-divider{height:.5px;flex:none;margin:4px 6px 2px;background:var(--dsw-alias-border-l1)}
.dsh-rs-headHint{opacity:.7}
.dsh-rs-row{display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;padding:6px 8px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}
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
`;

    /** The client root context, kept so a row click can navigate. */
    let runtime = null;

    function resolveT(props) {
      const supplied = props && props.t;
      if (typeof supplied === 'function') return supplied;
      return (key, params) => {
        const template = zh[key] !== undefined ? zh[key] : en[key] !== undefined ? en[key] : key;
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
      };
    }

    /** How many finished sessions the menu offers under the running ones. */
    const RECENT_LIMIT = 3;
    /**
     * Build the two menu groups: sessions that are running now, and the most
     * recently active ones that already finished. A session counts as running
     * from the status snapshot, falling back to the roster's own flag.
     */
    function readRows(sessions, status, workspaces) {
      const empty = { running: [], recent: [] };
      if (!sessions || !sessions.ids) return empty;
      const archived = new Set((workspaces && workspaces.archivedSessionIds) || []);
      const owner = new Map();
      for (const workspace of (workspaces && workspaces.items) || []) {
        for (const sessionId of workspace.sessionIds || []) owner.set(sessionId, workspace.title || '');
      }
      const running = [];
      const recent = [];
      for (const sessionId of sessions.ids) {
        const session = sessions.byId[sessionId];
        if (!session || archived.has(sessionId)) continue;
        const state = status ? status.get(sessionId) : undefined;
        const isRunning = state && typeof state.running === 'boolean' ? state.running : session.running === true;
        const row = {
          id: sessionId,
          title: (typeof session.title === 'string' && session.title.trim()) || session.displayTitle || '',
          workspace: owner.get(sessionId) || '',
          pending: isRunning && state && state.pendingInteraction ? state.pendingInteraction.kind : '',
          updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : 0,
        };
        (isRunning ? running : recent).push(row);
      }
      running.sort((a, b) => b.updatedAt - a.updatedAt);
      recent.sort((a, b) => b.updatedAt - a.updatedAt);
      return { running, recent: recent.slice(0, RECENT_LIMIT) };
    }

    function agoText(t, timestamp) {
      if (!timestamp) return '';
      const diff = Date.now() - timestamp;
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

      const revived =
        openAcrossMounts.open && Date.now() - openAcrossMounts.at < OPEN_REVIVE_MS;
      const [open, setOpenState] = React.useState(revived);
      const [pos, setPos] = React.useState(null);
      const openRef = React.useRef(revived);
      const buttonRef = React.useRef(null);
      const menuRef = React.useRef(null);

      /** The ref is the source of truth so a fast pointer sequence cannot flip twice. */
      const setOpen = React.useCallback((next) => {
        if (openRef.current === next) return;
        openRef.current = next;
        openAcrossMounts = { at: Date.now(), open: next };
        setOpenState(next);
      }, []);

      const groups = React.useMemo(
        () => readRows(sessions, status, workspaces),
        [sessions, status, workspaces],
      );
      const running = groups.running;
      const recent = groups.recent;
      const count = running.length;

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
      }, [open]);

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
      }, [open, running.length, recent.length, place]);

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

      const switchTo = React.useCallback((sessionId) => {
        setOpen(false);
        if (!runtime) return;
        // `ctx.uiWorkspace` is a hard dependency (declared in inject); the `get`
        // form is the optional access shape and covers a late-registered service.
        const workspace = runtime.uiWorkspace || (typeof runtime.get === 'function' ? runtime.get('uiWorkspace') : undefined);
        if (!workspace || typeof workspace.openSession !== 'function') {
          console.error('[running-sessions] uiWorkspace service unavailable');
          return;
        }
        try {
          workspace.openSession(sessionId);
        } catch (error) {
          console.error('[running-sessions] openSession failed', error);
        }
      }, []);

      const styleElement = h('style', { key: 'dsh-rs-style' }, CSS);

      let label = count === 0 ? t('pill.empty.aria') : t('pill.aria', { count });

      // Nothing running: keep the header clean rather than showing an empty control.
      if (count === 0 && !open) return h(React.Fragment, null, styleElement);

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

      if (!open) return h(React.Fragment, null, styleElement, pill);

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
            h(
              'span',
              { className: 'dsh-rs-meta' },
              row.workspace
                ? h(React.Fragment, null,
                    h('span', { className: 'dsh-rs-ws' }, row.workspace),
                    h('span', { className: 'dsh-rs-sep' }, '·'))
                : null,
              h('span', null, agoText(t, row.updatedAt)),
            ),
          ),
          row.pending ? h('span', { className: 'dsh-rs-pending' }, pendingText(t, row.pending)) : null,
        );

      const menu = h(
        'div',
        {
          ref: menuRef,
          className: 'dsh-rs-menu',
          role: 'menu',
          'aria-label': t('list.title'),
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
          h('span', null, t('list.title')),
          count > 0 ? h('span', { className: 'dsh-rs-headHint' }, t('list.hint')) : null,
        ),
        count === 0
          ? h('div', { className: 'dsh-rs-empty' }, t('list.empty'))
          : running.map((row) => renderRow(row, false)),
        // Finished sessions stay reachable right below the running ones.
        recent.length > 0
          ? h('div', { className: 'dsh-rs-divider', role: 'separator' })
          : null,
        recent.length > 0
          ? h('div', { className: 'dsh-rs-head dsh-rs-headSub' }, h('span', null, t('list.recent')))
          : null,
        recent.map((row) => renderRow(row, true)),
      );

      return h(
        React.Fragment,
        null,
        styleElement,
        pill,
        createPortal(menu, document.body),
      );
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace'],
      apply(ctx) {
        runtime = ctx;
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
