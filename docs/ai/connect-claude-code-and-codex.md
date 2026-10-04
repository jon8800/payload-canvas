# Edit pages with Claude Code or Codex (your Claude or ChatGPT plan)

You can build pages with your **Claude Pro/Max** or **ChatGPT (Plus, Pro, Business)** plan instead of an API key. Claude Code and Codex are the official command-line apps of those plans. They connect to your site over MCP and edit pages with the builder's tools. Every change appears in the open editor as it happens.

Do not paste a plan's login into the site as an API key. The plans may only be used through the providers' own apps. The legitimate route is the one below: the official app is the MCP client, and your site is the MCP server.

## What you need

- The site runs `payload-mcp-toolkit` with `builderMcpTools()` (the starter does). The MCP endpoint is `<your site>/api/mcp`.
- [Claude Code](https://code.claude.com/docs) signed in with your Claude plan, or [Codex CLI](https://developers.openai.com/codex) signed in with your ChatGPT plan.

The editor's **Assistant** panel shows these steps with your site's URL filled in: click the link icon in the panel header.

## 1. Create an MCP API key

1. In the admin, open **MCP → API Keys** and create a key.
2. Choose the **Editor** preset (read, create and update content). New keys start with no access.
3. Copy the key. The admin shows it only once.

The key acts as the user who created it, with Payload access control on. Revoke it in the same place.

## 2a. Claude Code

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

## 2b. Codex

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

## 3. Ask for a change

Open the page in the editor, then ask in Claude Code or Codex, for example:

> Use payload-builder to add a pricing section with three plans to the Home page.

The agent reads the blocks and sections and edits the page's draft layout. The open editor shows each change at once. To roll a change back, use Payload's version history.

Tools the agent gets: `listBlocks`, `getBlockSchema`, `listSections`, `insertSection`, `getLayout`, `applyOperations`, `validateLayout`, `getPreviewUrl`, and `listTemplates` / `getBindingSources` for templates, plus the content tools of `payload-mcp-toolkit`.

## Claude.ai and ChatGPT (deployed sites)

On a site with a public HTTPS address you can skip the API key and the command line. `payload-mcp-toolkit` can offer **website sign-in (OAuth)**. Then:

- **Claude.ai** (web and desktop): add `https://YOUR-SITE/api/mcp` as a custom connector. Sign in with your site account and approve access.
- **ChatGPT**: turn on Developer mode, then add the same URL as a connector. Custom connectors work on the web only. Which plans allow write actions differs; see OpenAI's docs.

Turn it on in the host app:

```ts
mcpToolkitPlugin({
  customTools: builderMcpTools({ blocks, sections, collections }),
  oauth: {
    canAuthorize: ({ user }) => user?.role === 'admin', // who may connect
    access: 'editor', // most the site allows
  },
})
```

OAuth needs a migration, three discovery rewrites in `next.config` and two security headers. Follow the toolkit's [OAuth guide](https://github.com/jon8800/payload-mcp-toolkit/blob/main/docs/oauth.md). A local `http://localhost` site cannot use hosted connectors: Claude.ai and ChatGPT must reach the site from the internet.

## Troubleshooting

- **401 Unauthorized:** the key is wrong, revoked or expired, or the `Authorization` header is missing. In Codex, check that `PAYLOAD_MCP_KEY` is set in the terminal that runs `codex`.
- **The agent cannot edit pages:** the key's preset has no `update` on the collection. Use Editor, or tick the collection in Custom.
- **No changes in the editor:** open the same document. With more than one app server, the plugin needs a shared live bus (`live.bus`).
- **Browser MCP clients:** not supported. The endpoint sends no CORS headers.
