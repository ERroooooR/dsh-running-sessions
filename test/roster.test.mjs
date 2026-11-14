/**
 * Roster checks: which sessions are main agents, which fold into them, and what
 * the pill/menu report.
 *
 * Pure functions only — no React, no DOM. These are the rules a DSH upgrade is
 * most likely to disturb, so they are driven directly against fixtures shaped
 * like the real snapshots.
 *
 * The menu's shape after the layout change: `buildRows` returns only
 * `{ running, recent }`. A running main session carries its running subagents as
 * `row.children`, flattened in tree order with a `depth`, and `row.moreChildren`
 * when the fan-out was capped. Subagents are never top-level rows and never a
 * separate group.
 *
 * Run: node test/roster.test.mjs
 */
import {
  assert,
  createReact,
  loadPlugin,
  makeChecker,
  noWorkspaces,
  roster,
  row,
  statusMap,
} from './harness.mjs'

const react = createReact()
const internals = loadPlugin(react)
const { classifySessions, resolveActivity, countRunning, buildRows, normalizeConfig, DEFAULT_CONFIG } = internals

const CONFIG = normalizeConfig({})
const check = makeChecker()

/** Ids of the nested subagent rows of one running session. */
function childIds(groups, ownerIndex = 0) {
  return (groups.running[ownerIndex].children || []).map((entry) => entry.id)
}

check('a running subagent is not counted as a running session', () => {
  const sessions = roster([row('main'), row('child', { origin: 'subagent', parentId: 'main' })])
  const status = statusMap({ main: false, child: true })
  assert.deepEqual(countRunning(sessions, status, noWorkspaces, CONFIG), { main: 1, sub: 1 })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.deepEqual(groups.running.map((entry) => entry.id), ['main'])
  assert.deepEqual(childIds(groups), ['child'], 'the child is nested under its owner')
  assert.equal(groups.running[0].children[0].depth, 1)
  assert.equal('subagents' in groups, false, 'there is no separate subagent group')
})

check('subagent activity alone keeps the pill visible', () => {
  const sessions = roster([row('main'), row('child', { origin: 'subagent', parentId: 'main' })])
  const counts = countRunning(sessions, statusMap({ main: false, child: true }), noWorkspaces, CONFIG)
  assert.ok(counts.main + counts.sub > 0, 'pill must not hide while a subagent works')
})

check('subagent activity can be excluded from the owner', () => {
  const off = normalizeConfig({ subagentActivity: false })
  const sessions = roster([row('main'), row('child', { origin: 'subagent', parentId: 'main' })])
  const status = statusMap({ main: false, child: true })
  assert.deepEqual(countRunning(sessions, status, noWorkspaces, off), { main: 0, sub: 1 })
  const groups = buildRows(sessions, status, noWorkspaces, off)
  assert.deepEqual(groups.running, [], 'no active owner, no running row')
  assert.deepEqual(groups.recent.map((entry) => entry.id), ['main'])
  // With no running owner there is nothing to nest under, so the child does not
  // become a top-level row — it must never reappear as its own "session".
  assert.equal(groups.running.length, 0)
})

check('subagent rows can be switched off while counts remain', () => {
  const off = normalizeConfig({ subagentRows: false })
  const sessions = roster([row('main'), row('child', { origin: 'subagent', parentId: 'main' })])
  const status = statusMap({ main: true, child: true })
  const groups = buildRows(sessions, status, noWorkspaces, off)
  assert.deepEqual(groups.running.map((entry) => entry.id), ['main'])
  assert.equal(groups.running[0].children, undefined, 'no nested rows at all')
  assert.deepEqual(countRunning(sessions, status, noWorkspaces, off), { main: 1, sub: 1 })
})

check('ordinary forks are not subagents', () => {
  const sessions = roster([row('parent'), row('fork', { parentId: 'parent' })])
  const status = statusMap({ parent: true, fork: true })
  const index = classifySessions(sessions)
  assert.equal(index.isSubagent('fork'), false)
  assert.deepEqual(countRunning(sessions, status, noWorkspaces, CONFIG), { main: 2, sub: 0 })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.deepEqual(groups.running.map((entry) => entry.id).sort(), ['fork', 'parent'])
  assert.ok(groups.running.every((entry) => entry.children === undefined), 'a fork is never a child row')
})

