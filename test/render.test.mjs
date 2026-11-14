/**
 * Render checks: build the real component tree against a React stand-in.
 *
 * These catch what the pure tests cannot: a hook path that throws, a missing
 * dictionary key, a view module that reads an option wrongly, and the
 * drag-exclusion attribute a macOS overlay needs.
 *
 * Run: node test/render.test.mjs
 */
import {
  assert,
  createReact,
  findNodes,
  loadPlugin,
  makeChecker,
  noWorkspaces,
  roster,
  row,
  statusMap,
  textOf,
} from './harness.mjs'

const require = (await import('node:module')).createRequire(import.meta.url)
const nav = require('../src/nav.js')

const react = createReact()
const internals = loadPlugin(react)
const {
  RunningSessionsPill,
  normalizeConfig,
  setConfig,
  getConfig,
  resetConfigCache,
  resetOpenState,
  resetHintState,
  hasSeenHint,
} = internals

const check = makeChecker()

/** Start a fresh mount: hook cursor and stored state reset, module caches kept. */
function mount() {
  react._index = 0
  react._states.length = 0
  react._refs.length = 0
}

/** Render once at the current hook cursor. */
function renderAt({ sessions, status, workspaces = noWorkspaces }) {
  react._index = 0
  return RunningSessionsPill({
    useSessions: (selector) => selector(sessions),
    useSessionStatus: (selector) => selector(status),
    useWorkspaces: (selector) => selector(workspaces),
  })
}

/** Render the pill, open its menu the way a pointer click does, re-render. */
function renderMenu(snapshot) {
  const pill = renderAt(snapshot)
  assert.ok(pill, 'pill must render before its menu can open')
  const button = findNodes(pill, (node) => node.props.className === 'dsh-rs-pill')[0]
  assert.ok(button, 'pill button not found')
  button.props.onPointerDown({ preventDefault() {}, stopPropagation() {} })
  return renderAt(snapshot)
}

/**
 * Run one check with stored options, the onboarding flag and the interaction
 * state reset first, so each check starts from the plugin defaults.
 */
function run(name, fn) {
  mount()
  resetConfigCache()
  resetOpenState()
  resetHintState()
  window.localStorage.removeItem('dsh-running-sessions:hint-seen')
  react._states.length = 0
  react._refs.length = 0
  check(name, fn)
  resetOpenState()
}

run('a running main session with two subagents renders one session count', () => {
  const sessions = roster([
    row('main'),
    row('s1', { origin: 'subagent', parentId: 'main' }),
    row('s2', { origin: 'subagent', parentId: 'main' }),
  ])
  const status = statusMap({ main: false, s1: true, s2: true })
  const text = textOf(renderAt({ sessions, status }))
  assert.match(text, /运行中/, 'pill label present')
  assert.match(text, /1 个/, 'exactly one main session counted')
  // The "子 N" badge is gone: subagents are children of the one session, not a
  // second competing total on the pill.
  assert.doesNotMatch(text, /子 \d/, 'no subagent count badge on the pill')
  assert.doesNotMatch(text, /个 子/, 'no subagent count badge in any word order')
})

run('an idle roster with no subagents hides the pill', () => {
  const sessions = roster([row('main')])
  assert.equal(renderAt({ sessions, status: statusMap({ main: false }) }), null)
})

run('subagent-only activity still shows the pill', () => {
  const sessions = roster([row('main'), row('s1', { origin: 'subagent', parentId: 'main' })])
  const rendered = renderAt({ sessions, status: statusMap({ main: false, s1: true }) })
  assert.ok(rendered, 'pill visible through subagent activity')
  assert.match(textOf(rendered), /运行中/)
})

run('an ordinary fork running counts as a second session', () => {
  const sessions = roster([row('a'), row('b', { parentId: 'a' })])
  assert.match(textOf(renderAt({ sessions, status: statusMap({ a: true, b: true }) })), /2 个/)
})

