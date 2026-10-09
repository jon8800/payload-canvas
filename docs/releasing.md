# Releasing

Pushing a version tag publishes `payload-canvas` and `create-payload-canvas` to npm. The workflow is `.github/workflows/publish.yml`. It tests, packs each package with `pnpm pack`, checks the versions against the tag, and publishes the tarballs with `scripts/publish.mjs`.

`scripts/publish.mjs` sends a raw authenticated PUT to the npm registry. It does not use `npm publish`, because `npm publish` returns 403 on this account: security-key-only 2FA collides with the CLI's one-time-password flow. The registry accepts the same request from a granular token that has "bypass 2FA".

Only pnpm applies `publishConfig.exports`. So the packages are always packed with pnpm, and the script publishes the `package.json` from inside the tarball, where `exports` points at `dist/`.

## One-time setup (the owner does this)

1. On npmjs.com, go to **Access Tokens** > **Generate New Token** > **Granular Access Token**.
   - Permissions: **Read and write**.
   - Packages: **All packages**. The two packages do not exist yet, so you cannot pick them by name. After the first release you can make a new token limited to `payload-canvas` and `create-payload-canvas`.
   - Check **Bypass two-factor authentication (2FA)**.
   - Pick an expiry date and write it down. The release fails with 401 or 403 after it.
2. Store the token as a repository secret. The command asks for the value, so it does not go into your shell history:

   ```sh
   gh secret set NPM_TOKEN --repo jon8800/payload-canvas
   ```

The first publish creates both packages on npm. Nothing else is needed on npm.

## Release

1. Set the same version in `packages/payload-canvas/package.json` and `packages/create-payload-canvas/package.json`.
2. Add a section for the version to `CHANGELOG.md`.
3. Check the packages locally. This packs both and prints what would be sent, without sending anything:

   ```sh
   pnpm release:dry
   ```

4. Commit, push, then tag and push the tag:

   ```sh
   git commit -am "chore: release v0.2.0"
   git push origin main
   git tag v0.2.0
   git push origin v0.2.0
   ```

5. Watch the run: `gh run watch --repo jon8800/payload-canvas`.
6. Wait about 2 minutes. npm stages every publish that a 2FA-bypass token sends: the new version goes through a short review, then npm releases it by itself. Nothing needs approving. If a version stays missing, `npm login` and `npm stage list` show what is still waiting.

   Check the result with `npm view payload-canvas version`.

The workflow stops before it publishes anything when a package version is not equal to the tag (`v0.2.0` needs `0.2.0` in both files). A version with a hyphen, such as `0.2.0-beta.1`, gets the `next` dist-tag, so `npm install payload-canvas` keeps the last stable version.

## Re-run

A version that is already on npm is skipped. So after a failed run (for example, an expired token), fix the cause and re-run the same workflow:

```sh
gh run rerun <run-id> --repo jon8800/payload-canvas
```

You can also start it by hand from the **Actions** tab (**Publish to npm** > **Run workflow**). Pick the tag as the ref, so the version check runs. Started from a branch, it publishes the versions in the `package.json` files.

npm never accepts the same version twice, even after an unpublish. To fix a bad release, publish a new patch version.

## Manual fallback

When GitHub Actions is not available, publish from your machine with the same script. It reads the token from `NPM_TOKEN` or from `//registry.npmjs.org/:_authToken=...` in `~/.npmrc`.

```sh
pnpm release:dry
NPM_TOKEN=<token> node scripts/publish.mjs --expect-version 0.2.0 dist-packages
```

In PowerShell, set the token with `$env:NPM_TOKEN = "<token>"` first, then run the `node` line without the prefix.

## Provenance

The packages are published without npm provenance. Provenance needs a signed Sigstore bundle in the same PUT, built from the workflow's OIDC token (the `sigstore` package and `id-token: write`). The raw PUT can carry it, but the script does not build it yet.