check('catalog children join the roster before the Host list carries them', () => {
  const sessions = roster([row('main')], {
    main: { values: { subagentCatalog: [{ id: 'child', createdAt: 1, mode: 'one-shot' }] } },
  })
  sessions.byId.child = row('child')
  const status = statusMap({ main: false, child: true })
  assert.deepEqual(countRunning(sessions, status, noWorkspaces, CONFIG), { main: 1, sub: 1 })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.equal(groups.running.length, 1)
  assert.deepEqual(childIds(groups), ['child'])
})

check('external catalog entries are not sessions', () => {
  // `external` means the child has no local session. Back the id with a real row
  // so this fails if the skip is removed, instead of passing merely because
  // nothing in the snapshot carries that id.
  const sessions = roster(
    [row('main'), row('ext', { title: 'an unrelated local session' })],
    { main: { values: { subagentCatalog: [{ id: 'ext', createdAt: 1, mode: 'external' }] } } },
  )
  const index = classifySessions(sessions)
  assert.equal(index.isSubagent('ext'), false)
  assert.equal(index.subagentIds.length, 0)
  assert.equal(index.childrenOf.get('main'), undefined, 'an external child is not nested')
})

check("a catalog naming another session's child does not give it a second owner", () => {
  const sessions = roster(
    [row('owner'), row('other'), row('child', { origin: 'subagent', parentId: 'owner' })],
    // `other`'s projection claims the same child. The row's own parentId is the
    // durable edge, so the catalog must not add a second one: the child would be
    // nested under both sessions and its activity would count for each.
    { other: { values: { subagentCatalog: [{ id: 'child', createdAt: 1, mode: 'one-shot' }] } } },
  )
  const status = statusMap({ owner: false, other: false, child: true })
  const index = classifySessions(sessions)
  assert.equal(index.parentOf.get('child'), 'owner')
  assert.equal(index.childrenOf.get('other'), undefined)
  assert.deepEqual(countRunning(sessions, status, noWorkspaces, CONFIG), { main: 1, sub: 1 })
  assert.deepEqual(buildRows(sessions, status, noWorkspaces, CONFIG).running.map((entry) => entry.id), ['owner'])
})

check('a subagent row is titled with the name its parent gave it', () => {
  // DSH fills a child session's own title from the opening prompt, so a row built
  // from the session snapshot reads as the first line of the task text. The
  // parent's catalog is where the name lives.
  const sessions = roster(
    [
      row('main'),
      row('child', { origin: 'subagent', parentId: 'main', title: '你在 DSH 团队里做岗位「Agent D…' }),
    ],
    { main: { values: { subagentCatalog: [{ id: 'child', createdAt: 1, mode: 'continuable', label: '检索 Agent D' }] } } },
  )
  const status = statusMap({ main: false, child: true })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.equal(groups.running[0].children[0].title, '检索 Agent D')
})

check('a subagent with no catalog name falls back to its session title', () => {
  const sessions = roster([row('main'), row('child', { origin: 'subagent', parentId: 'main', title: 'fallback' })])
  const status = statusMap({ main: false, child: true })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.equal(groups.running[0].children[0].title, 'fallback')
})

check('an orphaned subagent still never becomes a top-level row', () => {
  const sessions = roster([row('orphan', { origin: 'subagent', parentId: 'gone' })])
  const status = statusMap({ orphan: true })
  assert.deepEqual(countRunning(sessions, status, noWorkspaces, CONFIG), { main: 0, sub: 1 })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.deepEqual(groups.running, [], 'orphans have no owner to nest under, so they render nowhere')
  assert.deepEqual(groups.recent, [])
})

check('nested subagents roll up to the owning main session', () => {
  const sessions = roster([
    row('main'),
    row('child', { origin: 'subagent', parentId: 'main' }),
    row('grandchild', { origin: 'subagent', parentId: 'child' }),
  ])
  const status = statusMap({ main: false, child: false, grandchild: true })
  const activity = resolveActivity(classifySessions(sessions), status, CONFIG)
  assert.equal(activity.active('main'), true)
  assert.deepEqual(countRunning(sessions, status, noWorkspaces, CONFIG), { main: 1, sub: 1 })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.deepEqual(groups.running.map((entry) => entry.id), ['main'])
  // The outline keeps the intermediate subagent on screen, one level in, so its
  // own child is never indented under nothing.
  assert.deepEqual(childIds(groups), ['child', 'grandchild'])
  assert.deepEqual(groups.running[0].children.map((entry) => entry.depth), [1, 2])
})

