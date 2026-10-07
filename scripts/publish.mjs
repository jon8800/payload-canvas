#!/usr/bin/env node
// Publishes packed tarballs to npm with a raw authenticated PUT.
//
//   node scripts/publish.mjs [--dry-run] [--expect-version <x.y.z>] <tarball.tgz | folder>...
//
// Why not `npm publish` / `pnpm publish`: on this npm account they fail with 403. The account uses
// security-key-only 2FA, and that collides with the CLI's OTP flow. The registry accepts the same
// request that npm builds internally when it comes with a granular token that has "bypass 2FA".
//
// Input is the tarball from `pnpm pack` (only pnpm applies `publishConfig.exports`). The script
// reads `package/package.json` from inside the tarball and publishes exactly that manifest, so the
// registry metadata always matches what a consumer installs.
//
// - A version that already exists on npm is skipped, so a re-run after a partial failure is safe.
// - `--dry-run` builds the full request body and prints it in summary. It sends nothing.
// - `--expect-version` fails when a tarball has a different version (CI passes the git tag).
// - The token comes from NPM_TOKEN or from `_authToken` in ~/.npmrc. It is never printed.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { gunzipSync } from 'node:zlib'

const REGISTRY = 'https://registry.npmjs.org'

function fail(message) {
  console.error(`[publish] ${message}`)
  process.exit(1)
}

// Arguments -------------------------------------------------------------------------------------

const { values, positionals: inputs } = parseArgs({
  allowPositionals: true,
  options: { 'dry-run': { type: 'boolean' }, 'expect-version': { type: 'string' } },
})
const dryRun = Boolean(values['dry-run'])
const expectVersion = values['expect-version']

const tarballs = inputs.flatMap((input) => {
  if (!fs.existsSync(input)) fail(`not found: ${input}`)
  if (!fs.statSync(input).isDirectory()) return [input]
  return fs
    .readdirSync(input)
    .filter((file) => file.endsWith('.tgz'))
    .map((file) => path.join(input, file))
})
if (tarballs.length === 0) fail('no tarballs. Usage: node scripts/publish.mjs [--dry-run] <tarball.tgz | folder>...')

// Tarball reading -------------------------------------------------------------------------------

// Returns a map of entry name -> Buffer for the regular files in a .tgz (ustar format).
function readTarball(buffer) {
  const tar = gunzipSync(buffer)
  const files = new Map()
  let offset = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '')
    const name = field(0, 100)
    const prefix = field(345, 155)
    const size = Number.parseInt(field(124, 12).trim() || '0', 8)
    const type = field(156, 1)
    const fullName = prefix ? `${prefix}/${name}` : name
    if (type === '0' || type === '') files.set(fullName, tar.subarray(offset + 512, offset + 512 + size))
    offset += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

// Builds the PUT body that npm's libnpmpublish would send for this tarball.
function buildRequest(file) {
  const buffer = fs.readFileSync(file)
  const entries = readTarball(buffer)
  const pkgJson = entries.get('package/package.json')
  if (!pkgJson) fail(`${file}: no package/package.json inside`)
  const manifest = JSON.parse(pkgJson.toString('utf8'))
  const { name, version } = manifest

  if (!name || !version) fail(`${file}: package.json has no name or version`)
  if (manifest.private) fail(`${name}: package is private`)
  if (expectVersion && version !== expectVersion) {
    fail(`${name}: tarball version ${version} does not match the expected version ${expectVersion} (git tag)`)
  }
  // Entry points must resolve to shipped files, never to src/ (src/ is not in the package).
  const entryPoints = JSON.stringify([manifest.main, manifest.module, manifest.types, manifest.bin, manifest.exports])
  if (entryPoints.includes('/src/')) {
    fail(`${name}: package.json in the tarball still points at src/. Pack with pnpm so publishConfig applies.`)
  }
  if (![...entries.keys()].some((entry) => entry.startsWith('package/dist/'))) {
    fail(`${name}: the tarball has no dist/ files. Build before packing.`)
  }

  const readmeEntry = [...entries.keys()].find((entry) => /^package\/readme(\.md)?$/i.test(entry))
  const tarballName = `${name.replace(/^@[^/]+\//, '')}-${version}.tgz`
  const shasum = createHash('sha1').update(buffer).digest('hex')
  const integrity = `sha512-${createHash('sha512').update(buffer).digest('base64')}`

  const versionManifest = {
    ...manifest,
    _id: `${name}@${version}`,
    _nodeVersion: process.versions.node,
    ...(readmeEntry && {
      readme: entries.get(readmeEntry).toString('utf8'),
      readmeFilename: path.posix.basename(readmeEntry),
    }),
    dist: { integrity, shasum, tarball: `${REGISTRY}/${name}/-/${tarballName}` },
  }
  // A prerelease (1.0.0-beta.1) must not become the version that `npm install <name>` picks.
  const distTag = version.includes('-') ? 'next' : 'latest'

  const body = {
    _id: name,
    name,
    description: manifest.description,
    'dist-tags': { [distTag]: version },
    versions: { [version]: versionManifest },
    access: 'public',
    _attachments: {
      [`${name}-${version}.tgz`]: {
        content_type: 'application/octet-stream',
        data: buffer.toString('base64'),
        length: buffer.length,
      },
    },
  }
  return { file, name, version, distTag, shasum, integrity, size: buffer.length, manifest, body }
}

