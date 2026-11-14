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
