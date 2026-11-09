// Checks that the starter still type-checks after every mix of feature choices.
// For each mix: copy apps/starter to a temp folder the way the CLI does, link node_modules to the
// starter's own, apply the features, run the starter's TypeScript compiler, and look for leftovers.
//
// Usage: pnpm check:features [--all | --quick]
//   --all     every mix (2 ^ number of features runs)
//   --quick   all on, all off, the defaults, and each feature off alone
//   default   times the first run: under 20 seconds means --all, else --quick

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { DEFAULT_FEATURES, FEATURES, STARTER_SUBDIR, type FeatureId } from '../src/config.js'
import { applyFeatures, filesWithMarkers, IMPORT_MAP_FILE, readManifest, stripImportMap } from '../src/features.js'
import { copyStarterFromRepo, findRepoRoot } from '../src/source.js'

const run = promisify(execFile)
const repoRoot = findRepoRoot()
if (!repoRoot) throw new Error('Run this script from inside the Payload Canvas repo.')
const starter = path.join(repoRoot, STARTER_SUBDIR)
const nodeModules = path.join(starter, 'node_modules')
const tsc = path.join(nodeModules, 'typescript', 'bin', 'tsc')
if (!fs.existsSync(tsc)) throw new Error(`No TypeScript compiler at ${tsc}. Run pnpm install first.`)

const ids = FEATURES.map((feature) => feature.id)
const label = (enabled: FeatureId[]) => {
  const off = ids.filter((id) => !enabled.includes(id))
  if (off.length === 0) return 'all on'
  return off.length === ids.length ? 'all off' : `off: ${off.join(', ')}`
}

/** Deletes a temp project. Removes the node_modules link first, so the real folder is never touched. */
function cleanUp(dir: string): void {
  const link = path.join(dir, 'node_modules')
  const stat = fs.lstatSync(link, { throwIfNoEntry: false })
  if (stat) {
    if (!stat.isSymbolicLink()) throw new Error(`${link} is not a link. Not deleting ${dir}.`)
    fs.unlinkSync(link)
  }
  fs.rmSync(dir, { recursive: true, force: true })
}

/** Runs one mix. Returns the problems found (empty means it passed). */
async function check(enabled: FeatureId[]): Promise<string[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpc-check-'))
  try {
    copyStarterFromRepo(repoRoot!, dir)
    // The CLI leaves next-env.d.ts out because `next dev` writes it. The compiler needs it now.
    const nextEnv = path.join(starter, 'next-env.d.ts')
    if (fs.existsSync(nextEnv)) fs.copyFileSync(nextEnv, path.join(dir, 'next-env.d.ts'))
    fs.symlinkSync(nodeModules, path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')

    const manifest = readManifest(dir)
    if (!manifest) return [`${STARTER_SUBDIR} has no starter-features.json.`]
    const off = applyFeatures(dir, enabled) ?? []
    const offFeatures = manifest.features.filter((feature) => off.includes(feature.id))
    const removedPaths = offFeatures.flatMap((feature) => feature.paths)
    const removedPackages = offFeatures.flatMap((feature) => feature.dependencies ?? [])

    const problems: string[] = []
    const result = await run(process.execPath, [tsc, '--noEmit', '-p', path.join(dir, 'tsconfig.json')], { cwd: dir, maxBuffer: 64 * 1024 * 1024 }).then(
      () => null,
      (error: { stdout?: string; stderr?: string; message: string }) => (error.stdout || error.stderr || error.message).trim(),
    )
    if (result) problems.push(`tsc failed:\n${result.split(dir).join('<project>')}`)

    for (const { file } of filesWithMarkers(dir)) problems.push(`markers left in ${path.relative(dir, file)}`)
    const importMap = path.join(dir, IMPORT_MAP_FILE)
    if (fs.existsSync(importMap)) {
      const text = fs.readFileSync(importMap, 'utf8')
      if (stripImportMap(text, removedPaths, removedPackages) !== text) problems.push(`${IMPORT_MAP_FILE} still points into a deleted path or package`)
    }
    for (const rel of removedPaths) if (fs.existsSync(path.join(dir, rel))) problems.push(`${rel} was not deleted`)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Partial<Record<'scripts' | 'dependencies', Record<string, string>>>
    for (const name of offFeatures.flatMap((feature) => feature.scripts ?? [])) {
      if (pkg.scripts?.[name]) problems.push(`script "${name}" was not deleted`)
    }
    for (const name of removedPackages) {
      if (pkg.dependencies?.[name]) problems.push(`dependency "${name}" was not deleted`)
    }
    if (fs.existsSync(path.join(dir, 'starter-features.json'))) problems.push('starter-features.json was not deleted')
    return problems
  } finally {
    cleanUp(dir)
  }
}

async function main() {
  const all: FeatureId[][] = []
  for (let mask = 0; mask < 1 << ids.length; mask++) all.push(ids.filter((_, bit) => !(mask & (1 << bit))))
  const quick: FeatureId[][] = [ids, [], DEFAULT_FEATURES, ...ids.map((id) => ids.filter((other) => other !== id))]

  const results: { name: string; problems: string[]; seconds: number }[] = []
  const timed = async (enabled: FeatureId[]) => {
    const start = Date.now()
    const problems = await check(enabled).catch((error: unknown) => [error instanceof Error ? error.message : String(error)])
    const seconds = (Date.now() - start) / 1000
    results.push({ name: label(enabled), problems, seconds })
    console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${seconds.toFixed(1).padStart(5)} s  ${label(enabled)}`)
    return seconds
  }

  const started = Date.now()
  const firstSeconds = await timed(ids)
  const mode = process.argv.includes('--all') ? 'all' : process.argv.includes('--quick') ? 'quick' : firstSeconds < 20 ? 'all' : 'quick'
  const rest = (mode === 'all' ? all : quick).slice(1)
  console.log(`One run took ${firstSeconds.toFixed(1)} s. Running ${rest.length + 1} mixes (${mode}).`)

  // A few at a time. Each run is one compiler process.
  const queue = [...rest]
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await timed(next)
    }),
  )

  const failed = results.filter((result) => result.problems.length > 0)
  console.log(`\n${results.length - failed.length} of ${results.length} mixes passed in ${((Date.now() - started) / 1000).toFixed(0)} s.`)
  for (const result of failed) console.log(`\n--- ${result.name}\n${result.problems.join('\n')}`)
  if (failed.length > 0) process.exitCode = 1
}

await main()
