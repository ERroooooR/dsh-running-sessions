/**
 * Contract checks: the one module that names DSH's own fields.
 *
 * Two things are pinned here:
 *
 * 1. every field the plugin reads is the field DSH actually ships (a recorded
 *    fixture below mirrors the `SessionSummary` / `SessionStatus` /
 *    `WorkspaceView` shapes from DSH 0.2.2-rc.3);
 * 2. every reader degrades instead of throwing when a field goes missing — the
 *    failure mode of a DSH upgrade must be "the pill shows nothing", never "the
 *    conversation header crashes".
 *
 * Run: node test/contract.test.mjs
 */
import { assert, makeChecker, roster } from './harness.mjs'

const require = (await import('node:module')).createRequire(import.meta.url)
const contract = require('../src/contract.js')
const geo = require('../src/geometry.js')
const time = require('../src/time.js')

const check = makeChecker()

/** DSH 0.2.2-rc.3 `SessionSummary`, trimmed to the fields this plugin reads. */
const summary = {
  id: 'ses_1',
  title: 'Refactor the runner',
  displayTitle: 'Refactor the runner',
  cwd: '/work',
  parentId: undefined,
  origin: undefined,
  running: true,
  retainedBy: { mainView: 1 },
  blank: false,
  updatedAt: 1_700_000_000_000,
  projectionValues: {},
}

/** DSH 0.2.2-rc.3 `SessionStatus`. */
const status = { running: true, pendingInteraction: { kind: 'approval' }, completionUnread: false }

/** DSH 0.2.2-rc.3 `SessionListState`. */
const list = {
  ids: ['ses_1'],
  byId: { ses_1: summary },
  phase: 'ready',
  projectionsBySession: {
    ses_1: { values: { subagentCatalog: [{ id: 'ses_2', createdAt: 1, mode: 'one-shot', label: 'reviewer' }] } },
  },
}

/** DSH 0.2.2-rc.3 `WorkspaceSnapshot` / `WorkspaceView`. */
const workspaces = {
  items: [{ workspaceId: 'ws_1', path: '/work', title: 'dsh', sessionIds: ['ses_1'], createdAt: 1, updatedAt: 2 }],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  state: 'ready',
  phase: 'ready',
  error: undefined,
}

check('the recorded DSH field names are the ones the plugin reads', () => {
  assert.equal(contract.hostOrder(list)[0], 'ses_1')
  assert.equal(contract.rows(list).ses_1.id, 'ses_1')
  assert.equal(contract.titleOf(summary), 'Refactor the runner')
  assert.equal(contract.updatedAtOf(summary), 1_700_000_000_000)
  assert.equal(contract.isSubagentRow(summary), false)
  assert.equal(contract.pendingKind(status), 'approval')
  assert.equal(contract.pendingLabelKey('approval'), 'row.pending.approval')
  assert.equal(contract.workspaceTitle(workspaces.items[0]), 'dsh')
  assert.deepEqual(contract.workspaceSessionIds(workspaces.items[0]), ['ses_1'])
  assert.equal(contract.titleOf({ displayTitle: 'Fallback title' }), 'Fallback title')
})

check('a subagent row is identified by origin, not by parentId', () => {
  const child = { id: 'ses_2', origin: 'subagent', parentId: 'ses_1' }
  const fork = { id: 'ses_3', parentId: 'ses_1' }
  assert.equal(contract.isSubagentRow(child), true)
  assert.equal(contract.isSubagentRow(fork), false, 'an ordinary fork keeps a parent id but no origin')
  assert.equal(contract.parentIdOf(child), 'ses_1')
  assert.equal(contract.parentIdOf(fork), 'ses_1')
  assert.equal(contract.parentIdOf({}), undefined)
})

