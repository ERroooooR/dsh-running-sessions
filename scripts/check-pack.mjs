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
 * npm on Windows is a .cmd shim that Node will not spawn without a shell, so the
 * command goes through one on every platform. Nothing here is user input, and a
 * plain string keeps Node from warning about args-plus-shell concatenation.
 */
const raw = execSync('npm pack --dry-run --json', {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})

const start = raw.indexOf('[')
if (start < 0) {
  console.error('npm pack --dry-run --json printed no JSON report:\n' + raw)
  process.exit(1)
}

const [report] = JSON.parse(raw.slice(start))
const files = report.files.map((entry) => entry.path)

const missing = REQUIRED.filter((path) => !files.includes(path))
const leaked = files.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)))

if (missing.length > 0) console.error('missing from tarball: ' + missing.join(', '))
if (leaked.length > 0) console.error('should not be packed: ' + leaked.join(', '))
if (missing.length > 0 || leaked.length > 0) process.exit(1)

console.log(
  `${report.name}@${report.version}: ${files.length} files, ${(report.size / 1024).toFixed(1)} KiB packed`,
)
