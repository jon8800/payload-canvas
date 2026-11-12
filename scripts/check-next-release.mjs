#!/usr/bin/env node
// Checks the Payload 4 next line before it is packed and published (.github/workflows/publish-next.yml).
//   node scripts/check-next-release.mjs
// - payload-canvas and create-payload-canvas have the same `x.y.z-next.N` version and publish to `next`.
// - payload-canvas peers on Payload `^4.0.0-beta.8` (later betas and 4.0.0 match) and needs Node 24.22.1.
// - The scaffolder installs that version (`PUBLISHED_VERSION`) and downloads the starter from its tag
//   (`DEFAULT_REF`), so a new project matches the published packages.
// - On a tag run, the tag is `v<version>`.
// In CI it writes `version=<version>` to GITHUB_OUTPUT.

import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const plugin = JSON.parse(read('packages/payload-canvas/package.json'))
const cli = JSON.parse(read('packages/create-payload-canvas/package.json'))
const config = read('packages/create-payload-canvas/src/config.ts')

const PAYLOAD_PEER = '^4.0.0-beta.8'
const NODE = '>=24.22.1'

assert.equal(plugin.name, 'payload-canvas')
assert.equal(cli.name, 'create-payload-canvas')
assert.match(plugin.version, /^\d+\.\d+\.\d+-next\.\d+$/, 'Only next prereleases belong in the next workflow')
assert.equal(cli.version, plugin.version, 'create-payload-canvas and payload-canvas must have the same version')
for (const pkg of [plugin, cli]) {
  assert.equal(pkg.publishConfig?.tag, 'next', `${pkg.name}: publishConfig.tag must be "next"`)
  assert.equal(pkg.engines?.node, NODE, `${pkg.name}: engines.node must be "${NODE}"`)
}
for (const name of ['payload', '@payloadcms/ui', '@payloadcms/richtext-lexical']) {
  assert.equal(plugin.peerDependencies[name], PAYLOAD_PEER, `payload-canvas: peer ${name} must be "${PAYLOAD_PEER}"`)
}

const constant = (name) => config.match(new RegExp(`export const ${name} = '([^']+)'`))?.[1]
assert.equal(constant('PUBLISHED_VERSION'), `^${plugin.version}`, 'create-payload-canvas: PUBLISHED_VERSION must be ^<version>')
assert.equal(constant('DEFAULT_REF'), `v${plugin.version}`, 'create-payload-canvas: DEFAULT_REF must be the release tag v<version>')

if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(process.env.GITHUB_REF_NAME, `v${plugin.version}`, 'The tag must match the package versions')
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${plugin.version}\n`)
console.log(`[check-next-release] payload-canvas and create-payload-canvas ${plugin.version}: ready for the next dist-tag.`)
