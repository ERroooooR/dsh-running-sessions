/**
 * Integration checks for the plugin surface and the source tree itself.
 *
 * Three things are pinned:
 *
 * 1. the dictionaries are complete and every key is used (no dead copy, no
 *    missing translation);
 * 2. `apply()` registers exactly the seat and namespace the contract names, and
 *    registers them through `ctx.effect` so a reload can take them back out;
 * 3. the layering rules hold — only `contract.js` names DSH's own surface, no
 *    view module reads a page global directly, and the generated bundle is
 *    current.
 *
 * Run: node test/integration.test.mjs
 */
import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assert, createReact, loadPlugin, makeChecker } from './harness.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const srcDir = path.join(root, 'src')

const react = createReact()
const contract = require('../src/contract.js')
const style = require('../src/style.js')
const i18n = require('../src/i18n.js')

/**
 * The loaded plugin, resolved on first use.
 *
 * Lazy on purpose: loading it pulls in every source module through Node, so a
 * layering violation (`require("react")` outside `platform.js`) would throw
 * `Cannot find module` here — before the check that reports it by name ever runs.
 * Deferring the load lets the source audit below fail first, with a message that
 * says which file broke the rule.
 */
let loadedInternals = null
function internalsOf() {
  if (loadedInternals === null) loadedInternals = loadPlugin(react)
  return loadedInternals
}

const check = makeChecker()

/**
 * Every static require specifier in one file, either quote style.
 *
 * The layering rules below are only worth what their matcher catches, so the
 * pattern mirrors `build.mjs`: `require("react")` must be found and rejected,
 * not skipped because someone typed the other quote.
 */
function requiresIn(text) {
  return [...text.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)].map((match) => match[2])
}

/** Every source file, relative to `src/`, with `/` separators. */
async function sourceFiles(dir = srcDir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })
  const found = []
  for (const entry of entries) {
    const next = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      found.push(...await sourceFiles(path.join(dir, entry.name), next))
      continue
    }
    if (entry.name.endsWith('.js')) found.push({ name: next, text: await readFile(path.join(dir, entry.name), 'utf8') })
  }
  return found
}

const files = await sourceFiles()
const byName = Object.fromEntries(files.map((file) => [file.name, file.text]))

// The three source audits run FIRST, before anything loads the plugin. Loading it
// pulls every module through Node, so a layering violation would surface there as
// an opaque "Cannot find module" instead of the named offence below.
check('only contract.js names DSH fields and services', () => {
  const offenders = []
  const dshWords = /['"](origin|parentId|subagentCatalog|projectionsBySession|pendingInteraction|blank|archivedSessionIds|uiWorkspace|conversation\.header\.leading|runningSessions|data-window-drag-exclude)['"]/
  for (const file of files) {
    if (file.name === 'contract.js' || file.name === 'dictionaries.js') continue
    if (dshWords.test(stripComments(file.text))) offenders.push(file.name)
  }
  assert.deepEqual(offenders, [], `DSH field names outside contract.js: ${offenders.join(', ')}`)
})

check('only platform.js requires react or react-dom', () => {
  const offenders = []
  for (const file of files) {
    if (file.name === 'platform.js' || file.name === 'main.js') continue
    if (requiresIn(file.text).some((spec) => spec === 'react' || spec === 'react-dom')) {
      offenders.push(file.name)
    }
  }
  assert.deepEqual(offenders, [], `platform modules required outside platform.js: ${offenders.join(', ')}`)
})

check('no source module requires another package', () => {
  const offenders = []
  for (const file of files) {
    for (const spec of requiresIn(file.text)) {
      if (spec.startsWith('.') || spec === 'react' || spec === 'react-dom') continue
      offenders.push(`${file.name}: ${spec}`)
    }
  }
  assert.deepEqual(offenders, [], `no third-party or Node-only require is allowed: ${offenders.join(', ')}`)
})

check('the dictionaries are key-identical in both locales', () => {
  const zh = Object.keys(i18n.DICTIONARIES.zh).sort()
  const en = Object.keys(i18n.DICTIONARIES.en).sort()
  assert.deepEqual(en, zh, 'every key exists in both dictionaries')
  assert.ok(zh.length > 25, `expected a real dictionary, saw ${zh.length} keys`)
  for (const key of zh) {
    assert.match(key, /^[a-z]+\.[A-Za-z.]+$/, `key shape: ${key}`)
    assert.ok(i18n.DICTIONARIES.zh[key].length > 0, `empty Chinese copy: ${key}`)
    assert.ok(i18n.DICTIONARIES.en[key].length > 0, `empty English copy: ${key}`)
  }
})

check('every literal t() key in the source exists in the dictionary', () => {
  const asked = new Set()
  for (const file of files) {
    if (file.name === 'dictionaries.js') continue
    for (const match of file.text.matchAll(/\bt\('([a-z]+\.[A-Za-z.]+)'/g)) asked.add(match[1])
  }
  assert.ok(asked.size > 10, `expected a meaningful key set, saw ${asked.size}`)
  for (const key of asked) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(i18n.DICTIONARIES.zh, key),
      `missing Chinese dictionary key: ${key}`,
    )
  }
})