run('the menu nests subagents directly under their owning session', () => {
  const sessions = roster([
    row('main', { title: '主会话', updatedAt: 10 }),
    row('s1', { origin: 'subagent', parentId: 'main', title: '子甲', updatedAt: 20 }),
    row('s2', { origin: 'subagent', parentId: 'main', title: '子乙', updatedAt: 15 }),
  ])
  const menu = renderMenu({ sessions, status: statusMap({ main: false, s1: true, s2: true }) })
  const rows = findNodes(menu, (node) => node.props.className === 'dsh-rs-row')
  assert.equal(rows.length, 3, 'one session row plus two nested subagent rows')
  assert.equal(rows[0].props['data-sub'], 'false', 'the first row is the owner')
  assert.equal(rows[1].props['data-sub'], 'true')
  assert.equal(rows[1].props['data-depth'], '1', 'children are indented one level')
  assert.equal(rows[2].props['data-sub'], 'true')
  assert.equal(rows[2].props['data-depth'], '1', 'siblings share the same indent')
  const text = textOf(menu)
  assert.match(text, /主会话/, 'owner title shown')
  assert.match(text, /子甲/, 'first child title shown')
  assert.match(text, /子乙/, 'second child title shown')
  // The separate section, its heading and the repeated owner labels are gone.
  assert.doesNotMatch(text, /运行中的子 agent/, 'no separate subagent section')
  assert.doesNotMatch(text, /属于 主会话/, 'no repeated owner label on each child')
  assert.doesNotMatch(text, /\d 子/, 'no "N 子" count badge')
  // A child row is one line: no workspace/time meta inside it.
  for (const child of rows.slice(1)) {
    assert.equal(
      findNodes(child, (node) => node.props.className === 'dsh-rs-meta').length,
      0,
      'a nested row has no meta line',
    )
  }
})

run('a subagent row shows the name its parent gave it, not the prompt opening', () => {
  // Real shape: DSH fills the child session's title from its opening prompt, so
  // the row would read as the first line of the task text without the catalog.
  const sessions = roster(
    [
      row('main', { title: '主会话' }),
      row('s1', { origin: 'subagent', parentId: 'main', title: '你在 DSH 团队里做岗位「Agent D」…' }),
    ],
    { main: { values: { subagentCatalog: [{ id: 's1', createdAt: 1, mode: 'continuable', label: '检索 Agent D' }] } } },
  )
  const menu = renderMenu({ sessions, status: statusMap({ main: false, s1: true }) })
  const text = textOf(menu)
  assert.match(text, /检索 Agent D/, 'the catalog label titles the row')
  assert.doesNotMatch(text, /你在 DSH 团队里做岗位/, 'the prompt opening never reaches the row')
})

run('a subagent dot is the same live green as a session dot', () => {
  const sessions = roster([row('main'), row('s1', { origin: 'subagent', parentId: 'main' })])
  const menu = renderMenu({ sessions, status: statusMap({ main: false, s1: true }) })
  const rows = findNodes(menu, (node) => node.props.className === 'dsh-rs-row')
  assert.equal(rows.length, 2)
  for (const rowNode of rows) {
    const [dot] = findNodes(rowNode, (node) => node.props.className === 'dsh-rs-dot')
    assert.equal(dot.props['data-live'], 'true')
  }
  // The colour lives in the stylesheet, not the tree: a sub-row dot must not
  // override the live green back to a "nested" tint.
  const { CSS } = require('../src/style.js')
  const rule = CSS.match(/\.dsh-rs-row\[data-sub=true\] \.dsh-rs-dot\{([^}]*)\}/)
  assert.ok(rule, 'the nested dot has its own sizing rule')
  assert.doesNotMatch(rule[1], /background|opacity/, 'the nested dot inherits the live colour instead of overriding it')
})