// Registry ---------------------------------------------------------------------------------------

const packageUrl = (name) => `${REGISTRY}/${name.replace('/', '%2f')}`

// Returns true / false, or undefined when the registry cannot be reached.
async function versionExists(name, version) {
  try {
    const res = await fetch(packageUrl(name), { headers: { accept: 'application/vnd.npm.install-v1+json' } })
    if (res.status === 404) return false
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const packument = await res.json()
    return Boolean(packument.versions?.[version])
  } catch (error) {
    if (dryRun) {
      console.warn(`[publish] could not check npm for ${name}@${version}: ${error.message}`)
      return undefined
    }
    fail(`could not check npm for ${name}@${version}: ${error.message}`)
  }
}

function readToken() {
  const fromEnv = process.env.NPM_TOKEN?.trim()
  if (fromEnv) return fromEnv
  const npmrc = path.join(homedir(), '.npmrc')
  if (!fs.existsSync(npmrc)) return undefined
  return fs.readFileSync(npmrc, 'utf8').match(/\/\/registry\.npmjs\.org\/:_authToken=(.+)/)?.[1]?.trim()
}

// Main -------------------------------------------------------------------------------------------

const requests = tarballs.map(buildRequest)
const token = dryRun ? undefined : readToken()
if (!dryRun && !token) fail('no token: set NPM_TOKEN or add //registry.npmjs.org/:_authToken=... to ~/.npmrc')

let failed = false
for (const request of requests) {
  const { name, version, distTag, manifest } = request
  const exists = await versionExists(name, version)

  if (dryRun) {
    const bodySize = Buffer.byteLength(JSON.stringify(request.body))
    console.log(
      [
        `[publish] DRY RUN ${name}@${version} (nothing sent)`,
        `  tarball:   ${request.file}`,
        `  target:    PUT ${packageUrl(name)}`,
        `  dist-tag:  ${distTag}, access: public`,
        `  size:      ${request.size} bytes (request body ${bodySize} bytes)`,
        `  shasum:    ${request.shasum}`,
        `  integrity: ${request.integrity}`,
        `  on npm:    ${exists === undefined ? 'unknown (offline)' : exists ? 'yes, would SKIP' : 'no, would PUBLISH'}`,
        `  main:      ${manifest.main ?? '-'}  types: ${manifest.types ?? '-'}  bin: ${JSON.stringify(manifest.bin ?? '-')}`,
        `  exports:   ${JSON.stringify(manifest.exports ?? '-')}`,
      ].join('\n'),
    )
    continue
  }

  if (exists) {
    console.log(`[publish] ${name}@${version} is already on npm. Skipped.`)
    continue
  }

  const res = await fetch(packageUrl(name), {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(request.body),
  })
  if (!res.ok) {
    console.error(`[publish] ${name}@${version} failed: ${res.status} ${res.statusText}\n${await res.text()}`)
    failed = true
    continue
  }
  console.log(`[publish] Published ${name}@${version} (dist-tag ${distTag})`)
}

if (failed) process.exit(1)
