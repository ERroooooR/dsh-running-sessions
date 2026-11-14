/**
 * One session row in the menu.
 *
 * A row is a `<button>` because it navigates. The dot on the left encodes the
 * two states the menu distinguishes: live (still running) and done (recently
 * finished).
 *
 * Two shapes share this module. A session row is the full form: title plus a
 * meta line (workspace or owner, and elapsed time). A subagent row is the compact
 * form: title only, one line, indented under the session it belongs to, because
 * its owner is already the row above it — repeating that on every child would be
 * noise, and the shorter rows keep a busy fan-out from stretching the menu.
 */
const { element } = require('../platform');
const { agoText } = require('../time');

const h = element;

/**
 * @param row - `{ id, title, workspace, pending, updatedAt }`
 * @param done - render as already finished
 * @param config - normalized options, for the meta line
 * @param t - translator
 * @param now - timestamp used for the relative label
 * @param onPick - `(id) => void`
 */
function renderSessionRow(row, done, config, t, now, onPick) {
  const showMeta = config.showWorkspace || config.showTime;
  const meta = [];
  if (config.showWorkspace && row.workspace) {
    meta.push(h('span', { key: 'ws', className: 'dsh-rs-ws' }, row.workspace));
  }
  if (config.showTime) {
    // The separator belongs between two meta cells, so it appears only when the
    // time cell follows a workspace cell.
    if (meta.length > 0) meta.push(h('span', { key: 'sep', className: 'dsh-rs-sep' }, '·'));
    meta.push(h('span', { key: 'ago' }, agoText(t, row.updatedAt, now)));
  }
  return h(
    'button',
    {
      key: row.id,
      type: 'button',
      role: 'menuitem',
      className: 'dsh-rs-row',
      'data-sub': 'false',
      onClick: () => onPick(row.id),
    },
    h('span', { className: 'dsh-rs-dot', 'data-live': done ? 'false' : 'true' }),
    h(
      'span',
      { className: 'dsh-rs-main' },
      // `buildRows` always resolves a title, falling back to the session id, so
      // this is never empty and needs no placeholder copy of its own.
      h('span', { className: 'dsh-rs-title' }, row.title),
      showMeta && meta.length > 0 ? h('span', { className: 'dsh-rs-meta' }, meta) : null,
    ),
    config.showPending && row.pending ? h('span', { className: 'dsh-rs-pending' }, t(row.pending)) : null,
  );
}

/**
 * A subagent row: one line, indented by nesting depth.
 *
 * No meta line on purpose — the owning session is the row directly above, so the
 * indent and the outline carry the relationship. The indent is capped so a deep
 * chain cannot push a title off the right edge.
 *
 * @param row - `{ id, title, depth }`
 * @param cap - deepest indent level the layout will show
 */
function renderSubagentRow(row, cap, config, t, onPick) {
  const depth = Math.max(1, Math.min(cap, row.depth));
  return h(
    'button',
    {
      key: row.id,
      type: 'button',
      role: 'menuitem',
      className: 'dsh-rs-row',
      'data-sub': 'true',
      'data-depth': String(depth),
      onClick: () => onPick(row.id),
    },
    h('span', { className: 'dsh-rs-dot', 'data-live': 'true' }),
    h('span', { className: 'dsh-rs-main' }, h('span', { className: 'dsh-rs-title' }, row.title)),
    config.showPending && row.pending ? h('span', { className: 'dsh-rs-pending' }, t(row.pending)) : null,
  );
}

module.exports = { renderSessionRow, renderSubagentRow };