run('nested subagents are indented deeper than their parent subagent', () => {
  const sessions = roster([
    row('main', { title: '主会话' }),
    row('child', { origin: 'subagent', parentId: 'main', title: '子会话' }),
    row('grand', { origin: 'subagent', parentId: 'child', title: '孙会话' }),
  ])
  const menu = renderMenu({ sessions, status: statusMap({ main: false, child: true, grand: true }) })
  const rows = findNodes(menu, (node) => node.props.className === 'dsh-rs-row')
  assert.equal(rows.length, 3)
  assert.equal(rows[0].props['data-sub'], 'false')
  assert.equal(rows[1].props['data-depth'], '1', 'child is one level in')
  assert.equal(rows[2].props['data-depth'], '2', 'grandchild is two levels in')
  assert.ok(textOf(menu).indexOf('子会话') < textOf(menu).indexOf('孙会话'), 'tree order, not a flat list')
})

run('children stay under the right owner when two sessions run at once', () => {
  const sessions = roster([
    row('a', { title: '会话A', updatedAt: 30 }),
    row('b', { title: '会话B', updatedAt: 20 }),
    row('a1', { origin: 'subagent', parentId: 'a', title: 'A的子' }),
    row('b1', { origin: 'subagent', parentId: 'b', title: 'B的子' }),
  ])
  const status = statusMap({ a: false, b: false, a1: true, b1: true })
  const menu = renderMenu({ sessions, status })
  const rows = findNodes(menu, (node) => node.props.className === 'dsh-rs-row')
  const titleOfRow = (node) => textOf(findNodes(node, (part) => part.props.className === 'dsh-rs-title')[0]).trim()
  assert.equal(titleOfRow(rows[0]), '会话A')
  assert.equal(titleOfRow(rows[1]), 'A的子', 'A\'s child directly under A')
  assert.equal(titleOfRow(rows[2]), '会话B')
  assert.equal(titleOfRow(rows[3]), 'B的子', 'B\'s child directly under B, not grouped with A\'s')
})

run('the recent group never shows an overflow counter', () => {
  // A user with a long history saw "+113" under the three finished rows; the
  // counter is noise, so the capped remainder is simply not rendered.
  setConfig(normalizeConfig({ recentLimit: 1, showWhenIdle: true }))
  const rows = []
  for (let index = 0; index < 12; index += 1) rows.push(row(`done${index}`, { updatedAt: index }))
  const menu = renderMenu({ sessions: roster(rows), status: statusMap({}) })
  const text = textOf(menu)
  assert.match(text, /最近完成/, 'the group still renders')
  assert.doesNotMatch(text, /\+\d/, 'no "+N" counter anywhere in the menu')
  assert.equal(
    findNodes(menu, (node) => node.props.className === 'dsh-rs-row').length,
    1,
    'the limit still applies',
  )
})

run('subagent rows can be switched off while the session row stays', () => {
  setConfig(normalizeConfig({ subagentRows: false }))
  const sessions = roster([row('main'), row('s1', { origin: 'subagent', parentId: 'main' })])
  const menu = renderMenu({ sessions, status: statusMap({ main: false, s1: true }) })
  const rows = findNodes(menu, (node) => node.props.className === 'dsh-rs-row')
  assert.equal(rows.length, 1, 'only the owner row')
  assert.equal(rows[0].props['data-sub'], 'false')
  assert.doesNotMatch(textOf(menu), /运行中的子 agent/)
})

run('with subagent folding off the owner moves to recently finished', () => {
  setConfig(normalizeConfig({ subagentActivity: false }))
  const sessions = roster([row('main', { updatedAt: 10 }), row('s1', { origin: 'subagent', parentId: 'main' })])
  const menu = renderMenu({ sessions, status: statusMap({ main: false, s1: true }) })
  const text = textOf(menu)
  assert.match(text, /最近完成/, 'owner listed as recently finished instead')
  const rows = findNodes(menu, (node) => node.props.className === 'dsh-rs-row')
  assert.equal(rows.length, 1, 'the subagent does not reappear as its own session row')
  assert.equal(rows[0].props['data-sub'], 'false')
  assert.doesNotMatch(text, /运行中的子 agent/, 'no separate section either')
})