check('an archived main session hides its running subagents', () => {
  const sessions = roster([row('main'), row('child', { origin: 'subagent', parentId: 'main' })])
  const status = statusMap({ main: true, child: true })
  const workspaces = { items: [], archivedSessionIds: ['main'] }
  assert.deepEqual(countRunning(sessions, status, workspaces, CONFIG), { main: 0, sub: 0 })
  const groups = buildRows(sessions, status, workspaces, CONFIG)
  assert.deepEqual(groups.running, [])
  assert.deepEqual(groups.recent, [])
})

check('an archived subagent is hidden without touching its owner', () => {
  const sessions = roster([row('main'), row('child', { origin: 'subagent', parentId: 'main' })])
  const status = statusMap({ main: true, child: true })
  const workspaces = { items: [], archivedSessionIds: ['child'] }
  assert.deepEqual(countRunning(sessions, status, workspaces, CONFIG), { main: 1, sub: 0 })
  const groups = buildRows(sessions, status, workspaces, CONFIG)
  assert.deepEqual(groups.running.map((entry) => entry.id), ['main'])
  assert.deepEqual(childIds(groups), [], 'the archived child is not nested either')
})

check('a cycle degrades instead of hanging', () => {
  const sessions = roster([
    row('a', { origin: 'subagent', parentId: 'b' }),
    row('b', { origin: 'subagent', parentId: 'a' }),
  ])
  const counts = countRunning(sessions, statusMap({ a: true }), noWorkspaces, CONFIG)
  assert.equal(counts.main, 0)
  assert.equal(counts.sub, 1)
  const groups = buildRows(sessions, statusMap({ a: true }), noWorkspaces, CONFIG)
  assert.deepEqual(groups.running, [], 'two subagents with no owner produce no rows')
})

check('a catalog edge pointing back at an ancestor cannot loop the outline', () => {
  // `b`'s catalog names `a`, which is already `b`'s ancestor. If every catalog
  // claim added an edge, `childrenOf` would contain main → a → b → a and building
  // the outline would recurse until the stack blew up in the header.
  const sessions = roster(
    [
      row('main'),
      row('a', { origin: 'subagent', parentId: 'main' }),
      row('b', { origin: 'subagent', parentId: 'a' }),
    ],
    { b: { values: { subagentCatalog: [{ id: 'a', createdAt: 1, mode: 'one-shot' }] } } },
  )
  const status = statusMap({ main: true, a: false, b: true })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.deepEqual(
    groups.running[0].children.map((entry) => [entry.id, entry.depth]),
    [['a', 1], ['b', 2]],
  )
})

check('finished sessions land in recent; a subagent keeps its owner running', () => {
  const sessions = roster([
    row('main', { updatedAt: 10 }),
    row('child', { origin: 'subagent', parentId: 'main', updatedAt: 20 }),
    row('other', { updatedAt: 5 }),
  ])
  const status = statusMap({ main: false, child: true, other: false })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.deepEqual(groups.running.map((entry) => entry.id), ['main'])
  assert.deepEqual(groups.recent.map((entry) => entry.id), ['other'])
  assert.deepEqual(childIds(groups), ['child'])
})

check('with subagent folding off, the parent falls back to recent', () => {
  const off = normalizeConfig({ subagentActivity: false })
  const sessions = roster([
    row('main', { updatedAt: 10 }),
    row('child', { origin: 'subagent', parentId: 'main', updatedAt: 20 }),
    row('other', { updatedAt: 5 }),
  ])
  const status = statusMap({ main: false, child: true, other: false })
  const groups = buildRows(sessions, status, noWorkspaces, off)
  assert.deepEqual(groups.running, [])
  assert.deepEqual(groups.recent.map((entry) => entry.id).sort(), ['main', 'other'])
  // A finished owner cannot host a child row; the child is not promoted either.
  assert.equal('children' in (groups.recent[0] || {}), false)
})