check('every dictionary key is reachable from the source', () => {
  const runtime = new Set()
  for (const file of files) {
    if (file.name === 'dictionaries.js') continue
    for (const match of file.text.matchAll(/'([a-z]+\.[A-Za-z.]+)'/g)) runtime.add(match[1])
  }
  const unused = Object.keys(i18n.DICTIONARIES.zh).filter((key) => !runtime.has(key))
  assert.deepEqual(unused, [], `dictionary keys nothing renders: ${unused.join(', ')}`)
})

check('apply() registers the header seat and the locale namespace', () => {
  const events = []
  const effects = []
  const disposed = []
  const slotRegistrations = []
  const ctx = {
    slots: {
      inject(name, run) {
        events.push(`inject:${name}`)
        return run()
      },
      register(options, component) {
        slotRegistrations.push({ options, component })
        return () => disposed.push('slot')
      },
    },
    locale: {
      register(namespace, dictionaries) {
        events.push(`locale:${namespace}`)
        assert.ok(dictionaries.zh && dictionaries.en, 'both baseline locales are registered')
        return () => disposed.push('locale')
      },
    },
    effect(run, label) {
      effects.push(label)
      const dispose = run()
      if (typeof dispose === 'function') disposed.push(dispose)
      return dispose
    },
  }
  const plugin = require('../src/main.js').createPlugin((id) => {
    if (id === 'react') return react
    if (id === 'react-dom') return { createPortal: react.createPortal }
    throw new Error(`unexpected platform request: ${id}`)
  })
  plugin.apply(ctx)

  assert.deepEqual(events, [`locale:${contract.LOCALE_NS}`, `inject:${contract.SLOT}`])
  assert.deepEqual(effects, ['running-sessions: dictionaries', 'running-sessions: header seat'])
  assert.equal(slotRegistrations.length, 1, 'exactly one seat registration')
  const { options, component } = slotRegistrations[0]
  assert.equal(options.name, contract.SLOT)
  assert.equal(options.id, contract.SLOT_ID)
  assert.equal(options.order, contract.SLOT_ORDER)
  assert.equal(options.locale, contract.LOCALE_NS)
  assert.equal(component, internalsOf().RunningSessionsPill, 'the registered component is the real one')
  // Declared dependencies are the ones the component actually reaches for.
  assert.deepEqual(plugin.inject.slice().sort(), ['locale', 'slots', contract.SERVICE_WORKSPACE].sort())
})

check('every registration hands back a disposer', () => {
  const disposers = []
  const ctx = {
    slots: {
      inject: (name, run) => run(),
      register: () => () => disposers.push('slot'),
    },
    locale: { register: () => () => disposers.push('locale') },
    effect(run) {
      const result = run()
      if (typeof result === 'function') disposers.push(result)
      return result
    },
  }
  require('../src/main.js').createPlugin((id) => (id === 'react' ? react : { createPortal: react.createPortal }))
    .apply(ctx)
  assert.ok(disposers.length >= 2, 'a reload must be able to take the registrations back out')
})