run('a session running its own turn carries no count badge', () => {
  setConfig(normalizeConfig({ subagentActivity: false }))
  const sessions = roster([row('main', { updatedAt: 10 }), row('s1', { origin: 'subagent', parentId: 'main' })])
  const menu = renderMenu({ sessions, status: statusMap({ main: true, s1: true }) })
  assert.equal(
    findNodes(menu, (node) => node.props.className === 'dsh-rs-badge').length,
    0,
    'the "N 子" badge was removed',
  )
  assert.doesNotMatch(textOf(menu), /\d 子/, 'no count text anywhere on a row')
})

run('the settings panel exposes every documented switch', () => {
  // The pill hides while idle by default; pin it visible so the icon is reachable.
  setConfig(normalizeConfig({ showWhenIdle: true }))
  const snapshot = { sessions: roster([row('main')]), status: statusMap({ main: false }) }
  const menu = renderMenu(snapshot)
  const settingsBtn = findNodes(menu, (node) => node.props.className === 'dsh-rs-iconBtn')[0]
  assert.ok(settingsBtn, 'settings button present')
  settingsBtn.props.onClick()
  const panel = renderAt(snapshot)
  const text = textOf(panel)
  for (const label of [
    '没有运行中会话时也显示胶囊',
    '显示工作区',
    '显示时间',
    '显示待处理标记',
    '子 agent 活动算作运行中',
    '在主会话下面列出子 agent',
    '恢复默认',
  ]) {
    assert.match(text, new RegExp(label), `settings row: ${label}`)
  }
  const switches = findNodes(panel, (node) => node.props.className === 'dsh-rs-switch')
  // Six booleans (the recent limit is a segmented control, not a switch), and
  // the "show subagent count" option was removed with its badge.
  assert.equal(switches.length, 6, 'every boolean option has a switch')
  assert.doesNotMatch(text, /显示子 agent 数量/, 'the removed count option has no row')
  assert.doesNotMatch(text, /单独列出运行中的子 agent/, 'the removed separate-list option has no row')
})

run('every switch writes through to the option store', () => {
  setConfig(normalizeConfig({ showWhenIdle: true }))
  const snapshot = { sessions: roster([row('main')]), status: statusMap({ main: false }) }
  const menu = renderMenu(snapshot)
  findNodes(menu, (node) => node.props.className === 'dsh-rs-iconBtn')[0].props.onClick()
  const panel = renderAt(snapshot)
  const switches = findNodes(panel, (node) => node.props.className === 'dsh-rs-switch')
  const labels = switches.map((node) => node.props['aria-label'])
  assert.equal(new Set(labels).size, switches.length, 'each switch has its own label')
  // Every switch must flip exactly one stored boolean; a switch wired to a dead
  // key would leave the option bag untouched, which is what this catches.
  for (const node of switches) {
    const before = JSON.stringify(getConfig())
    node.props.onClick()
    assert.notEqual(JSON.stringify(getConfig()), before, `switch "${node.props['aria-label']}" wrote nothing`)
  }
  // The panel reflects the store rather than keeping a private copy.
  const toggled = findNodes(renderAt(snapshot), (node) => node.props.className === 'dsh-rs-switch')
  assert.equal(
    toggled.filter((node) => node.props['aria-checked'] === 'false').length,
    switches.length,
    'one click on each switch leaves every option off',
  )
})

