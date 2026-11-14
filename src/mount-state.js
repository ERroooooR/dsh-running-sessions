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
