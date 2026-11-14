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
