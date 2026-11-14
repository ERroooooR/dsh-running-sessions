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
