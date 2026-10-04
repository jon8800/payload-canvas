import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { BUILDER_PACKAGES, PUBLISHED_VERSION } from './config.js'
import { capture } from './run.js'

type PackageJson = {
  name?: string
  version?: string
  private?: boolean
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  overrides?: Record<string, string>
  pnpm?: { overrides?: Record<string, string>; onlyBuiltDependencies?: string[] }
  [key: string]: unknown
}

export type Tarballs = Record<string, string>

function readPackageJson(dir: string): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJson
}

function tarballName(name: string, version: string): string {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`
}

/** Checks that `<root>/packages/<pkg>` exists for every builder package. */
export function hasBuilderPackages(root: string): boolean {
  return BUILDER_PACKAGES.every((pkg) => fs.existsSync(path.join(root, 'packages', pkg.dir, 'package.json')))
}

/**
 * Packs the builder packages from a repo checkout into `<target>/.tarballs`.
 * `pnpm pack` runs each package's `prepack` script, which builds `dist/` first.
 */
export function packBuilderPackages(repoRoot: string, targetDir: string): Tarballs {
  const destination = path.join(targetDir, '.tarballs')
  fs.mkdirSync(destination, { recursive: true })
  const files: Tarballs = {}
  for (const pkg of BUILDER_PACKAGES) {
    const dir = path.join(repoRoot, 'packages', pkg.dir)
    const result = capture('pnpm', ['pack', '--pack-destination', destination], dir)
    if (!result.ok) throw new Error(`"pnpm pack" failed in ${dir}:\n${result.error}`)
    const file = tarballName(pkg.name, readPackageJson(dir).version ?? '0.0.0')
    if (!fs.existsSync(path.join(destination, file))) throw new Error(`Expected tarball ${file} was not created.`)
    files[pkg.name] = file
  }
  return files
}

/** Asks the npm registry if the builder packages exist. Returns null when the registry cannot be reached. */
export async function builderPackagesArePublished(): Promise<boolean | null> {
  const [first] = BUILDER_PACKAGES
  try {
    const response = await fetch(`https://registry.npmjs.org/${first.name.replace('/', '%2F')}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(8000),
    })
    if (response.status === 404) return false
    return response.ok ? true : null
  } catch {
    return null
  }
}

/** True if any source file in the project imports the package. */
function isImported(targetDir: string, pkg: string): boolean {
  const pattern = new RegExp(`from\\s+['"]${pkg}(/[^'"]*)?['"]|require\\(['"]${pkg}['"]\\)`)
  const walk = (dir: string): boolean =>
    fs.readdirSync(dir, { withFileTypes: true }).some((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return !SKIP_DIRS.has(entry.name) && walk(full)
      return /\.(m?[jt]sx?)$/.test(entry.name) && pattern.test(fs.readFileSync(full, 'utf8'))
    })
  return walk(targetDir)
}
const SKIP_DIRS = new Set(['node_modules', '.next', '.tarballs'])

export function updatePackageJson(
  targetDir: string,
  name: string,
  tarballs: Tarballs | null,
  manager: 'pnpm' | 'npm',
): void {
  const file = path.join(targetDir, 'package.json')
  const pkg = readPackageJson(targetDir)
  pkg.name = name
  pkg.version = '0.1.0'
  delete pkg.private

  // Repo-only scripts: the repo's own scaffold script and `_` developer test helpers.
  for (const key of Object.keys(pkg.scripts ?? {})) {
    if (key === 'setup' || key.startsWith('_')) delete pkg.scripts?.[key]
  }

  // Only the removed scaffold script used these packages. Keep them if the app imports them.
  for (const dep of ['@clack/prompts', 'pg', '@types/pg']) {
    if (pkg.devDependencies?.[dep] && !isImported(targetDir, dep.replace('@types/', ''))) {
      delete pkg.devDependencies[dep]
    }
  }

  const dependencies = pkg.dependencies ?? {}
  const overrides: Record<string, string> = {}
  for (const { name: dep } of BUILDER_PACKAGES) {
    const tarball = tarballs?.[dep]
    dependencies[dep] = tarball ? `file:./.tarballs/${tarball}` : PUBLISHED_VERSION
    if (tarball) overrides[dep] = dependencies[dep]
  }
  pkg.dependencies = dependencies

  // A packed builder-react asks for builder by version number. The override points it at the local tarball.
  // The build-script list lets pnpm 10 run the install scripts that these packages need.
  if (manager === 'npm') {
    pkg.overrides = { ...pkg.overrides, ...overrides }
  } else {
    pkg.pnpm = {
      ...pkg.pnpm,
      overrides: { ...pkg.pnpm?.overrides, ...overrides },
      onlyBuiltDependencies: ['esbuild', 'sharp', 'unrs-resolver'],
    }
    if (!Object.keys(pkg.pnpm.overrides ?? {}).length) delete pkg.pnpm.overrides
  }
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
}

const secret = () => crypto.randomBytes(32).toString('hex')
const set = (content: string, key: string, value: string) =>
  content.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${value}`)

export function writeEnv(targetDir: string, databaseUrl: string): void {
  const example = path.join(targetDir, '.env.example')
  if (!fs.existsSync(example)) throw new Error('.env.example not found in the template.')

  let content = fs.readFileSync(example, 'utf8')
  content = set(content, 'DATABASE_URL', databaseUrl)
  content = set(content, 'PAYLOAD_SECRET', secret())
  content = set(content, 'NEXT_PUBLIC_SERVER_URL', 'http://localhost:3000')
  fs.writeFileSync(path.join(targetDir, '.env'), content)
}

/** Looks for repo-only leftovers in the generated project. Returns one message per problem. */
export function checkProject(targetDir: string): string[] {
  const problems: string[] = []
  const read = (file: string) => {
    const full = path.join(targetDir, file)
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : ''
  }
  const manifest = read('package.json')
  if (manifest.includes('workspace:')) problems.push('package.json still has a "workspace:" dependency.')
  if (/\.\.\/(\.\.\/)*packages\//.test(read('next.config.ts') + read('tsconfig.json'))) {
    problems.push('next.config.ts or tsconfig.json still points into ../packages/.')
  }
  if (/"baseUrl"/.test(read('tsconfig.json'))) problems.push('tsconfig.json has "baseUrl", which TypeScript 7 removed.')
  const leftovers = ['Dockerfile', 'docker-compose.yml', 'scripts/setup.ts', 'docs/qa', 'screenshots', '.next', 'node_modules']
  for (const item of leftovers) {
    if (fs.existsSync(path.join(targetDir, item))) problems.push(`"${item}" should not be in the generated project.`)
  }
  return problems
}