check('the subagent catalog is read through the projection bag', () => {
  const entries = contract.catalogEntries(list)
  assert.equal(entries.length, 1)
  assert.equal(entries[0][0], 'ses_1', 'parent id comes from the projection key')
  assert.equal(entries[0][1].id, 'ses_2')
  assert.equal(contract.catalogEntryHasSession(entries[0][1]), true)
  // `external` names a subagent with no local child session: never a row.
  assert.equal(contract.catalogEntryHasSession({ id: 'x', mode: 'external' }), false)
  assert.equal(contract.catalogEntryHasSession({ mode: 'one-shot' }), false, 'an entry without an id is not a session')
})

check('the name a parent gave a child comes from the catalog, not the child title', () => {
  // A real `subagent/catalog` event: the child session's own title is filled in
  // from the opening prompt, so only `label` reads as a name.
  const sessions = roster(
    [{ id: 'ses_1' }, { id: 'ses_2', origin: 'subagent', parentId: 'ses_1', title: '你在 DSH 团队里做岗位「Agent D…' }],
    {
      ses_1: {
        values: {
          subagentCatalog: [
            { id: 'ses_2', createdAt: 1, mode: 'continuable', label: '有线广播检索 Agent A', name: 'agent-a' },
          ],
        },
      },
    },
  )
  const labels = contract.catalogLabels(sessions)
  assert.equal(labels.get('ses_2'), '有线广播检索 Agent A', 'the prose label wins over the short handle')
  assert.equal(labels.has('ses_1'), false, 'only children are named by a catalog')
})

check('a catalog entry falls back to its unique name, and drops blank names', () => {
  const sessions = roster([{ id: 'ses_1' }], {
    ses_1: {
      values: {
        subagentCatalog: [
          { id: 'ses_2', createdAt: 1, mode: 'one-shot', name: 'reviewer' },
          { id: 'ses_3', createdAt: 1, mode: 'one-shot', label: '   ' },
          { id: 'ses_4', createdAt: 1, mode: 'external', label: 'remote helper' },
        ],
      },
    },
  })
  const labels = contract.catalogLabels(sessions)
  assert.equal(labels.get('ses_2'), 'reviewer', 'a name stands in when there is no label')
  assert.equal(labels.has('ses_3'), false, 'whitespace is not a name')
  assert.equal(labels.has('ses_4'), false, 'an external child has no local session to label')
  assert.equal(contract.catalogLabels(undefined).size, 0, 'a missing snapshot yields no names')
})

check('pending kinds this plugin does not know still render a badge', () => {
  assert.equal(contract.pendingLabelKey('question'), 'row.pending.question')
  assert.equal(contract.pendingLabelKey('plan-review'), 'row.pending.plan')
  // A kind added by a future DSH: visible, not silently dropped.
  assert.equal(contract.pendingLabelKey('brand-new-kind'), contract.PENDING_LABEL_UNKNOWN)
  assert.equal(contract.pendingLabelKey(''), '')
})

check('a session counts as running from the status snapshot first, the row second', () => {
  assert.equal(contract.isRunning({ running: false }, { running: true }), true, 'live status wins')
  assert.equal(contract.isRunning({ running: true }, { running: false }), false, 'live status wins')
  assert.equal(contract.isRunning({ running: true }, undefined), true, 'row is the fallback')
  assert.equal(contract.isRunning({ running: true }, {}), true, 'unset status falls back')
  assert.equal(contract.isRunning({}, undefined), false)
})

// ---- degradation: every reader tolerates a missing shape -------------------

check('every reader degrades instead of throwing on an unusable snapshot', () => {
  for (const broken of [undefined, null, {}, { ids: 'nope' }, { byId: 42 }, { ids: [], byId: null }]) {
    assert.deepEqual(contract.hostOrder(broken), [])
    assert.equal(contract.rows(broken), null)
    assert.deepEqual(contract.catalogEntries(broken), [])
    assert.deepEqual(contract.workspaceItems(broken), [])
    assert.deepEqual(contract.workspaceSessionIds(broken), [])
    assert.equal(contract.workspaceTitle(broken), '')
    assert.equal(contract.archivedIds(broken), null)
  }
  assert.equal(contract.titleOf(undefined), '')
  assert.equal(contract.updatedAtOf(undefined), 0)
  assert.equal(contract.pendingKind(undefined), '')
  assert.equal(contract.parentIdOf(undefined), undefined)
  assert.equal(contract.isSubagentRow(undefined), false)
})