run('the reset row restores every default', () => {
  setConfig(normalizeConfig({ showWhenIdle: true, subagentActivity: false, recentLimit: 5 }))
  const snapshot = { sessions: roster([row('main')]), status: statusMap({ main: false }) }
  const menu = renderMenu(snapshot)
  findNodes(menu, (node) => node.props.className === 'dsh-rs-iconBtn')[0].props.onClick()
  const panel = renderAt(snapshot)
  const reset = findNodes(panel, (node) => node.props.className === 'dsh-rs-reset')[0]
  assert.ok(reset, 'reset row present')
  reset.props.onClick()
  const restored = getConfig()
  assert.equal(restored.subagentActivity, true)
  assert.equal(restored.recentLimit, 3)
})

run('the onboarding hint shows on the first open and never again', () => {
  const sessions = roster([row('main')])
  const status = statusMap({ main: true })
  assert.match(textOf(renderMenu({ sessions, status })), /点击即切换/, 'hint shown on the first open')
  // Closing the menu retires it for good.
  const pill = renderAt({ sessions, status })
  findNodes(pill, (node) => node.props.className === 'dsh-rs-pill')[0]
    .props.onPointerDown({ preventDefault() {}, stopPropagation() {} })
  renderAt({ sessions, status })
  assert.equal(hasSeenHint(), true, 'closing the menu retires the hint')
  assert.doesNotMatch(textOf(renderMenu({ sessions, status })), /点击即切换/, 'hint is not repeated')
})

run('the settings icon is an outline, not a filled blob', () => {
  const menu = renderMenu({ sessions: roster([row('main')]), status: statusMap({ main: true }) })
  const settingsBtn = findNodes(menu, (node) => node.props.className === 'dsh-rs-iconBtn')[0]
  const shapes = findNodes(settingsBtn, (node) => node.type === 'path' || node.type === 'circle')
  assert.ok(shapes.length >= 3, 'outline icon draws separate strokes')
  for (const shape of shapes) {
    assert.equal(shape.props.fill, 'none', 'no filled shape in the settings icon')
    assert.ok(shape.props.strokeWidth <= 1.2, 'hairline strokes only')
  }
})

run('the menu declares a window-drag exclusion for macOS overlays', () => {
  const menu = renderMenu({ sessions: roster([row('main')]), status: statusMap({ main: true }) })
  const box = findNodes(menu, (node) => node.props.className === 'dsh-rs-menu')[0]
  assert.ok(box, 'menu box rendered')
  assert.ok(
    Object.prototype.hasOwnProperty.call(box.props, internals.dragExcludeAttr),
    'a body portal has no layout box, so the visible menu declares the exclusion',
  )
})

run('one press toggles the menu exactly once', () => {
  // Two handlers observe a real press: the window capture listener the drag
  // surface requires, and the button's own React handler. It must count once.
  const snapshot = { sessions: roster([row('main')]), status: statusMap({ main: true }) }
  const pill = renderAt(snapshot)
  const button = findNodes(pill, (node) => node.props.className === 'dsh-rs-pill')[0]
  const event = { target: pill, preventDefault() {}, stopPropagation() {} }
  button.props.onPointerDown(event)
  const opened = renderAt(snapshot)
  assert.ok(
    findNodes(opened, (node) => node.props.className === 'dsh-rs-menu').length > 0,
    'one press opens the menu',
  )
  // The same press delivered to the second handler must not close it again.
  button.props.onPointerDown(event)
  assert.ok(
    findNodes(renderAt(snapshot), (node) => node.props.className === 'dsh-rs-menu').length > 0,
    'the second handler sees the press already claimed and leaves the menu open',
  )
})

