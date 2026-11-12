# The Payload 4 line (`next`)

The branch `release/payload-v4-next` holds the Payload 4 line of Payload Canvas. Its packages are published with the npm `next` dist-tag. `main` and the npm `latest` tag stay on Payload 3.

| | Payload 3 line | Payload 4 line |
|---|---|---|
| Branch | `main` | `release/payload-v4-next` |
| npm dist-tag | `latest` (0.6.x) | `next` (0.7.0-next.N) |
| Install | `payload-canvas` | `payload-canvas@next` |
| New project | `npx create-payload-canvas` | `npx create-payload-canvas@next` |
| Payload | 3.90+ | `^4.0.0-beta.8` |
| Next.js / React | 16.3+ / 19.2+ | 16.4.1+ / 19.3.1+ |
| Node.js | 20.9+ | 24.22.1+ |
| Publish workflow | `.github/workflows/publish.yml` (tags `v0.6.1`) | `.github/workflows/publish-next.yml` (tags `v0.7.0-next.0`) |

Both packages (`payload-canvas` and `create-payload-canvas`) and the starter app are on Payload 4 here. The workspace pins Node 24.22.3 for its scripts (`useNodeVersion` in `pnpm-workspace.yaml`), so pnpm downloads it; the global Node install can stay older.

What changed for users, and the migrations a site needs: see the `0.7.0-next.0` section of [CHANGELOG.md](../CHANGELOG.md).

## The owner's plugins

The starter uses four of the owner's plugins. Their Payload 4 versions are on the `next` dist-tag too:

| Plugin | Next version | Starter feature |
|---|---|---|
| `payload-media-gallery` | 0.4.0-next.0 | `gallery` |
| `payload-workflows` | 0.2.0-next.1 | `workflows` |
| `payload-mcp-toolkit` | 0.12.0-next.0 | always (MCP sign-in) |
| `payload-google-reviews` | 0.5.0-next.0 | `reviews` (off by default) |

The starter depends on the published `next` versions: `payload-media-gallery@^0.4.0-next.0`, `payload-workflows@^0.2.0-next.1`, `payload-mcp-toolkit@^0.12.0-next.0` and `payload-google-reviews@^0.5.0-next.0`. While a plugin change is not on npm yet, test it with a `file:` dependency on its packed tarball, and switch back to the published version before a release: `pnpm install --frozen-lockfile` in CI fails on `file:` entries that point outside the repository.

## Local checks

```sh
pnpm install
pnpm --filter ./packages/payload-canvas test
pnpm --filter ./packages/payload-canvas typecheck
pnpm --filter ./packages/payload-canvas lint
pnpm --filter ./packages/create-payload-canvas test
cd apps/starter && pnpm typecheck && pnpm lint && pnpm test && pnpm build
node scripts/check-next-release.mjs
pnpm release:dry
```

`scripts/check-next-release.mjs` checks that both packages have the same `x.y.z-next.N` version and publish to `next`, that the Payload peers are `^4.0.0-beta.8` and Node is `>=24.22.1`, and that the scaffolder installs that version and downloads the starter from its tag (`DEFAULT_REF = 'v<version>'`). On a tag run it also checks the tag.

## Local dev database

A Payload 3 database works after a schema push, with two answers to Drizzle's "created or renamed" questions: `payload_jobs.processing` → **create** `processing_until`, and `media.sizes_*` → **rename** to `variants_*` (or rename those columns by hand first, as Payload's `sizes-to-variants` migration does). `payload-mcp-toolkit` drops `enableAPIKey` from its keys collection and adds `apiKeyLast4`; drop the old column if Drizzle asks about it.

Open the dev server at `http://127.0.0.1:<port>`, not `localhost`: Payload apps on different localhost ports share the `payload-token` cookie and sign each other out.
