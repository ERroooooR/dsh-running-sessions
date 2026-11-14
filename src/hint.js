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
