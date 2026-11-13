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
.dsh-rs-pill{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;font-weight:500;line-height:1;cursor:pointer;transition:background .12s ease,border-color .12s ease}
.dsh-rs-pill:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsh-rs-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-rs-pill[data-open=true]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.dsh-rs-pill[data-empty=true]{color:var(--dsw-alias-label-secondary)}
.dsh-rs-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}
.dsh-rs-dot[data-live=true]{background:var(--dsw-alias-state-success-primary);animation:dsh-rs-pulse 1.8s ease-in-out infinite}
@keyframes dsh-rs-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.dsh-rs-count{font-variant-numeric:tabular-nums}
.dsh-rs-caret{font-size:8px;line-height:1;opacity:.55;transform:translateY(.5px)}
.dsh-rs-menu{position:fixed;z-index:2147483000;box-sizing:border-box;padding:6px;display:flex;flex-direction:column;gap:2px;max-height:min(60vh,420px);overflow:auto;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 32px rgba(0,0,0,.18)}
.dsh-rs-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:4px 8px 6px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dsh-rs-headHint{opacity:.7}
.dsh-rs-row{display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;padding:7px 8px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer}
.dsh-rs-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-rs-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-rs-row .dsh-rs-dot{margin-top:5px}
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

    /**
     * Running rows, newest activity first. A session counts as running from the
     * status snapshot, falling back to the roster's own flag.
     */
    function readRows(sessions, status, workspaces) {
      if (!sessions || !sessions.ids) return [];
      const archived = new Set((workspaces && workspaces.archivedSessionIds) || []);
      const owner = new Map();
      for (const workspace of (workspaces && workspaces.items) || []) {
        for (const sessionId of workspace.sessionIds || []) owner.set(sessionId, workspace.title || '');
      }
      const rows = [];
      for (const sessionId of sessions.ids) {
        const session = sessions.byId[sessionId];
        if (!session || archived.has(sessionId)) continue;
        const state = status ? status.get(sessionId) : undefined;
        const running = state && typeof state.running === 'boolean' ? state.running : session.running === true;
        if (!running) continue;
        const interaction = state && state.pendingInteraction ? state.pendingInteraction.kind : '';
        rows.push({
          id: sessionId,
          title: (typeof session.title === 'string' && session.title.trim()) || session.displayTitle || '',
          workspace: owner.get(sessionId) || '',
          pending: interaction,
          updatedAt: typeof session.updatedAt === 'number' ? session.updatedAt : 0,
        });
      }
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      return rows;
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

    function RunningSessionsPill(props) {
      const t = resolveT(props);
      const sessions = props.useSessions((snapshot) => snapshot);
      const status = props.useSessionStatus((snapshot) => snapshot);
      const workspaces = props.useWorkspaces((snapshot) => snapshot);

      const [open, setOpenState] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const openRef = React.useRef(false);
      const buttonRef = React.useRef(null);
      const menuRef = React.useRef(null);

      /** The ref is the source of truth so a fast pointer sequence cannot flip twice. */
      const setOpen = React.useCallback((next) => {
        if (openRef.current === next) return;
        openRef.current = next;
        setOpenState(next);
      }, []);

      const rows = React.useMemo(
        () => readRows(sessions, status, workspaces),
        [sessions, status, workspaces],
      );
      const count = rows.length;

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
      }, [open, rows.length, place]);

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
        if (!runtime || !runtime.uiWorkspace) return;
        try {
          runtime.uiWorkspace.openSession(sessionId);
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
          h('span', { className: 'dsh-rs-caret', 'aria-hidden': 'true' }, '▼'),
        ),
      );

      if (!open) return h(React.Fragment, null, styleElement, pill);

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
          : rows.map((row) =>
              h(
                'button',
                {
                  key: row.id,
                  type: 'button',
                  role: 'menuitem',
                  className: 'dsh-rs-row',
                  onClick: () => switchTo(row.id),
                },
                h('span', { className: 'dsh-rs-dot', 'data-live': 'true' }),
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
                row.pending
                  ? h('span', { className: 'dsh-rs-pending' }, pendingText(t, row.pending))
                  : null,
              ),
            ),
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
      inject: ['slots', 'locale'],
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