check('the stylesheet is injected once and is balanced CSS', () => {
  style.resetStyles()
  const head = globalThis.document.head
  head.children.length = 0
  style.injectStyles()
  style.injectStyles()
  assert.equal(head.children.length, 1, 'a second activation must not double-inject')
  const css = head.children[0].textContent
  assert.equal(css, style.CSS)
  const open = (css.match(/\{/g) || []).length
  const close = (css.match(/\}/g) || []).length
  assert.equal(open, close, 'unbalanced braces in the injected stylesheet')
  assert.ok(open > 20, 'stylesheet defines the whole component')
  for (const selector of ['.dsh-rs-pill', '.dsh-rs-menu', '.dsh-rs-row', '.dsh-rs-switch', '.dsh-rs-segBtn']) {
    assert.ok(css.includes(selector), `stylesheet styles ${selector}`)
  }
  style.resetStyles()
})

check('a hot reload replaces the stylesheet instead of keeping the old one', () => {
  // A plugin reload keeps the page, so the <style> tag from the previous
  // activation is still in the head. Skipping it would leave the old sheet in
  // force: a CSS-only change would never reach an already-open window, and the
  // JS and the styling would disagree until a full reload.
  const page = globalThis.document
  const head = page.head
  head.children.length = 0
  style.resetStyles()
  page.querySelector = (selector) =>
    selector === `style[${'data-dsh-running-sessions'}]` ? head.children[0] || null : null

  style.injectStyles()
  assert.equal(head.children.length, 1, 'the first activation adds one tag')
  head.children[0].textContent = '.dsh-rs-pill{color:red}'

  // A reload loses the module state but not the DOM.
  style.resetStyles()
  style.injectStyles()
  assert.equal(head.children.length, 1, 'a reload must not add a second tag')
  assert.equal(head.children[0].textContent, style.CSS, 'the stale sheet is rewritten to the current one')

  page.querySelector = () => null
  style.resetStyles()
})

