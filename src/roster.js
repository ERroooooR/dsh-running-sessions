/**
 * Roster classification: which sessions are main agents, which are subagents,
 * and which session owns which.
 *
 * Every subagent runs in its own DSH session, and the Host list flattens them
 * beside ordinary sessions — that is what turned one busy conversation into a
 * crowd of near-empty "running sessions". Classification therefore follows
 * proven lineage only:
 *
 * - a row's durable `origin: 'subagent'` + `parentId` is authoritative;
 * - a parent's `subagentCatalog` projection names children that may not have
 *   reached the Host list yet;
 * - an ordinary fork keeps a parent id without being a subagent, so a bare
 *   parent id is never treated as subagent evidence;
 * - a subagent whose parent is not loaded stays a subagent (never promoted to a
 *   top-level session row) and is left out of the menu when its owner is not
 *   rendered;
 * - a blank session holds no conversation yet (the "New Session" tab), so it is
 *   not a session row at all — the official sidebar hides it for the same reason.
 *
 * The result is a plain data structure, not a class: the callers are pure
 * functions over a snapshot, and a snapshot is replaced wholesale on each
 * streamed token.
 */

const contract = require('./contract');

/**
 * @typedef {object} RosterIndex
 * @property {string[]} ids ordered rows: Host-list members, then retained subagent fallbacks
 * @property {object} byId row lookup (the raw snapshot bag)
 * @property {Map<string,string>} parentOf child → parent edges, when the parent is loaded
 * @property {Map<string,string[]>} childrenOf parent → children edges
 * @property {string[]} subagentIds subagent rows in `ids` order
 * @property {(id: string) => boolean} isSubagent
 * @property {(id: string) => string} rootOf topmost loaded ancestor of an id
 */

/** An index that reports "everything is a plain top-level session". */
function emptyIndex() {
  return {
    ids: [],
    byId: {},
    parentOf: new Map(),
    childrenOf: new Map(),
    subagentIds: [],
    isSubagent: () => false,
    rootOf: (id) => id,
  };
}

/**
 * Classify a session snapshot.
 * @param sessions - `{ ids, byId, projectionsBySession }` from `useSessions`
 * @returns {RosterIndex}
 */
function classifySessions(sessions) {
  const result = emptyIndex();
  const byId = contract.rows(sessions);
  if (!byId) return result;

  const hostIds = contract.hostOrder(sessions);
  // A blank row holds no conversation yet, so it is not a session row and cannot
  // act as a parent either: a subagent whose parent is blank degrades to the
  // orphan case below instead of pointing at a row that is never rendered.
  const known = (id) =>
    typeof id === 'string' && byId[id] !== undefined && !contract.isBlankRow(byId[id]);
  const subagents = new Set();

  const link = (childId, parentId) => {
    if (!known(childId) || childId === parentId) return;
    subagents.add(childId);
    if (!known(parentId)) return;
    if (!result.parentOf.has(childId)) result.parentOf.set(childId, parentId);
    const siblings = result.childrenOf.get(parentId);
    if (!siblings) result.childrenOf.set(parentId, [childId]);
    else if (siblings.indexOf(childId) === -1) siblings.push(childId);
  };

  // `byId` carries retained subagent fallbacks that `ids` does not, so scan the
  // rows rather than Host-list order.
  for (const id of Object.keys(byId)) {
    const entry = byId[id];
    if (contract.isSubagentRow(entry)) link(id, contract.parentIdOf(entry));
  }
  // The projection names children the list may not carry yet.
  for (const [parentId, entry] of contract.catalogEntries(sessions)) {
    if (!contract.catalogEntryHasSession(entry)) continue;
    link(entry.id, parentId);
  }

  const ordered = [];
  const seen = new Set();
  for (const id of hostIds) {
    if (!known(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  // Only `ids` expresses Host-list membership; extra `byId` rows are retained
  // subagent fallbacks, and anything else there is not a session row yet.
  for (const id of Object.keys(byId)) {
    if (seen.has(id) || !subagents.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  result.ids = ordered;
  result.byId = byId;
  result.subagentIds = ordered.filter((id) => subagents.has(id));
  result.isSubagent = (id) => subagents.has(id);
  result.rootOf = (id) => {
    let current = id;
    const visited = new Set();
    while (!visited.has(current)) {
      visited.add(current);
      const parent = result.parentOf.get(current);
      if (parent === undefined) break;
      current = parent;
    }
    return current;
  };
  return result;
}

/**
 * Running state for one classified roster.
 *
 * `own` is a session's own turn; `active` folds subagent activity upward while
 * `subagentActivity` is on, so a session whose own turn reads idle but whose
 * subagents are working still counts as running — the "main agent quiet,
 * subagent busy" case.
 *
 * @param index - from `classifySessions`
 * @param status - `Map<id, SessionStatus>`
 * @param config - normalized option bag
 */
function resolveActivity(index, status, config) {
  const own = new Map();
  const active = new Map();

  const ownRunning = (id) => {
    if (own.has(id)) return own.get(id);
    const state = status ? status.get(id) : undefined;
    const value = contract.isRunning(index.byId[id] || {}, state);
    own.set(id, value);
    return value;
  };

  const compute = (id, seen) => {
    if (active.has(id)) return active.get(id);
    // A cycle degrades to "own state only" rather than spinning.
    if (seen.has(id)) return ownRunning(id);
    seen.add(id);
    let value = ownRunning(id);
    if (!value && config.subagentActivity) {
      for (const child of index.childrenOf.get(id) || []) {
        if (child === id) continue;
        if (compute(child, seen)) {
          value = true;
          break;
        }
      }
    }
    active.set(id, value);
    return value;
  };

  return {
    own: ownRunning,
    active: (id) => compute(id, new Set()),
  };
}

/** Archived session ids as a set, or `null` when nothing is archived. */
function archivedSet(workspaces) {
  const ids = contract.archivedIds(workspaces);
  return ids ? new Set(ids) : null;
}

/**
 * "Should this session's rows be hidden?" Archived sessions disappear from the
 * menu, and an archived main session takes its subagents with it.
 */
function hiddenTest(index, workspaces) {
  const archived = archivedSet(workspaces);
  if (!archived) return () => false;
  return (id) => archived.has(id) || archived.has(index.rootOf(id));
}

module.exports = {
  classifySessions,
  resolveActivity,
  hiddenTest,
};