check('with folding off, a running grandchild keeps its quiet middle row', () => {
  // The switch decides what counts as a running session, not which rows exist.
  // Filtering the outline by it dropped the middle subagent and took the working
  // leaf down with it.
  const off = normalizeConfig({ subagentActivity: false })
  const sessions = roster([
    row('main'),
    row('mid', { origin: 'subagent', parentId: 'main' }),
    row('leaf', { origin: 'subagent', parentId: 'mid' }),
  ])
  const status = statusMap({ main: true, mid: false, leaf: true })
  const groups = buildRows(sessions, status, noWorkspaces, off)
  assert.deepEqual(groups.running.map((entry) => entry.id), ['main'])
  assert.deepEqual(
    groups.running[0].children.map((entry) => [entry.id, entry.depth]),
    [['mid', 1], ['leaf', 2]],
  )
})

check('children nest under the right owner when two sessions run at once', () => {
  const sessions = roster([
    row('a', { updatedAt: 30 }),
    row('b', { updatedAt: 20 }),
    row('a1', { origin: 'subagent', parentId: 'a' }),
    row('a2', { origin: 'subagent', parentId: 'a' }),
    row('b1', { origin: 'subagent', parentId: 'b' }),
  ])
  const status = statusMap({ a: false, b: false, a1: true, a2: true, b1: true })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.deepEqual(groups.running.map((entry) => entry.id), ['a', 'b'])
  const byId = Object.fromEntries(groups.running.map((entry) => [entry.id, entry]))
  assert.deepEqual(byId.a.children.map((entry) => entry.id), ['a1', 'a2'])
  assert.deepEqual(byId.b.children.map((entry) => entry.id), ['b1'])
})

check('two simultaneous subagents stay one session plus two nested rows', () => {
  const sessions = roster([
    row('main'),
    row('s1', { origin: 'subagent', parentId: 'main' }),
    row('s2', { origin: 'subagent', parentId: 'main' }),
  ])
  const status = statusMap({ main: false, s1: true, s2: true })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.equal(groups.running.length, 1)
  assert.deepEqual(childIds(groups).sort(), ['s1', 's2'])
  assert.deepEqual(groups.running[0].children.map((entry) => entry.depth), [1, 1])
})

check('a large fan-out caps the rows and reports the remainder', () => {
  const rows = [row('main')]
  const status = { main: false }
  for (let index = 0; index < internals.SUBAGENT_LIMIT + 2; index += 1) {
    rows.push(row(`s${index}`, { origin: 'subagent', parentId: 'main', updatedAt: index }))
    status[`s${index}`] = true
  }
  const groups = buildRows(roster(rows), statusMap(status), noWorkspaces, CONFIG)
  assert.equal(groups.running.length, 1, 'still one session row')
  assert.equal(groups.running[0].children.length, internals.SUBAGENT_LIMIT)
  assert.equal(groups.running[0].moreChildren, 2, 'overflow is reported on the owner')
})

check('nested children are ordered newest first within one parent', () => {
  const sessions = roster([
    row('main'),
    row('old', { origin: 'subagent', parentId: 'main', updatedAt: 1 }),
    row('new', { origin: 'subagent', parentId: 'main', updatedAt: 9 }),
    row('mid', { origin: 'subagent', parentId: 'main', updatedAt: 5 }),
  ])
  const status = statusMap({ main: false, old: true, new: true, mid: true })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  assert.deepEqual(childIds(groups), ['new', 'mid', 'old'])
})

check('a nested row carries title, depth and pending but no owner meta', () => {
  const sessions = roster([
    row('main', { title: '主会话' }),
    row('child', { origin: 'subagent', parentId: 'main', title: '子会话' }),
  ])
  const status = statusMap({ main: false, child: { running: true, pendingInteraction: { kind: 'approval' } } })
  const groups = buildRows(sessions, status, noWorkspaces, CONFIG)
  const child = groups.running[0].children[0]
  assert.equal(child.title, '子会话')
  assert.equal(child.depth, 1)
  assert.equal(child.pending, 'row.pending.approval')
  assert.equal('workspace' in child, false, 'no meta line on a compact child row')
  assert.equal('parentTitle' in child, false, 'the owner is the row above, not repeated text')
  assert.equal('subRunning' in groups.running[0], false, 'owner carries no count badge data')
})