check('a standard prop that the seat does not provide reads as absent', () => {
  assert.equal(contract.hook({}, 'useSessions'), null)
  assert.equal(contract.hook({ useSessions: 'not a function' }, 'useSessions'), null)
  const fn = () => {}
  assert.equal(contract.hook({ useSessions: fn }, 'useSessions'), fn)
  assert.equal(contract.hook(undefined, 'useSessions'), null)
})

check('the registered seat and namespace are the documented ones', () => {
  assert.equal(contract.SLOT, 'conversation.header.leading')
  assert.equal(contract.SLOT_ID, 'running-sessions')
  assert.equal(contract.LOCALE_NS, 'runningSessions')
  assert.equal(contract.SERVICE_SLOTS, 'slots')
  assert.equal(contract.SERVICE_LOCALE, 'locale')
  assert.equal(contract.SERVICE_WORKSPACE, 'uiWorkspace')
  assert.deepEqual(Object.values(contract.HOOKS).sort(), ['useSessionStatus', 'useSessions', 'useWorkspaces'])
})

// ---- pure helpers split out of the component -------------------------------

check('popover placement flips above the pill when it would overflow', () => {
  const rect = { left: 100, top: 760, bottom: 786 }
  const viewport = { width: 1280, height: 800 }
  const below = geo.placeMenu(rect, viewport, 100)
  assert.ok(below.top < rect.top, 'menu flips above when there is no room below')
  const roomy = geo.placeMenu({ left: 100, top: 20, bottom: 46 }, viewport, 100)
  assert.equal(roomy.top, 52, 'menu sits just under the pill when it fits')
})

check('popover placement clamps to the viewport instead of running off it', () => {
  const viewport = { width: 1280, height: 800 }
  const right = geo.placeMenu({ left: 1270, top: 20, bottom: 46 }, viewport, 100)
  assert.ok(right.left + right.width <= viewport.width, 'never overflows the right edge')
  const left = geo.placeMenu({ left: 0, top: 20, bottom: 46 }, viewport, 100)
  assert.ok(left.left >= geo.EDGE, 'never overflows the left edge')
  const narrow = geo.placeMenu({ left: 0, top: 20, bottom: 46 }, { width: 180, height: 700 }, 100)
  assert.ok(narrow.width <= 180, 'a narrow viewport shrinks the menu')
  const tall = geo.placeMenu({ left: 10, top: 10, bottom: 36 }, viewport, 5000)
  assert.ok(tall.top >= geo.EDGE, 'a very tall menu still starts inside the viewport')
})

check('the menu is sized for a row, not for an empty right gutter', () => {
  const wide = geo.placeMenu({ left: 100, top: 20, bottom: 46 }, { width: 1280, height: 800 }, 100)
  assert.ok(wide.width <= 250, `a menu ${wide.width}px wide leaves a wide empty margin beside every row`)
})

check('relative time rounds at its documented boundaries', () => {
  const t = (key, params) => (params ? `${key}:${params.count}` : key)
  const now = 1_700_000_000_000
  assert.equal(time.agoText(t, 0, now), '', 'no timestamp, no label')
  assert.equal(time.agoText(t, now - 1000, now), 'ago.now')
  assert.equal(time.agoText(t, now - 60000, now), 'ago.minutes:1')
  assert.equal(time.agoText(t, now - 3600000, now), 'ago.hours:1')
  assert.equal(time.agoText(t, now - 86400000, now), 'ago.days:1')
  assert.equal(time.agoText(t, Number.NaN, now), '', 'a broken timestamp renders nothing')
})

check.summary()
