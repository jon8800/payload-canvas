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
  pnpm?: { overrides?: Record<string, string>; onlyBuiltDependencies?: string[] }
  [key: string]: unknown
}

function tarballName(name: string, version: string): string {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`
}

/** Packs the builder packages into `<target>/.tarballs`. Returns a map of package name to file name. */
export function packBuilderPackages(repoRoot: string, targetDir: string): Record<string, string> {
  const destination = path.join(targetDir, '.tarballs')
  fs.mkdirSync(destination, { recursive: true })
  const files: Record<string, string> = {}
  for (const pkg of BUILDER_PACKAGES) {
    const dir = path.join(repoRoot, 'packages', pkg.dir)
    if (capture('pnpm', ['pack', '--pack-destination', destination], dir) === null) {
      throw new Error(`"pnpm pack" failed in packages/${pkg.dir}.`)
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version: string }
    const file = tarballName(pkg.name, manifest.version)
    if (!fs.existsSync(path.join(destination, file))) throw new Error(`Expected tarball ${file} was not created.`)
    files[pkg.name] = file
  }
  return files
}

export function updatePackageJson(targetDir: string, name: string, tarballs: Record<string, string> | null): void {
  const file = path.join(targetDir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as PackageJson
  pkg.name = name
  pkg.version = '0.1.0'
  delete pkg.private
  delete pkg.scripts?.setup

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
  pkg.pnpm = {
    ...pkg.pnpm,
    ...(tarballs ? { overrides: { ...pkg.pnpm?.overrides, ...overrides } } : {}),
    onlyBuiltDependencies: ['esbuild', 'sharp', 'unrs-resolver'],
  }
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  fs.rmSync(path.join(targetDir, 'scripts', 'setup.ts'), { force: true })
}

export function writeEnv(targetDir: string, databaseUrl: string): void {
  const example = path.join(targetDir, '.env.example')
  if (!fs.existsSync(example)) throw new Error('.env.example not found in the template.')
  const secret = () => crypto.randomBytes(32).toString('hex')
  const set = (content: string, key: string, value: string) =>
    content.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${value}`)

  let content = fs.readFileSync(example, 'utf8')
  content = set(content, 'DATABASE_URL', databaseUrl)
  content = set(content, 'PAYLOAD_SECRET', secret())
  content = set(content, 'PREVIEW_SECRET', secret())
  content = set(content, 'NEXT_PUBLIC_SERVER_URL', 'http://localhost:3000')
  fs.writeFileSync(path.join(targetDir, '.env'), content)
}
