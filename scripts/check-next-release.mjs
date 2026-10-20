import assert from 'node:assert/strict'
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('../packages/payload-canvas/package.json', import.meta.url), 'utf8'))
assert.equal(pkg.name, 'payload-canvas')
assert.match(pkg.version, /^\d+\.\d+\.\d+-next\.\d+$/, 'Only next prereleases belong in this workflow')
assert.equal(pkg.publishConfig.tag, 'next')
assert.equal(pkg.engines.node, '>=24.15.0')
for (const name of ['payload', '@payloadcms/ui', '@payloadcms/richtext-lexical']) {
  assert.equal(pkg.peerDependencies[name], '4.0.0-beta.3')
  assert.equal(pkg.devDependencies[name], '4.0.0-beta.3')
}
if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(process.env.GITHUB_REF_NAME, `v${pkg.version}`, 'The tag must match the plugin version')
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${pkg.version}\n`)
console.log(`Checked payload-canvas@${pkg.version}; publish only its tarball with the next dist-tag.`)
