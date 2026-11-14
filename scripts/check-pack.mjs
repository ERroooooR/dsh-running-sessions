#!/usr/bin/env node
/**
 * Verify the npm tarball carries everything an installed copy needs.
 *
 * `files` in package.json is a whitelist, but npm also always ships README,
 * LICENSE and package.json, and a typo in the whitelist drops a runtime file
 * without failing anything else. The published bundle is what users install, so
 * this checks the packed listing rather than the working tree.
 */
import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Files an installed plugin cannot work without. */
const REQUIRED = [
  'package.json',
  'README.md',
  'LICENSE',
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'locale/en.json',
  'locale/zh.json',
]

/** Anything matching these must stay out of the tarball. */
const FORBIDDEN = [/^test\//, /^\.github\//, /^scripts\//, /^node_modules\//, /\.test\.mjs$/, /^preview.*\.png$/]

/**
 * The first complete JSON value in `raw`.
 *
 * `npm pack --json` is the only thing this runs, but its stdout is not guaranteed
 * to be nothing else — a notice line on stdout would otherwise break the parse at
 * the first bracket it finds.
 */
function firstJson(raw) {
  const start = raw.search(/[[{]/)
  if (start < 0) return undefined
  const open = raw[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return JSON.parse(raw.slice(start, index + 1))
    }
  }
  return undefined
}

/**
 * Normalise the pack report.
 *
 * npm 11 answers with a one-element array; npm 12 answers with an object keyed by
 * package name. Both describe the same thing, and this script runs under whichever
 * npm the machine happens to have.
 */
function readReport(raw) {
  const parsed = firstJson(raw)
  if (!parsed) throw new Error('npm pack --dry-run --json printed no JSON report:\n' + raw)
  const report = Array.isArray(parsed) ? parsed[0] : parsed[Object.keys(parsed)[0]]
  if (!report || !Array.isArray(report.files)) throw new Error('unexpected pack report shape')
  return report
}

function describe(report) {
  return report.files.map((entry) => entry.path)
}

/**
 * npm on Windows is a .cmd shim that Node will not spawn without a shell, so the
 * command goes through one on every platform. Nothing here is user input, and a
 * plain string keeps Node from warning about args-plus-shell concatenation.
 */
function pack() {
  return execSync('npm pack --dry-run --json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function main() {
  const report = readReport(pack())
  const files = describe(report)

  const missing = REQUIRED.filter((path) => !files.includes(path))
  const leaked = files.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)))

  if (missing.length > 0) console.error('missing from tarball: ' + missing.join(', '))
  if (leaked.length > 0) console.error('should not be packed: ' + leaked.join(', '))
  if (missing.length > 0 || leaked.length > 0) process.exit(1)

  console.log(
    `${report.name}@${report.version}: ${files.length} files, ${(report.size / 1024).toFixed(1)} KiB packed`,
  )
}

export { firstJson, readReport, describe, REQUIRED, FORBIDDEN }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
