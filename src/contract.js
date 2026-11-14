/**
 * The one place where this plugin names anything that DSH owns.
 *
 * Everything version-fragile lives here: the slot id, the locale namespace, the
 * standard props it reads, the service it calls, and every field name of the
 * session / status / workspace snapshots. A DSH upgrade that renames or reshapes
 * one of those facts is a one-file change; `test/contract.test.mjs` pins the
 * expectations against a recorded fixture and fails when the adapter starts
 * returning nothing.
 *
 * Every reader is deliberately shy: an absent field degrades to "no data",
 * never to a thrown render. A missing shape therefore hides the pill instead of
 * breaking the conversation header it lives in.
 */

/** Header slot: the global navigation seat left of the conversation title. */
const SLOT = 'conversation.header.leading';
/** Slot registration id, unique within the seat. */
const SLOT_ID = 'running-sessions';
/** Draw order inside the seat. */
const SLOT_ORDER = 10;
/**
 * Attribute DSH's macOS Desktop window-region pass reads to keep an overlay out
 * of the window-drag area. A body portal has no layout box, so the exclusion has
 * to sit on the visible menu box.
 */
const DRAG_EXCLUDE_ATTR = 'data-window-drag-exclude';
/** Locale namespace registered through the client locale service. */
const LOCALE_NS = 'runningSessions';
/** Services this plugin hard-depends on, as named in `inject`. */
const SERVICE_SLOTS = 'slots';
const SERVICE_LOCALE = 'locale';
const SERVICE_WORKSPACE = 'uiWorkspace';

/** Standard props (rendered into the slot) this plugin reads. */
const HOOKS = {
  sessions: 'useSessions',
  status: 'useSessionStatus',
  workspaces: 'useWorkspaces',
};

/** Session-row facts. */
const SESSION = {
  /** `'subagent'` is the authoritative subagent marker; a bare parent id is not. */
  origin: 'origin',
  originSubagent: 'subagent',
  parentId: 'parentId',
  running: 'running',
  updatedAt: 'updatedAt',
  title: 'title',
  displayTitle: 'displayTitle',
  /**
   * A provisional session that exists but holds no conversation yet (the "New
   * Session" tab). The official sidebar hides these unless they are the session
   * on screen, so a list of *conversations* must skip them too.
   */
  blank: 'blank',
};

/** Session-list snapshot: `ids` is Host-list membership, `byId` may hold more. */
const ROSTER = {
  ids: 'ids',
  byId: 'byId',
  projections: 'projectionsBySession',
};

/** Per-session projection bag and the subagent catalog inside it. */
const PROJECTION = {
  values: 'values',
  subagentCatalog: 'subagentCatalog',
};

/**
 * Catalog entry modes with no local child session. `external` names a subagent
 * that lives outside this Host, so treating it as a session would invent rows.
 */
const CATALOG_MODES_WITHOUT_SESSION = ['external'];

/**
 * The two display names a catalog entry can carry: the durable creation `label`
 * every mode may have, and the `name` a newer catalog reserves unique among the
 * parent's children.
 */
const CATALOG_ENTRY = {
  label: 'label',
  name: 'name',
};

/** Session UI status: running flag plus the pending interaction. */
const STATUS = {
  running: 'running',
  pendingInteraction: 'pendingInteraction',
  pendingKind: 'kind',
};

/** Pending interaction kinds and the dictionary key each one renders. */
const PENDING_LABELS = {
  approval: 'row.pending.approval',
  'plan-review': 'row.pending.plan',
  question: 'row.pending.question',
};
/**
 * A kind this plugin does not know yet still deserves a badge — the alternative
 * is silently swallowing "waiting for something" after a DSH upgrade.
 */
const PENDING_LABEL_UNKNOWN = 'row.pending.other';

/** Workspace snapshot facts. */
const WORKSPACE = {
  items: 'items',
  archivedSessionIds: 'archivedSessionIds',
  sessionIds: 'sessionIds',
  title: 'title',
};

/** A standard prop, or `null` when the seat does not provide it. */
function hook(props, name) {
  const value = props ? props[name] : undefined;
  return typeof value === 'function' ? value : null;
}

/** The Host-list order, or an empty list when the snapshot is unusable. */
function hostOrder(sessions) {
  const value = sessions ? sessions[ROSTER.ids] : undefined;
  return Array.isArray(value) ? value : [];
}

/** The row bag, or `null` when the snapshot is unusable. */
function rows(sessions) {
  const value = sessions ? sessions[ROSTER.byId] : undefined;
  return value && typeof value === 'object' ? value : null;
}

/** Whether one row is a subagent session (only the durable origin counts). */
function isSubagentRow(entry) {
  return Boolean(entry) && entry[SESSION.origin] === SESSION.originSubagent;
}

/**
 * Whether one row is a provisional session with no conversation yet.
 *
 * A missing field reads as `false`, so a Host that stops sending `blank` shows
 * the row instead of silently dropping it — the wrong direction to fail, but the
 * safe one: showing one extra row beats hiding a real conversation.
 */
function isBlankRow(entry) {
  return Boolean(entry) && entry[SESSION.blank] === true;
}