check('every styled class and attribute is actually emitted by the views', () => {
  // A rule that styles something no module ever renders is dead weight, and the
  // inverse — a class in the view with no rule — is an unstyled element. Only the
  // first half can be checked mechanically, because a className is sometimes
  // built by concatenation; those are listed explicitly.
  const code = files.filter((file) => file.name !== 'style.js').map((file) => file.text).join('\n')
  const css = require('../src/style.js').CSS
  const selectorNames = [...css.matchAll(/\.(dsh-rs-[A-Za-z0-9]+)/g)].map((match) => match[1])
  const selectorAttrs = [...css.matchAll(/\[([a-z-]+)=/g)].map((match) => match[1])
  const offenders = []
  for (const name of new Set(selectorNames)) {
    if (!code.includes(name)) offenders.push(`.${name}`)
  }
  for (const attr of new Set(selectorAttrs)) {
    if (!new RegExp(`['"]${attr}['"]`).test(code)) offenders.push(`[${attr}]`)
  }
  assert.deepEqual(offenders, [], `CSS targets nothing the views emit: ${offenders.join(', ')}`)
})

/** Strip comments so prose about "the window's edge" is not read as code. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

/** Modules allowed to touch a page global, and why. */
const PAGE_ACCESS_ALLOWED = new Set(['platform.js', 'style.js'])

check('only platform.js and style.js reach for a page global directly', () => {
  const offenders = []
  for (const file of files) {
    if (PAGE_ACCESS_ALLOWED.has(file.name)) continue
    if (/\b(window|document)\s*\./.test(stripComments(file.text))) offenders.push(file.name)
  }
  assert.deepEqual(offenders, [], `modules reaching past the platform adapter: ${offenders.join(', ')}`)
})

check('the pill wires its press handling through the tested guard', () => {
  // The guard lives in `press.js` so a test can drive it directly; this catches
  // the wiring being dropped while the module and its own checks stay green.
  const component = files.find((file) => file.name === 'component.js')
  assert.ok(component, 'component.js is part of the tree')
  assert.match(stripComments(component.text), /\battachPressGuard\(/)
})

/** The check files themselves, so the test seam counts as a real consumer. */
const testDir = path.join(root, 'test')
const testFiles = (await readdir(testDir))
  .filter((name) => name.endsWith('.mjs'))
  .map((name) => ({ name: `test/${name}`, text: readFileSync(path.join(testDir, name), 'utf8') }))

check('no module exports something nobody uses', () => {
  const offenders = []
  for (const file of files) {
    const code = stripComments(file.text)
    const match = code.match(/module\.exports = \{([\s\S]*?)\};/)
    if (!match) continue
    const exported = match[1]
      .split(',')
      .map((entry) => entry.split(':')[0].trim())
      .filter((entry) => /^\w+$/.test(entry))
    const consumers = [...files.filter((other) => other.name !== file.name), ...testFiles]
      .map((other) => other.text)
      .join('\n')
    // `main.js` is the entry: it re-exports the test seam and uses only a few of
    // those itself, which is expected. Every other module must use what it exports.
    const ownCode = code.replace(match[0], '')
    for (const name of exported) {
      if (!new RegExp(`\\b${name}\\b`).test(consumers)) {
        offenders.push(`${file.name}: exports unused ${name}`)
      } else if (file.name !== 'main.js' && !new RegExp(`\\b${name}\\b`).test(ownCode)) {
        // Re-exported for a consumer but never touched here: a leftover, not an
        // interface.
        offenders.push(`${file.name}: exports ${name} but never uses it`)
      }
    }
  }
  assert.deepEqual(offenders, [], `dead exports: ${offenders.join('; ')}`)
})

check('no module-level function is defined and then never called', () => {
  // Catches the leftovers an export check cannot see: a helper that was only ever
  // used by code that has since been folded away. Only module-level declarations
  // are considered, and a name that appears once is a definition with no caller
  // (a recursive function mentions itself at least twice).
  const offenders = []
  for (const file of files) {
    const code = stripComments(file.text)
    for (const match of code.matchAll(/^function (\w+)\s*\(/gm)) {
      const name = match[1]
      const uses = (code.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length
      if (uses <= 1) offenders.push(`${file.name}: ${name}`)
    }
  }
  assert.deepEqual(offenders, [], `defined but never called: ${offenders.join(', ')}`)
})

check('no module imports something it never uses', () => {
  const offenders = []
  const importLine = /^const (\{[^}]+\}|\w+) = require\('([^']+)'\);?$/
  for (const file of files) {
    const lines = stripComments(file.text).split('\n')
    lines.forEach((line, index) => {
      const match = line.match(importLine)
      if (!match) return
      const bound = match[1]
      const specifier = match[2]
      const symbols = bound.startsWith('{')
        ? bound.slice(1, -1).split(',').map((entry) => entry.trim()).filter(Boolean)
        : [bound]
      // Count uses anywhere except this one import line.
      const rest = lines.filter((other, otherIndex) => otherIndex !== index).join('\n')
      for (const symbol of symbols) {
        const name = symbol.split(':').pop().trim()
        if (!new RegExp(`\\b${name}\\b`).test(rest)) {
          offenders.push(`${file.name}: imports unused ${name} from ${specifier}`)
        }
      }
    })
  }
  assert.deepEqual(offenders, [], `dead imports: ${offenders.join('; ')}`)
})

await check.async('the generated bundle is current', async () => {
  const { bundle } = await import('../build.mjs')
  const { code } = await bundle()
  const shipped = await readFile(path.join(root, 'client.js'), 'utf8')
  assert.equal(shipped, code, 'client.js is stale — run `npm run build`')
})

await check.async('the generated bundle contains every source module', async () => {
  const { bundle } = await import('../build.mjs')
  const { count } = await bundle()
  assert.equal(count, files.length, 'bundle module count matches the source tree')
  const shipped = await readFile(path.join(root, 'client.js'), 'utf8')
  assert.match(shipped, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(shipped, /id: "dsh-running-sessions"/)
})

check.summary()