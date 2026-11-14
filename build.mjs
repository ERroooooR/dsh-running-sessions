#!/usr/bin/env node
/**
 * Bundle `src/` into the single `client.js` the Host serves.
 *
 * Why a build step at all: a DSH client plugin arrives as one classic script that
 * calls `window.__ModuleLoader__.load({ id, factory })`. Package-local chunks do
 * exist (`require.async('./client.<name>.js')`), but they pin the plugin to a
 * second, far more specialised part of the module-system protocol — the opposite
 * of decoupling. So the source is modular and the shipped artifact stays one
 * self-contained file, with no new protocol surface.
 *
 * The source modules are plain CommonJS. This script wraps each body in a small
 * registry and emits concatenated output; there is no transpiler, no dependency,
 * no code transform — a module body is emitted verbatim. `test/harness.mjs`
 * requires the same `src/` modules directly, so the checks exercise the real
 * source rather than the generated file.
 *
 * Usage:
 *   node build.mjs            rebuild client.js when the output changed
 *   node build.mjs --check    fail when client.js is stale (used by npm test)
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = path.join(root, 'src')
const OUT_FILE = path.join(root, 'client.js')

/** Modules the browser kernel provides; a bare require must name one of them. */
const PLATFORM_MODULES = new Set(['react', 'react-dom'])

const PACKAGE_ID = 'dsh-running-sessions'
const ENTRY = 'main'

/** Code-unit order: deterministic on every machine, unlike a locale-aware sort. */
function compareNames(a, b) {
  if (a.name < b.name) return -1
  if (a.name > b.name) return 1
  return 0
}

/** Every `src/**\/*.js`, flattened to `/`-joined names without the extension. */
async function listModules(dir = SRC_DIR, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })
  const found = []
  for (const entry of entries) {
    if (entry.name === 'package.json') continue
    const nextPrefix = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      found.push(...await listModules(path.join(dir, entry.name), nextPrefix))
      continue
    }
    if (!entry.name.endsWith('.js')) continue
    found.push({ name: nextPrefix.slice(0, -'.js'.length), file: path.join(dir, entry.name) })
  }
  // Sorted here so the emitted bundle is byte-identical across machines; a
  // locale-aware comparison would reorder it under a different ICU locale.
  return found.sort(compareNames)
}

/**
 * Every static `require('…')` specifier a module body asks for.
 *
 * Both quote styles are accepted because the guard is only as good as its
 * matcher: a `require("react")` written with double quotes must be *seen* here
 * (and rejected by the platform allow-list) rather than silently skipped.
 */
function requiresOf(body) {
  return [...body.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)].map((match) => match[2])
}

/** Resolve `./x` from one module's own name, the way Node resolves it. */
function resolveName(fromName, spec) {
  const slash = fromName.lastIndexOf('/')
  const out = (slash === -1 ? '' : fromName.slice(0, slash)).split('/').filter((part) => part !== '')
  for (const part of spec.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/**
 * Validate every request up front: a relative request must resolve to a source
 * module, a bare word must be a platform module. A renamed or deleted module then
 * fails the build instead of the browser.
 */
function checkRequires(modules, knownNames) {
  const failures = []
  for (const module of modules) {
    for (const spec of requiresOf(module.body)) {
      if (spec.startsWith('.')) {
        const target = resolveName(module.name, spec)
        if (!knownNames.has(target)) {
          failures.push(`${module.name}: require('${spec}') resolves to "${target}", which is not a src module`)
        }
        continue
      }
      if (!PLATFORM_MODULES.has(spec)) {
        failures.push(`${module.name}: require('${spec}') is not a platform module`)
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`build: unresolved module requests\n  - ${failures.join('\n  - ')}`)
  }
}

/** One module becomes one `define(name, body)` call; the body is verbatim. */
function wrapModule(module) {
  return `    define(${JSON.stringify(module.name)}, function (module, exports, require) {\n`
    + `${module.body.replace(/\s+$/, '')}\n`
    + '    });'
}

function render(modules) {
  const header = [
    '/**',
    ` * ${PACKAGE_ID} — GENERATED BUNDLE. Source lives in src/; edit there and run`,
    ' * `npm run build`. `npm test` refuses to run against a stale bundle.',
    ' */',
    'window.__ModuleLoader__.load({',
    `  id: ${JSON.stringify(PACKAGE_ID)},`,
    '  factory(require) {',
    '    // Package-local registry. Kept inside the factory on purpose: the kernel',
    '    // calls it once per activation and nothing leaks into the page.',
    '    const definitions = Object.create(null);',
    '    const cache = Object.create(null);',
    '    function define(name, body) {',
    '      definitions[name] = body;',
    '    }',
    '    // `./x` resolves against the requiring module, exactly as Node would; a',
    '    // bare word falls through to the kernel module table.',
    '    function resolveName(fromName, spec) {',
    "      const slash = fromName.lastIndexOf('/');",
    "      const parts = (slash === -1 ? '' : fromName.slice(0, slash)).split('/');",
    "      const out = parts.filter(function (part) { return part !== ''; });",
    "      for (const part of spec.split('/')) {",
    "        if (part === '' || part === '.') continue;",
    '        if (part === "..") out.pop();',
    '        else out.push(part);',
    '      }',
    "      return out.join('/');",
    '    }',
    '    function load(name) {',
    '      const cached = cache[name];',
    '      if (cached !== undefined) return cached.exports;',
    '      const body = definitions[name];',
    '      if (body === undefined) {',
    '        throw new Error(' + JSON.stringify('[running-sessions] missing module: ') + ' + name);',
    '      }',
    '      const module = { exports: {} };',
    '      cache[name] = module;',
    '      body(module, module.exports, localRequire(name));',
    '      return module.exports;',
    '    }',
    '    function localRequire(fromName) {',
    '      return function (spec) {',
    "        return spec.startsWith('.') ? load(resolveName(fromName, spec)) : require(spec);",
    '      };',
    '    }',
    '',
  ].join('\n')
  const footer = [
    '',
    `    return load(${JSON.stringify(ENTRY)}).createPlugin(require);`,
    '  },',
    '});',
    '',
  ].join('\n')
  return `${header}${modules.map(wrapModule).join('\n\n')}${footer}`
}

/** Read, validate and render the bundle. */
export async function bundle() {
  const listed = await listModules()
  const modules = []
  for (const entry of listed) {
    modules.push({ name: entry.name, body: await readFile(entry.file, 'utf8') })
  }
  const names = new Set(modules.map((module) => module.name))
  if (!names.has(ENTRY)) throw new Error(`build: src/${ENTRY}.js is missing`)
  checkRequires(modules, names)
  return { code: render(modules), count: modules.length }
}

async function main(argv) {
  const checkOnly = argv.includes('--check')
  const { code, count } = await bundle()
  let current = ''
  try {
    current = await readFile(OUT_FILE, 'utf8')
  } catch (error) {
    if (checkOnly) throw new Error(`build --check: client.js is missing (${error.message})`)
  }
  if (current === code) {
    console.log(`client.js is up to date (${count} modules)`)
    return
  }
  if (checkOnly) throw new Error('build --check: client.js is stale — run `npm run build`')
  // Never touch mtime for an identical bundle: the Host derives a plugin revision
  // from it, and a rewrite would reload the page's plugin for nothing.
  await writeFile(OUT_FILE, code, 'utf8')
  console.log(`client.js rebuilt (${count} modules, ${code.length} bytes)`)
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
