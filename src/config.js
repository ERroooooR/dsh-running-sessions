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
