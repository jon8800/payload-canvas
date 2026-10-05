# Edit pages with Claude Code or Codex (your Claude or ChatGPT plan)

You can build pages with your **Claude Pro/Max** or **ChatGPT (Plus, Pro, Business)** plan instead of an API key. Claude Code and Codex are the official command-line apps of those plans. They connect to your site over MCP and edit pages with the builder's tools. Every change appears in the open editor as it happens.

Do not paste a plan's login into the site as an API key. The plans may only be used through the providers' own apps. The legitimate route is the one below: the official app is the MCP client, and your site is the MCP server.

## What you need

- The site runs `payload-mcp-toolkit` with `builderMcpTools()` (the starter does). The MCP endpoint is `<your site>/api/mcp`.
- A Payload admin login (for the sign-in route) or an MCP API key (for the key route).
- [Claude Code](https://code.claude.com/docs) signed in with your Claude plan, or [Codex CLI](https://developers.openai.com/codex) signed in with your ChatGPT plan.

The editor's **Assistant** panel shows these steps with your site's URL filled in: click the link icon in the panel header.

## Route A: sign in with your admin login (OAuth)

You give the client only the URL. It opens your browser, you sign in to the admin, you approve access, and the client gets a token. No key to copy. The starter has this turned on.

### Claude Code

```bash
claude mcp add --transport http --callback-port 8765 payload-builder http://localhost:3000/api/mcp
```

Then run `/mcp` inside Claude Code, pick `payload-builder`, and choose **Authenticate**. Or run `claude mcp login payload-builder` in a terminal. The browser opens. Sign in, check the account and permissions, and click **Allow access**.

Keep `--callback-port 8765`. Claude Code picks a random port by default, and the site accepts only exact callback URLs. Without it the registration fails with `invalid_redirect_uri`.

Replace the URL with your site's URL. Add `--scope user` to use the server in every project.

### Codex

Add the fixed callback port at the top of `~/.codex/config.toml` (before any `[table]`):

```toml
mcp_oauth_callback_port = 8766
```

Then:

```bash
codex mcp add payload-builder --url http://localhost:3000/api/mcp
codex mcp login payload-builder
```

Codex opens the browser. Sign in and click **Allow access**. The site accepts the callback `http://127.0.0.1:8766/callback`.

### What you approve

The approval screen offers **Allow creating and updating entries** and **Customize access** (collections, globals, tools). Delete is never allowed this way, and globals stay read-only. The access lasts up to 30 days. To disconnect, open **/admin/mcp-connections**. The sign-in uses your normal admin account, so Payload access control still applies.

### Who may sign in

The starter's Users collection has no roles. Every user who can open the admin may connect. To allow only some people, set `MCP_OAUTH_ALLOWED_EMAILS` (comma-separated emails) in `apps/starter/.env`. For roles, add a `role` field to Users and check it in `canAuthorize` in `payload.config.ts`.

### Site address

The address in `NEXT_PUBLIC_SERVER_URL` (Payload `serverURL`) is the sign-in issuer, and MCP requests must arrive on that host. A second dev server on another port needs its own value, for example `NEXT_PUBLIC_SERVER_URL=http://localhost:3300 pnpm dev --port 3300`. Then use `http://localhost:3300/api/mcp`. `localhost` and `127.0.0.1` count as different hosts.

## Route B: an MCP API key

Use this when sign-in does not fit, for example in scripts or CI. API keys keep working next to OAuth.

### 1. Create the key

1. In the admin, open **MCP → API Keys** and create a key.
2. Choose the **Editor** preset (read, create and update content). New keys start with no access.
3. Copy the key. The admin shows it only once.

The key acts as the user who created it, with Payload access control on. Revoke it in the same place.

### 2a. Claude Code

```bash
claude mcp add --transport http payload-builder http://localhost:3000/api/mcp --header "Authorization: Bearer <key>"
```

Replace the URL with your site's URL and `<key>` with your key. Add `--scope user` to use the server in every project, or `--scope project` to share it with your team in `.mcp.json`. For a shared `.mcp.json`, keep the key out of the file:

```json
{
  "mcpServers": {
    "payload-builder": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer ${PAYLOAD_MCP_KEY}" }
    }
  }
}
```

Check it with `claude mcp list`, or `/mcp` inside Claude Code.

### 2b. Codex

Put the key in the `PAYLOAD_MCP_KEY` environment variable. On Windows:

```powershell
setx PAYLOAD_MCP_KEY "<key>"
```

On macOS or Linux, add `export PAYLOAD_MCP_KEY=<key>` to your shell profile. Open a new terminal, then:

```bash
codex mcp add payload-builder --url http://localhost:3000/api/mcp --bearer-token-env-var PAYLOAD_MCP_KEY
```

Or add the server to `~/.codex/config.toml` by hand:

```toml
[mcp_servers.payload-builder]
url = "http://localhost:3000/api/mcp"
bearer_token_env_var = "PAYLOAD_MCP_KEY"
```

To keep the key in the file instead (less safe), use `http_headers = { "Authorization" = "Bearer <key>" }` in place of `bearer_token_env_var`.

## Ask for a change

Open the page in the editor, then ask in Claude Code or Codex, for example:

> Use payload-builder to add a pricing section with three plans to the Home page.

The agent reads the blocks and sections and edits the page's draft layout. The open editor shows each change at once. To roll a change back, use Payload's version history.

Tools the agent gets: `listBlocks`, `getBlockSchema`, `listSections`, `insertSection`, `getLayout`, `applyOperations`, `validateLayout`, `getPreviewUrl`, `generateImage`, and `listTemplates` / `getBindingSources` for templates, plus the content tools of `payload-mcp-toolkit`.

### Images

Claude Code and Codex cannot make images with your plan. Ask for an image anyway, for example "add a hero image of fresh coffee beans". The agent calls `generateImage`, and your site makes the image with its own image adapter and key, then saves it in Media. The agent then puts the image in a block. This needs `ai.images` in the site's config and `create` access on the media collection (the **Editor** preset has it). See [images.md](images.md).

## Claude.ai and ChatGPT (deployed sites)

On a site with a public HTTPS address you can use the same sign-in from the hosted apps:

- **Claude.ai** (web and desktop): add `https://YOUR-SITE/api/mcp` as a custom connector. Sign in with your site account and approve access.
- **ChatGPT**: turn on Developer mode, then add the same URL as a connector. Custom connectors work on the web only. Which plans allow write actions differs; see OpenAI's docs.

A local `http://localhost` site cannot use hosted connectors: Claude.ai and ChatGPT must reach the site from the internet.

The starter turns this on in `payload.config.ts`. In your own app:

```ts
mcpToolkitPlugin({
  customTools: builderMcpTools({ blocks, sections, collections }),
  oauth: {
    canAuthorize: ({ user }) => user?.role === 'admin', // who may connect
    access: 'editor', // most the site allows
    // Exact callbacks of CLI clients with a fixed port (optional):
    redirectURIs: [...hostedCallbacks, 'http://localhost:8765/callback', 'http://127.0.0.1:8766/callback'],
  },
})
```

OAuth also needs `serverURL` in the Payload config, three discovery rewrites and two security headers in `next.config` (the starter has them), and a migration for the `payload-mcp-oauth` collection before production. Follow the toolkit's [OAuth guide](https://github.com/jon8800/payload-mcp-toolkit/blob/main/docs/oauth.md).

## Troubleshooting

- **`invalid_redirect_uri` when signing in:** the client used a callback port the site does not accept. Use `--callback-port 8765` (Claude Code) or `mcp_oauth_callback_port = 8766` (Codex). Other ports need an entry in `oauth.redirectURIs`.
- **The browser shows `access_denied`:** your account is not allowed to connect. Check `MCP_OAUTH_ALLOWED_EMAILS` or your `canAuthorize` policy.
- **`Invalid host` or the sign-in sends you to another port:** the URL does not match `NEXT_PUBLIC_SERVER_URL`. Restart the server with the right value.
- **The sign-in worked, but the client says 401 later:** access tokens last one hour and refresh on their own. If the grant was disconnected or expired (30 days), sign in again.
- **401 Unauthorized (API key):** the key is wrong, revoked or expired, or the `Authorization` header is missing. In Codex, check that `PAYLOAD_MCP_KEY` is set in the terminal that runs `codex`.
- **The agent cannot edit pages:** the key's preset has no `update` on the collection. Use Editor, or tick the collection in Custom.
- **No changes in the editor:** open the same document. With more than one app server, the plugin needs a shared live bus (`live.bus`).
- **Browser MCP clients:** not supported. The endpoint sends no CORS headers.