check('the recent group honours its limit without reporting a remainder', () => {
  const config = normalizeConfig({ recentLimit: 1 })
  const sessions = roster([row('a', { updatedAt: 3 }), row('b', { updatedAt: 2 }), row('c', { updatedAt: 1 })])
  const groups = buildRows(sessions, statusMap({ a: false, b: false, c: false }), noWorkspaces, config)
  assert.deepEqual(groups.recent.map((entry) => entry.id), ['a'])
  // The finished list is a convenience, not a paginated view: no "+2 more" noise.
  assert.equal('more' in groups, false, 'the recent group reports no overflow count')
})

check('a zero recent limit hides the group entirely', () => {
  const config = normalizeConfig({ recentLimit: 0 })
  const sessions = roster([row('a', { updatedAt: 3 })])
  const groups = buildRows(sessions, statusMap({ a: false }), noWorkspaces, config)
  assert.deepEqual(groups.recent, [])
})

check('rows carry workspace and pending labels when the options allow it', () => {
  const sessions = roster([row('main', { title: '主会话', updatedAt: 10 })])
  const workspaces = {
    items: [{ workspaceId: 'w', title: 'dsh-running-sessions', sessionIds: ['main'] }],
    archivedSessionIds: [],
  }
  const status = statusMap({ main: { running: true, pendingInteraction: { kind: 'approval' } } })
  const groups = buildRows(sessions, status, workspaces, CONFIG)
  assert.equal(groups.running[0].workspace, 'dsh-running-sessions')
  assert.equal(groups.running[0].title, '主会话')
  assert.equal(groups.running[0].pending, 'row.pending.approval')
})

check('config keeps unknown keys out and defaults intact', () => {
  const config = normalizeConfig({ subagentActivity: false, recentLimit: 99, bogus: 1 })
  assert.equal(config.subagentActivity, false)
  assert.equal(config.subagentRows, DEFAULT_CONFIG.subagentRows)
  // Clamped to the offered range AND snapped to an offered value, so the settings
  // panel can never render a segmented control with nothing selected.
  assert.equal(config.recentLimit, 5)
  assert.equal('bogus' in config, false)
})

check('a stored recentLimit outside the offered values snaps to one of them', () => {
  const offered = [0, 1, 3, 5]
  for (const stored of [-4, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 99, null, '4', Number.NaN]) {
    const value = normalizeConfig({ recentLimit: stored }).recentLimit
    assert.ok(offered.indexOf(value) !== -1, `stored ${String(stored)} produced un-offered ${value}`)
  }
  // Nearest wins, and a tie prefers the smaller value so the result is stable.
  assert.equal(normalizeConfig({ recentLimit: 4 }).recentLimit, 3)
  assert.equal(normalizeConfig({ recentLimit: 2 }).recentLimit, 1)
  assert.equal(normalizeConfig({ recentLimit: 9 }).recentLimit, 5)
})

check('a blank session holds no conversation and is never a row', () => {
  // DSH marks a session `blank` until its first turn; the official sidebar hides
  // those unless they are on screen, and a list of conversations must agree.
  const sessions = roster([
    row('blank1', { blank: true, displayTitle: 'some-workspace', updatedAt: 9999 }),
    row('real1', { title: 'real work', updatedAt: 10 }),
  ])
  const groups = buildRows(sessions, statusMap({}), noWorkspaces, CONFIG)
  assert.deepEqual(groups.running.map((entry) => entry.id), [])
  assert.deepEqual(groups.recent.map((entry) => entry.id), ['real1'])
  assert.equal(
    groups.recent.some((entry) => entry.title === 'some-workspace'),
    false,
    'the workspace-named placeholder must not sit at the top of the recent list',
  )
})

check('a subagent whose parent is blank is still a subagent and renders nowhere', () => {
  const sessions = roster([
    row('blank1', { blank: true }),
    row('child', { origin: 'subagent', parentId: 'blank1' }),
  ])
  const index = classifySessions(sessions)
  assert.deepEqual(index.subagentIds, ['child'], 'still a subagent, never promoted')
  const groups = buildRows(sessions, statusMap({ child: true }), noWorkspaces, CONFIG)
  assert.deepEqual(groups.running, [], 'a blank owner is not rendered, so no child hangs off it')
  assert.deepEqual(groups.recent, [])
})

check.summary()
