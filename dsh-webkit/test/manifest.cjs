#!/usr/bin/env node
'use strict'

// Guards the failure modes that a bundle hits silently at load time: a manifest
// pointing at a file that is not there, a client half whose loader id drifts
// from the package name, and an export shape the host refuses to parse.

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const exists = (relative) => fs.existsSync(path.join(root, relative))

let failures = 0
function check(name, ok, detail) {
  if (ok) {
    console.log(`ok   ${name}`)
    return
  }
  failures += 1
  console.log(`FAIL ${name} — ${detail === undefined ? '' : detail}`)
}

const pkg = JSON.parse(read('package.json'))

check('package name is dsh-webkit', pkg.name === 'dsh-webkit', pkg.name)
check('version is semver', /^\d+\.\d+\.\d+$/.test(pkg.version || ''), pkg.version)
check('license is MIT', pkg.license === 'MIT', pkg.license)

// --- what the host reads ---------------------------------------------------
check(
  'manifest declares the bundle patch',
  pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch === './cordis.patch.yml',
  JSON.stringify(pkg.dsh && pkg.dsh.bundle),
)
check(
  'manifest declares a web client half',
  pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web',
  JSON.stringify(pkg.dsh && pkg.dsh.client),
)
check(
  'client export resolves to a string',
  typeof (pkg.exports && pkg.exports['./client']) === 'string',
  JSON.stringify(pkg.exports && pkg.exports['./client']),
)

// --- every published path must exist --------------------------------------
const files = Array.isArray(pkg.files) ? pkg.files : []
check('files list is not empty', files.length > 0, files.length)
for (const entry of files) {
  if (entry.includes('*')) {
    const dir = path.join(root, path.dirname(entry))
    const suffix = path.extname(entry)
    const found = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((name) => name.endsWith(suffix))
      : []
    check(`files entry ${entry} matches something`, found.length > 0, found.length)
    continue
  }
  check(`files entry ${entry} exists`, exists(entry), 'missing')
}

for (const [key, value] of Object.entries(pkg.exports || {})) {
  if (typeof value !== 'string') continue
  if (value.includes('*')) {
    // A wildcard export is legal; what matters is that its directory is there.
    const dir = value.slice(0, value.indexOf('*'))
    check(`exports entry ${key} points at a real directory`, exists(dir.replace(/\/$/, '') || '.'), value)
    continue
  }
  check(`exports entry ${key} exists`, exists(value), value)
}

// --- bundle patch ----------------------------------------------------------
const patch = read('cordis.patch.yml')
check(
  'bundle patch inserts this package',
  new RegExp(`-\\s*id:\\s*${pkg.name}`).test(patch) && new RegExp(`name:\\s*'?${pkg.name}'?`).test(patch),
  patch.trim().replace(/\s+/g, ' '),
)

// --- client half contract --------------------------------------------------
const client = read('client.js')
check('client loader id matches the package name', client.includes(`id: '${pkg.name}'`), pkg.name)
check('client declares name', /exports\.name\s*=/.test(client), 'exports.name missing')
check('client declares inject', /exports\.inject\s*=\s*\[/.test(client), 'exports.inject missing')
check('client declares apply', /exports\.apply\s*=/.test(client), 'exports.apply missing')
check('client returns module.exports', /return module\.exports/.test(client), 'missing return')
check(
  'client wraps apply so a loader failure cannot break web boot',
  /catch[\s\S]{0,200}could not start/.test(client),
  'apply is not guarded',
)

// --- host half contract ----------------------------------------------------
const host = read('index.js')
check('host injects the web server', /export const inject\s*=\s*\[[^\]]*'webServer'/.test(host), 'webServer missing')
check(
  'host registers the snapshot route under its prefix',
  /ROUTE_PREFIX\s*=\s*'\/webkit'/.test(host) && /\$\{ROUTE_PREFIX\}\/snapshot/.test(host),
  'route missing',
)
check('host keeps the snapshot route same-origin only', /frame-ancestors 'self'/.test(host), 'no frame-ancestors')

// --- no vendor names in shipped files -------------------------------------
const banned = new RegExp(['z', 'code'].join(''), 'i')
for (const relative of ['client.js', 'index.js', 'README.md', 'package.json']) {
  check(`${relative} carries no reference-app name`, !banned.test(read(relative)), 'found a vendor name')
}

if (failures > 0) {
  console.log(`\nMANIFEST CHECK FAILED (${failures})`)
  process.exit(1)
}
console.log('\nMANIFEST CHECK PASSED')