run('a React synthetic press is claimed on the native event', () => {
  // In the browser the capture listener marks the DOM event while React hands the
  // button handler a SyntheticEvent wrapper. If the guard marked the wrapper, the
  // two paths would never agree and one press would toggle twice.
  const snapshot = { sessions: roster([row('main')]), status: statusMap({ main: true }) }
  const pill = renderAt(snapshot)
  const button = findNodes(pill, (node) => node.props.className === 'dsh-rs-pill')[0]
  const native = { target: pill }
  button.props.onPointerDown({ nativeEvent: native, target: pill, preventDefault() {}, stopPropagation() {} })
  assert.ok(findNodes(renderAt(snapshot), (node) => node.props.className === 'dsh-rs-menu').length > 0, 'opened')
  button.props.onPointerDown({ nativeEvent: native, target: pill, preventDefault() {}, stopPropagation() {} })
  assert.ok(
    findNodes(renderAt(snapshot), (node) => node.props.className === 'dsh-rs-menu').length > 0,
    'the shared native event carries the claim, so the wrapper cannot double-toggle',
  )
})

run('a fresh press still toggles after the previous one', () => {
  // The claim lives on the event, not on the component: a later press is a new
  // event and must close the menu again.
  const snapshot = { sessions: roster([row('main')]), status: statusMap({ main: true }) }
  const button = findNodes(renderAt(snapshot), (node) => node.props.className === 'dsh-rs-pill')[0]
  button.props.onPointerDown({ target: {}, preventDefault() {}, stopPropagation() {} })
  assert.ok(findNodes(renderAt(snapshot), (node) => node.props.className === 'dsh-rs-menu').length > 0)
  button.props.onPointerDown({ target: {}, preventDefault() {}, stopPropagation() {} })
  assert.equal(
    findNodes(renderAt(snapshot), (node) => node.props.className === 'dsh-rs-menu').length,
    0,
    'a second, distinct press closes it',
  )
})

run('a row click navigates through the workspace service', () => {
  const calls = []
  nav.bindRuntime({ uiWorkspace: { openSession: (id) => calls.push(id) } })
  const menu = renderMenu({ sessions: roster([row('main')]), status: statusMap({ main: true }) })
  findNodes(menu, (node) => node.props.className === 'dsh-rs-row')[0].props.onClick()
  assert.deepEqual(calls, ['main'])
})

run('a click stays inert when the workspace service throws', () => {
  // Cordis throws when a declared service has no active provider; a click that
  // happens during a workspace switch must not propagate that into the handler.
  const throwing = new Proxy({}, {
    get(_, prop) {
      if (prop === 'get') return () => { throw new Error('cannot get required service "uiWorkspace" in inactive context') }
      throw new Error(`cannot get required service "${String(prop)}" in inactive context`)
    },
  })
  nav.bindRuntime(throwing)
  const menu = renderMenu({ sessions: roster([row('main')]), status: statusMap({ main: true }) })
  const clickRow = () => findNodes(menu, (node) => node.props.className === 'dsh-rs-row')[0].props.onClick()
  assert.doesNotThrow(clickRow, 'an unavailable service must not throw out of onClick')
  assert.equal(nav.openSession('main'), false, 'the click reports that it went nowhere')
})

run('a missing service is reported once, not once per click', () => {
  const errors = []
  const original = console.error
  console.error = (...args) => errors.push(args)
  try {
    nav.bindRuntime(null)
    assert.equal(nav.openSession('a'), false)
    assert.equal(nav.openSession('b'), false)
    assert.equal(errors.length, 1, 'a click storm must not flood the console')
  } finally {
    console.error = original
  }
})

run('an unknown pending kind still renders a badge', () => {
  const sessions = roster([row('main', { updatedAt: 5 })])
  const status = statusMap({ main: { running: true, pendingInteraction: { kind: 'future-kind' } } })
  const menu = renderMenu({ sessions, status })
  const pending = findNodes(menu, (node) => node.props.className === 'dsh-rs-pending')
  assert.equal(pending.length, 1, 'a kind this build does not know is still surfaced')
  assert.match(textOf(pending[0]), /等待处理/)
})

run('a missing standard prop does not crash the header', () => {
  // No hooks at all: the seat renders nothing rather than throwing into the shell.
  const rendered = RunningSessionsPill({})
  assert.equal(rendered, null, 'no data, no pill')
})

check.summary()