/** The session id a row claims as its parent, if it claims one. */
function parentIdOf(entry) {
  const value = entry ? entry[SESSION.parentId] : undefined;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Every `[parentId, entry]` pair from the workspaces' subagent catalogs. */
function catalogEntries(sessions) {
  const projections = sessions ? sessions[ROSTER.projections] : undefined;
  const pairs = [];
  if (!projections || typeof projections !== 'object') return pairs;
  for (const parentId of Object.keys(projections)) {
    const snapshot = projections[parentId];
    const values = snapshot ? snapshot[PROJECTION.values] : undefined;
    const catalog = values ? values[PROJECTION.subagentCatalog] : undefined;
    if (!Array.isArray(catalog)) continue;
    for (const entry of catalog) pairs.push([parentId, entry]);
  }
  return pairs;
}

/** Whether a catalog entry can stand for a session on this Host. */
function catalogEntryHasSession(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return false;
  return CATALOG_MODES_WITHOUT_SESSION.indexOf(entry.mode) === -1;
}

/**
 * The name each child was created under, keyed by child session id.
 *
 * A subagent session has no title of its own: DSH fills its `title` from the
 * opening prompt, so a row built from the session snapshot alone reads as the
 * first line of the task text instead of the name the parent gave the child. The
 * parent's catalog is where that name actually lives — `label` is the display
 * description handed to the spawner, `name` the short unique handle a newer
 * catalog records. `label` wins because it is prose meant for a human.
 *
 * The catalog is a live projection, so this map tracks children created after the
 * row above was first drawn.
 *
 * @returns `Map<SessionId, string>` — only entries that actually carry a name.
 */
function catalogLabels(sessions) {
  const names = new Map();
  for (const [, entry] of catalogEntries(sessions)) {
    if (!catalogEntryHasSession(entry)) continue;
    const label = entry[CATALOG_ENTRY.label];
    const name = entry[CATALOG_ENTRY.name];
    const text = typeof label === 'string' && label.trim()
      ? label.trim()
      : typeof name === 'string' && name.trim() ? name.trim() : '';
    if (text) names.set(entry.id, text);
  }
  return names;
}

/** Archived session ids, or `null` when nothing is archived. */
function archivedIds(workspaces) {
  const value = workspaces ? workspaces[WORKSPACE.archivedSessionIds] : undefined;
  return Array.isArray(value) && value.length > 0 ? value : null;
}

/** Workspace rows, or an empty list. */
function workspaceItems(workspaces) {
  const value = workspaces ? workspaces[WORKSPACE.items] : undefined;
  return Array.isArray(value) ? value : [];
}

/** The session ids one workspace owns, or an empty list. */
function workspaceSessionIds(workspace) {
  const value = workspace ? workspace[WORKSPACE.sessionIds] : undefined;
  return Array.isArray(value) ? value : [];
}

/** The label a workspace row shows for itself. */
function workspaceTitle(workspace) {
  const value = workspace ? workspace[WORKSPACE.title] : undefined;
  return typeof value === 'string' ? value : '';
}

/**
 * Whether a session is running: the status snapshot wins (it is the live view),
 * and the list row is the fallback when no status has arrived yet.
 */
function isRunning(entry, state) {
  const status = state ? state[STATUS.running] : undefined;
  if (typeof status === 'boolean') return status;
  return Boolean(entry) && entry[SESSION.running] === true;
}

/** The pending interaction kind of one session, or an empty string. */
function pendingKind(state) {
  const pending = state ? state[STATUS.pendingInteraction] : undefined;
  const kind = pending ? pending[STATUS.pendingKind] : undefined;
  return typeof kind === 'string' ? kind : '';
}

/** The dictionary key a pending kind renders as; unknown kinds stay visible. */
function pendingLabelKey(kind) {
  if (!kind) return '';
  if (Object.prototype.hasOwnProperty.call(PENDING_LABELS, kind)) return PENDING_LABELS[kind];
  return PENDING_LABEL_UNKNOWN;
}

/** The best title a session row carries, trimmed; empty when it has none. */
function titleOf(entry) {
  if (!entry) return '';
  const title = entry[SESSION.title];
  if (typeof title === 'string' && title.trim()) return title.trim();
  const display = entry[SESSION.displayTitle];
  if (typeof display === 'string' && display.trim()) return display.trim();
  return '';
}

/** Last activity timestamp, or `0` so sorting stays total. */
function updatedAtOf(entry) {
  const value = entry ? entry[SESSION.updatedAt] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

module.exports = {
  SLOT,
  SLOT_ID,
  SLOT_ORDER,
  DRAG_EXCLUDE_ATTR,
  LOCALE_NS,
  SERVICE_SLOTS,
  SERVICE_LOCALE,
  SERVICE_WORKSPACE,
  HOOKS,
  PENDING_LABEL_UNKNOWN,
  hook,
  hostOrder,
  rows,
  isSubagentRow,
  isBlankRow,
  parentIdOf,
  catalogEntries,
  catalogEntryHasSession,
  catalogLabels,
  archivedIds,
  workspaceItems,
  workspaceSessionIds,
  workspaceTitle,
  isRunning,
  pendingKind,
  pendingLabelKey,
  titleOf,
  updatedAtOf,
};
