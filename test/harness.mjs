/**
 * Shared harness for the headless checks.
 *
 * Two jobs:
 *
 * 1. Load the *source* modules from `src/` directly (they are plain CommonJS),
 *    so the checks exercise what a maintainer edits rather than the generated
 *    `client.js`. `test/bundle.test.mjs` separately proves the generated file is
 *    current.
 * 2. Supply the handful of page globals the modules touch, plus a minimal React
 *    stand-in with real hook state, so a component can be rendered without a DOM.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** Page globals the modules read through `platform`. */
export function installPageGlobals() {
  const store = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        store.set(key, String(value))
      },
      removeItem: (key) => {
        store.delete(key)
      },
    },
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 1280,
    innerHeight: 800,
  }
  const head = { children: [], appendChild(node) { head.children.push(node) } }
  globalThis.document = {
    querySelector: () => null,
    createElement: (tag) => ({ tag, attributes: {}, textContent: '' , setAttribute(name, value) { this.attributes[name] = value } }),
    head,
    body: {},
    addEventListener() {},
    removeEventListener() {},
  }
  return { store, head }
}

/** The stored option bag, for assertions that care about persistence. */
export function localStorageStore() {
  return globalThis.window.localStorage
}

/**
 * Load the plugin internals with a React stand-in already bound.
 * @returns the `__internals` table from `src/main.js`
 */
export function loadPlugin(react) {
  installPageGlobals()
  const internals = require('../src/main.js').__internals
  internals.configurePlatform({ React: react, createPortal: react.createPortal })
  return internals
}

/**
 * Minimal React stand-in: persistent hook state, refs, and a portal node.
 *
 * Function components are expanded inline, the way React reconciles them, so a
 * component that delegates to a child component (`element(Child, props)`) renders
 * to the child's tree. Hook state is keyed by a cursor that resets per render
 * pass, exactly like React's hook order.
 */
export function createReact() {
  const stub = {
    _index: 0,
    _states: [],
    _refs: [],
    _depth: 0,
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      // A function component is rendered immediately: the tree returned to the
      // caller is the DOM-shaped one, and hooks run in call order.
      if (typeof type === 'function') {
        stub._depth += 1
        try {
          if (stub._depth > 50) throw new Error('render depth exceeded: a component renders itself')
          return stub.render(type(props || {}))
        } finally {
          stub._depth -= 1
        }
      }
      return { type, props: props || {}, children: flatten(children) }
    },
    /** Render one element tree, expanding any component it produces. */
    render(node) {
      if (node === null || node === undefined || node === false || node === true) return null
      if (Array.isArray(node)) return node.map((item) => stub.render(item)).filter((item) => item !== null)
      if (typeof node !== 'object') return node
      return { ...node, children: flatten(node.children).map((child) => stub.render(child)).filter((c) => c !== null) }
    },
    useRef(initial) {
      const index = stub._index++
      if (stub._refs[index] === undefined) stub._refs[index] = { current: initial }
      return stub._refs[index]
    },
    useState(initial) {
      const index = stub._index++
      if (stub._states[index] === undefined) {
        stub._states[index] = typeof initial === 'function' ? initial() : initial
      }
      const set = (next) => {
        stub._states[index] = typeof next === 'function' ? next(stub._states[index]) : next
      }
      return [stub._states[index], set]
    },
    useMemo(compute) {
      return compute()
    },
    useCallback(fn) {
      return fn
    },
    useEffect() {},
    useLayoutEffect() {},
    createPortal(node) {
      return { type: 'portal', props: {}, children: [node] }
    },
  }
  return stub
}

function flatten(children) {
  const out = []
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (value === null || value === undefined || value === false || value === true) return
    out.push(value)
  }
  for (const child of children) walk(child)
  return out
}

/** Concatenate every text node in a rendered tree, for assertion by substring. */
export function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (!node.children) return ''
  return node.children.map(textOf).join(' ')
}

/** Count rendered elements whose props match a predicate. */
export function countNodes(node, predicate) {
  if (!node || typeof node !== 'object') return 0
  if (Array.isArray(node)) return node.reduce((sum, item) => sum + countNodes(item, predicate), 0)
  let total = predicate(node) ? 1 : 0
  for (const child of node.children) total += countNodes(child, predicate)
  return total
}

/** Every rendered element whose props match a predicate. */
export function findNodes(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const item of node) findNodes(item, predicate, found)
    return found
  }
  if (predicate(node)) found.push(node)
  for (const child of node.children) findNodes(child, predicate, found)
  return found
}

/**
 * A session-list row as the Session Controller projects it.
 * Defaults mirror a finished, loaded session; tests override per case.
 */
export function row(id, extra = {}) {
  return { id, displayTitle: id, running: false, retainedBy: {}, blank: false, updatedAt: 0, ...extra }
}

/** A session-list snapshot (`useSessions`). */
export function roster(rows, projectionsBySession = {}) {
  const byId = Object.fromEntries(rows.map((entry) => [entry.id, entry]))
  return { ids: rows.map((entry) => entry.id), byId, phase: 'ready', projectionsBySession }
}

/** A status snapshot (`useSessionStatus`). */
export function statusMap(entries) {
  return new Map(
    Object.entries(entries).map(([id, value]) => [
      id,
      typeof value === 'boolean'
        ? { running: value, pendingInteraction: undefined, completionUnread: false }
        : value,
    ]),
  )
}

/** A workspace snapshot (`useWorkspaces`). */
export const noWorkspaces = { items: [], archivedSessionIds: [] }

/** Small assertion helper that reports a count while running. */
export function makeChecker() {
  let passed = 0
  const check = (name, fn) => {
    fn()
    passed += 1
    console.log('ok -', name)
  }
  /** The same, for a check that has to await something (a rebuild, a read). */
  check.async = async (name, fn) => {
    await fn()
    passed += 1
    console.log('ok -', name)
  }
  check.summary = () => console.log(`\n${passed} checks passed`)
  return check
}

export { assert }
