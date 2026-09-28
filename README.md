# @umbraco-automate/mcp-dev

An [MCP](https://modelcontextprotocol.io) server for **Umbraco Automate**. Point it at an Umbraco
instance and your AI assistant can build and publish automations, wire up their steps and
triggers, manage connections and workspaces, inspect and control runs, handle approvals, and roll
back to earlier versions — 62 Automate tools across 8 collections, plus a server-info tool.

Built on [`@umbraco-cms/mcp-server-sdk`](https://www.npmjs.com/package/@umbraco-cms/mcp-server-sdk).

## Requirements

- **Node.js 22+**
- An **Umbraco instance with Umbraco Automate installed**, reachable over HTTP(S)
- An **API user** on that instance (see below)

This version targets **Umbraco 18** with Umbraco Automate 18.x. Connecting to a different major
version warns and blocks the first tool call; set `UMBRACO_EXPECTED_MAJOR` to override if you know
what you're doing.

### Which version for which Umbraco

| Umbraco | Umbraco Automate | Package |
|---------|------------------|---------|
| **18** | **18.x** | **`@umbraco-automate/mcp-dev`** |
| 17 | 17.x | `@umbraco-automate/mcp-dev@lts-17-beta` |

Install the version that matches your site's Umbraco major — the API client and the version check
differ between them.

The Umbraco 17 line is in beta and published under the `lts-17-beta` dist-tag. A range such as
`@17` doesn't match prereleases and won't find a version until 17.0.0 is released.

## 1. Create an API user in Umbraco

In the Umbraco backoffice:

1. Go to **Settings → Users**
2. Create a new **API user**
3. Note its **Client ID** and **Client Secret**
4. Grant it permissions for the Automate sections you want the assistant to reach

The server authenticates with those credentials via OAuth client credentials.

## 2. Add it to your MCP client

### Claude Code / Claude Desktop

Add to your `.mcp.json` (or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "umbraco-automate": {
      "command": "npx",
      "args": ["-y", "@umbraco-automate/mcp-dev"],
      "env": {
        "UMBRACO_BASE_URL": "https://your-site.example.com",
        "UMBRACO_CLIENT_ID": "your-client-id",
        "UMBRACO_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

Restart your client and the tools appear.

### Any other MCP client

The server speaks MCP over stdio. Run it however your client spawns servers:

```bash
UMBRACO_BASE_URL=https://your-site.example.com \
UMBRACO_CLIENT_ID=your-client-id \
UMBRACO_CLIENT_SECRET=your-client-secret \
npx -y @umbraco-automate/mcp-dev
```

### Local Umbraco with a self-signed certificate

Add `"NODE_TLS_REJECT_UNAUTHORIZED": "0"` to `env`. Only do this against local development
instances — it disables certificate verification process-wide.

## 3. Check it works

Without wiring up a client:

```bash
# List every tool this server exposes
npx -y @umbraco-automate/mcp-dev --list-tools

# Show resolved configuration and where each value came from
npx -y @umbraco-automate/mcp-dev --debug-config

# Call a tool directly
UMBRACO_BASE_URL=... UMBRACO_CLIENT_ID=... UMBRACO_CLIENT_SECRET=... \
  npx -y @umbraco-automate/mcp-dev --call list-automations --call-args '{}'
```

`--describe-tool <name>` prints a single tool's full input schema.

## Configuration

Every option is an environment variable, and most also have a CLI flag (`--help` lists them).

### Connection

| Variable | Required | Purpose |
|----------|----------|---------|
| `UMBRACO_BASE_URL` | yes | Base URL of your Umbraco instance |
| `UMBRACO_CLIENT_ID` | yes | API user's client ID |
| `UMBRACO_CLIENT_SECRET` | yes | API user's client secret |
| `UMBRACO_EXPECTED_MAJOR` | no | Override the expected Umbraco major version |

### Limiting the tool surface

63 tools is a lot of context. Narrow it down:

| Variable | Purpose |
|----------|---------|
| `UMBRACO_TOOL_MODES` | Enable named groups of collections (see below) |
| `UMBRACO_INCLUDE_TOOL_COLLECTIONS` | Only these collections |
| `UMBRACO_EXCLUDE_TOOL_COLLECTIONS` | Everything except these |
| `UMBRACO_INCLUDE_TOOLS` / `UMBRACO_EXCLUDE_TOOLS` | Individual tools by name |
| `UMBRACO_INCLUDE_SLICES` / `UMBRACO_EXCLUDE_SLICES` | By operation type, e.g. `delete` |
| `UMBRACO_READONLY` | Block every write operation |
| `UMBRACO_DRY_RUN` | Log writes instead of performing them |

Available modes:

| Mode | Includes |
|------|----------|
| `automate` | All 8 Automate collections |
| `umbraco-server` | Server information only |

```json
"env": {
  "UMBRACO_INCLUDE_TOOL_COLLECTIONS": "automations,catalogue,runs",
  "UMBRACO_READONLY": "true"
}
```

## What you get

| Collection | Tools | What it covers |
|------------|-------|----------------|
| `automations` | 23 | Create, publish, trigger, import/export and delete automations; add, connect and configure steps; set triggers |
| `workspaces` | 10 | Workspaces and the groups (folders) that organise automations |
| `catalogue` | 8 | Available triggers, actions, control flows, connection types, notification channels and webhook authenticators |
| `connections` | 6 | Stored credentials/endpoints that steps use, including a connection test |
| `runs` | 6 | Run history and detail; replay, resume, suspend and terminate runs |
| `version-history` | 5 | Past versions of an entity — list, inspect, compare and roll back |
| `approvals` | 2 | Runs paused on an approval step, and approving/rejecting them |
| `metrics` | 2 | Run metrics overall and per automation |
| `umbraco-server` | 1 | Umbraco server information (version, runtime) |

Run `--list-tools` for the full list with descriptions.

### Building an automation

The usual order:

1. **`list-catalogue-triggers`** / **`list-catalogue-step-types`** — see what's available.
2. **`create-automation`** — creates an empty draft in a workspace.
3. **`set-automation-trigger`**, then **`add-automation-step`** and **`connect-automation-steps`**
   — build the graph one piece at a time.
4. **`publish-automation`** — make it live. **`trigger-automation`** starts a run by hand.

To copy an existing automation, use **`export-automation`** and then **`import-automation`**
(check the payload first with **`validate-automation-import`**).

## Umbraco CMS tools

By default this server also chains to [`@umbraco-cms/mcp-dev`](https://www.npmjs.com/package/@umbraco-cms/mcp-dev),
exposing CMS tools (documents, media, members) alongside the Automate ones, prefixed `cms--`
(e.g. `cms--get-document-by-id`). It reuses the same credentials. The chained server is
configured in `src/config/mcp-servers.ts`.

Set `DISABLE_MCP_CHAINING=true` to turn this off and run Automate tools only.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `401` on every tool | Wrong `UMBRACO_CLIENT_ID` / `UMBRACO_CLIENT_SECRET`, or the API user lacks permissions |
| Self-signed certificate errors | Local HTTPS instance — set `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| Version mismatch warning, first tool call blocked | Instance isn't Umbraco 18 — use `@umbraco-automate/mcp-dev@lts-17-beta` for Umbraco 17, or set `UMBRACO_EXPECTED_MAJOR` |
| `404` on Automate tools | Umbraco Automate isn't installed on the instance |
| A tool you expected isn't listed | Check `UMBRACO_TOOL_MODES` and the include/exclude variables with `--debug-config` |

## Contributing

Setting up the repo, running the demo Umbraco site and the test suites: see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
