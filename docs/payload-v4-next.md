# Payload 4 prerelease

Candidate: `payload-canvas@0.3.0-next.1` for Payload `4.0.0-beta.3`.

This metadata update requires `payload-mcp-toolkit@0.10.0-next.1` for optional MCP integration. Runtime source matches the checked `0.3.0-next.0` candidate. The earlier pushed tag remains unchanged.

This branch publishes only the plugin to npm's `next` tag. The bundled v3 starter and scaffolder remain unchanged and unsupported here.

## Scope

The branch starts at `origin/main` commit `0455385cbd684d147dff7ed4626b5c2a5114265e`. Its source matches the previous feature checkout at `24cceda`.

The plugin keeps its published exports and package build script. Changes cover Payload 4 admin props, access arguments, semantic color tokens and Lexical 0.52.

Draft template reads and related-document reads use the supplied user. Published template rendering retains its trusted server read. The default-template hook uses explicit trusted access to maintain one published default.

Lexical 0.52 can report a parse error and return a partial state. Canvas now rejects that partial state before it replaces existing rich text.

Payload 4 puts string block references in `blocks`. The access walker now resolves them from `config.blocks`.

## Local checks

Use pnpm `10.34.6`. The workspace selects Node `24.15.0` and excludes the v3 app and scaffolder.

```powershell
pnpm install --frozen-lockfile
pnpm --filter ./packages/payload-canvas test
pnpm --filter ./packages/payload-canvas typecheck
pnpm --filter ./packages/payload-canvas lint
pnpm pack:next
pnpm exec node scripts/check-next-release.mjs
node scripts/publish.mjs --dry-run --expect-version 0.3.0-next.1 dist-packages/payload-canvas-0.3.0-next.1.tgz
```

The package build emits 316 JavaScript modules, their declarations and 21 stylesheets. All 26 public exports point to shipped files in `dist`.

CSS tests use a local fixture and a declared typography dependency. They do not install or run the v3 starter.

The frozen install, package build, typecheck and lint pass. All 2,055 tests pass across 339 suites, with no skipped tests.

The release guard accepts this manifest and rejects a mismatched tag. `git diff --check` passes.

The parent release task checks all six packed plugins together in a separate Next.js app before tagging.

## Candidate archive

File: `dist-packages/payload-canvas-0.3.0-next.1.tgz`.

Size: 932,430 bytes.

SHA-256: `58C723D0D55498BB95D240BA5D7BA89C0CCE0DF4A35B42367C727AE6A8705C64`.

The publish dry run selects `next` and reports that this version does not exist on npm. It sends no registry write.

## Publish path

The existing repository secret `NPM_TOKEN` supplies authentication to `scripts/publish.mjs`. The workflow uses the existing raw registry publisher.

`.github/workflows/publish-next.yml` checks the manifest and tag, installs from the lockfile, runs package checks and packs only the plugin.

Branch pushes and manual runs validate only. Tag `v0.3.0-next.1` publishes the one named plugin archive to `next`.

The legacy two-package workflow excludes next tags. It rejects a prerelease manifest on manual runs. It cannot publish the v3 scaffolder through this prerelease path.

The recovery changes remain local for review. No commit, push, new tag or publication was performed while preparing this candidate.
