/**
 * The two numbers the pill shows, and the groups the menu renders.
 *
 * Both are projections of one snapshot rebuilt from scratch on every change, so
 * there is no cache to invalidate and no stale row to reconcile. The split is
 * about cost, not state: `countRunning` is the cheap pass the collapsed pill runs
 * on every streamed token, `buildRows` is the full pass that only runs while the
 * menu is open.
 */
const contract = require('./contract');
const { classifySessions, resolveActivity, hiddenTest } = require('./roster');
const { SUBAGENT_LIMIT } = require('./config');

/**
 * Cheap pass: only the counts.
 *
 * `main` counts main-agent sessions (subagent activity included according to the
 * setting); `sub` counts subagents that are running on their own.
 *
 * @returns {{main: number, sub: number}}
 */
function countRunning(sessions, status, workspaces, config) {
  const index = classifySessions(sessions);
  if (index.ids.length === 0 && index.subagentIds.length === 0) return { main: 0, sub: 0 };
  const activity = resolveActivity(index, status, config);
  const hidden = hiddenTest(index, workspaces);
  let main = 0;
  let sub = 0;
  for (const id of index.ids) {
    if (index.isSubagent(id) || hidden(id)) continue;
    if (activity.active(id)) main += 1;
  }
  for (const id of index.subagentIds) {
    if (hidden(id)) continue;
    if (activity.own(id)) sub += 1;
  }
  return { main, sub };
}

/** Workspace label per session; only built when the menu is open. */
function workspaceOwners(workspaces, config) {
  const owner = new Map();
  if (!config.showWorkspace) return owner;
  for (const workspace of contract.workspaceItems(workspaces)) {
    for (const sessionId of contract.workspaceSessionIds(workspace)) {
      owner.set(sessionId, contract.workspaceTitle(workspace));
    }
  }
  return owner;
}

/**
 * The running subagents of one session, flattened into tree order with a depth.
 *
 * Depth is what expresses the hierarchy: a subagent that spawned its own
 * subagent appears one indent further in, directly under the row it belongs to,
 * so the menu reads as an outline instead of two unrelated lists.
 *
 * A child is listed when there is work anywhere in its subtree — its own turn is
 * running, or something below it is. The second case matters for the outline: an
 * intermediate subagent whose own turn went quiet but whose child is still working
 * has to stay on screen, or its child would be indented under nothing. That is
 * deliberately independent of the `subagentActivity` switch: the switch decides
 * what counts as a running session, not which rows exist.
 */
function runningChildren(index, activity, hidden, titleOf, pendingOf, parentId) {
  const rows = [];
  // One row per session, and no unbounded descent: `childrenOf` is a forest by
  // construction, but a malformed snapshot could still hand back a cycle, and a
  // stack overflow here would take the whole header down with it.
  const seen = new Set([parentId]);
  const walk = (ownerId, depth) => {
    const kids = (index.childrenOf.get(ownerId) || [])
      .filter((id) => !seen.has(id) && index.byId[id] && !hidden(id) && activity.busy(id))
      .sort((left, right) => contract.updatedAtOf(index.byId[right]) - contract.updatedAtOf(index.byId[left]));
    for (const id of kids) {
      seen.add(id);
      rows.push({
        id,
        title: titleOf(id),
        pending: pendingOf(id),
        depth,
        updatedAt: contract.updatedAtOf(index.byId[id]),
      });
      walk(id, depth + 1);
    }
  };
  walk(parentId, 1);
  return rows;
}

/**
 * Build the menu groups: running main-agent sessions and the most recently
 * active main sessions that already ended.
 *
 * Each running session carries its own running subagents as `children`, indented
 * underneath it. They are not a separate section: a subagent belongs to one
 * session, and listing it away from that session was the thing that made the menu
 * confusing.
 *
 * Only called while the menu is open.
 *
 * @returns {{running: object[], recent: object[]}}
 */
function buildRows(sessions, status, workspaces, config) {
  const empty = { running: [], recent: [] };
  const index = classifySessions(sessions);
  if (index.ids.length === 0) return empty;

  const activity = resolveActivity(index, status, config);
  const hidden = hiddenTest(index, workspaces);
  const owner = workspaceOwners(workspaces, config);
  const labels = contract.catalogLabels(sessions);

  const titleOf = (id) => {
    // A subagent session has no title of its own — DSH fills one in from the
    // opening prompt, so the row would read as the first line of the task text.
    // The name the parent gave the child lives in the parent's catalog and is a
    // live projection, so the row keeps up as children are created and renamed.
    const named = labels.get(id);
    if (named) return named;
    const entry = index.byId[id];
    const title = contract.titleOf(entry);
    return title || id;
  };
  const pendingOf = (id) => contract.pendingLabelKey(
    contract.pendingKind(status ? status.get(id) : undefined),
  );
  const rowOf = (id) => ({
    id,
    title: titleOf(id),
    workspace: owner.get(id) || '',
    pending: pendingOf(id),
    updatedAt: contract.updatedAtOf(index.byId[id]),
  });

  const running = [];
  const recent = [];
  for (const id of index.ids) {
    if (!index.byId[id] || hidden(id) || index.isSubagent(id)) continue;
    if (!activity.active(id)) {
      // `active` is false only when the session's own turn is idle and no child
      // was folded in, so anything left here has genuinely finished.
      recent.push(rowOf(id));
      continue;
    }
    const row = rowOf(id);
    if (config.subagentRows) {
      const children = runningChildren({ byId: index.byId, childrenOf: index.childrenOf }, activity, hidden, titleOf, pendingOf, id);
      if (children.length > SUBAGENT_LIMIT) {
        // A large fan-out must not stretch the menu; the remainder is reported
        // under the row it belongs to rather than silently dropped.
        row.children = children.slice(0, SUBAGENT_LIMIT);
        row.moreChildren = children.length - SUBAGENT_LIMIT;
      } else if (children.length > 0) {
        row.children = children;
      }
    }
    running.push(row);
  }

  running.sort((a, b) => b.updatedAt - a.updatedAt);

  const limit = config.recentLimit;
  // No "and 113 more" counter: the finished list is a short convenience, so the
  // capped remainder is not information anyone acts on — it is only noise.
  const recentRows = limit > 0
    ? recent.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
    : [];
  return { running, recent: recentRows };
}

/** The pill is visible when anything runs, or when the user pinned it. */
function pillVisible(counts, open, config) {
  return counts.main + counts.sub > 0 || open || config.showWhenIdle;
}

module.exports = {
  countRunning,
  buildRows,
  pillVisible,
};
