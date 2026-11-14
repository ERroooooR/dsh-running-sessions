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
