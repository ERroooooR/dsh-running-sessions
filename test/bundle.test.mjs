/**
 * Bundle checks: run the *shipped* `client.js` in a browser-shaped sandbox.
 *
 * Every other check drives the `src/` modules directly. This one is why that is
 * safe: it proves the generated artifact is a real module-loader bundle — it
 * registers under the package id, materialises from one factory call, resolves
 * relative requires through its own registry, and `apply()` performs exactly the
 * registrations the source-level check asserts.
 *
 * Run: node test/bundle.test.mjs
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import path from 'node:path'
import { assert, createReact, makeChecker } from './harness.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const check = makeChecker()

/** The documented registration sequence, asserted verbatim by a check below. */
const EXPECTED_REGISTRATIONS = [
  'effect:running-sessions: dictionaries',
  'locale:runningSessions:en|zh',
  'effect:running-sessions: header seat',
  'inject:conversation.header.leading',
  'register:running-sessions:conversation.header.leading',
]

/**
 * Evaluate the bundle in a fresh page-shaped context.
 * @param table - the module table the kernel would answer with
 * @returns the entry, plugin exports, registrations, requested ids, and page nodes
 */
async function runBundle(table) {
  const source = await readFile(path.join(root, 'client.js'), 'utf8')
  const store = new Map()
  const head = {
    children: [],
    appendChild(node) {
      head.children.push(node)
    },
  }
  const sandbox = { console, setInterval: () => 0, clearInterval: () => {} }
  sandbox.window = {
    __ModuleLoader__: {
      load(entry) {
        this.entry = entry
      },
    },
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
  sandbox.document = {
    querySelector: () => null,
    createElement: () => ({ setAttribute() {}, textContent: '' }),
    head,
    body: {},
    addEventListener() {},
    removeEventListener() {},
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'client.js' })

  const entry = sandbox.window.__ModuleLoader__.entry
  assert.ok(entry, 'the bundle must register a module factory with the loader')
  const requested = []
  const plugin = entry.factory((id) => {
    requested.push(id)
    if (!(id in table)) throw new Error(`unexpected platform request: ${id}`)
    return table[id]
  })

  const registrations = []
  const ctx = {
    slots: {
      inject(name, run) {
        registrations.push(`inject:${name}`)
        return run()
      },
      register(options) {
        registrations.push(`register:${options.id}:${options.name}`)
        return () => {}
      },
    },
    locale: {
      register(namespace, dictionaries) {
        registrations.push(`locale:${namespace}:${Object.keys(dictionaries).sort().join('|')}`)
        return () => {}
      },
    },
    effect(run, label) {
      registrations.push(`effect:${label}`)
      const dispose = run()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  plugin.apply(ctx)
  return { entry, plugin, registrations, requested, head, store }
}

/** The module table the kernel provides for a normal page. */
function standardTable() {
  const react = createReact()
  return { react, 'react-dom': { createPortal: react.createPortal } }
}

await check.async('the bundle registers under the package id with one factory', async () => {
  const { entry } = await runBundle(standardTable())
  assert.equal(entry.id, 'dsh-running-sessions')
  assert.equal(typeof entry.factory, 'function')
})

await check.async('materialising the bundle asks the kernel for react and react-dom only', async () => {
  const { requested } = await runBundle(standardTable())
  assert.deepEqual([...new Set(requested)].sort(), ['react', 'react-dom'])
})

await check.async('the bundle exposes the plugin surface and registers it', async () => {
  const { plugin, registrations } = await runBundle(standardTable())
  assert.deepEqual([...Object.keys(plugin)].sort(), ['apply', 'inject'])
  // Copy out of the VM realm: the array lives in another context's prototype.
  assert.deepEqual([...plugin.inject], ['slots', 'locale', 'uiWorkspace'])
  assert.deepEqual([...registrations], EXPECTED_REGISTRATIONS)
})

await check.async('the bundle injects its stylesheet once, into document.head', async () => {
  const { head } = await runBundle(standardTable())
  const styles = head.children.filter((node) => node.textContent && node.textContent.includes('.dsh-rs-pill'))
  assert.equal(styles.length, 1, 'exactly one stylesheet, no duplicate on activation')
})

await check.async('relative requires resolve inside the bundle registry', async () => {
  // `view/icons` requires `../platform`, so a complete module graph is proof the
  // registry resolves parent-relative names; a broken path throws "missing module"
  // at materialization and `apply` would never run.
  const { plugin } = await runBundle(standardTable())
  assert.equal(typeof plugin.apply, 'function')
  const source = await readFile(path.join(root, 'client.js'), 'utf8')
  assert.match(source, /function resolveName\(fromName, spec\)/)
  const definitions = [...source.matchAll(/^ {4}define\("([^"]+)", function/mg)].map((match) => match[1])
  assert.ok(definitions.includes('main'), 'the entry module is defined')
  assert.ok(definitions.includes('view/icons'), 'a nested view module is defined')
  assert.ok(definitions.length > 15, `expected the whole tree, saw ${definitions.length} definitions`)
})

await check.async('a module table without react-dom still registers the seat', async () => {
  // A future DSH that drops `react-dom` from its platform table must not take the
  // seat down with it; the portal simply degrades away.
  const react = createReact()
  const { registrations } = await runBundle({ react, 'react-dom': {} })
  assert.deepEqual([...registrations], EXPECTED_REGISTRATIONS)
})

check.summary()
