---
name: ovs-mcp
description: Configure, diagnose, and use the unofficial Official Vegan Shop MCP server and CLI. Use for OVS product search, catalog browsing, cart inspection, favorites, customer data, delivery addresses, session import, token refresh, or MCP client configuration.
---

# OVS MCP

Use this skill when the `ovs-mcp` server is installed from GitHub or from a checkout. It controls Official Vegan Shop through the observed private API and never requires the iPhone after a valid session has been imported.

## Route the request

- Always call `connect_ovs` before the first operation. If it reports `connection_required`, follow **Bootstrap a session**.
- For MCP client setup, follow **Configure an MCP client**.
- For catalog or account reads, use the CLI or the matching MCP tool.
- For an unknown or failing endpoint, stop and report the explicit error. Do not invent a request or switch backend.
- For protocol work, read `references/observed-contract.md` before editing code.

## Bootstrap a session

1. Obtain an authenticated HAR from an OVS app session owned by the user. Keep it local and never inspect or print more content than required.
2. Give only its absolute local path to `connect_ovs`. Do not paste or attach its contents.
3. The tool imports it to `~/.config/ovs-mcp/session.json`, validates a direct OVS call, and reports `connected` without credentials.

CLI alternative:

   ```bash
   npm run compile
   node dist/cli.js session import-har --from /absolute/private/capture.har --output /absolute/private/session.json
   ```

4. Verify that the session file is outside Git and mode `0600`.
5. Restore the phone proxy and remove the inspection certificate when it is no longer required.
6. Run one direct diagnostic if connection status is uncertain:

   ```bash
   node dist/cli.js doctor --session /absolute/private/session.json
   ```

Never paste the HAR, session, authorization header, token, refresh token, device UUID, customer, cart, or address into chat or a repository.

## Configure an MCP client

Prefer stdio:

```json
{
  "mcpServers": {
    "ovs": {
      "command": "node",
      "args": ["/absolute/path/to/ovs-mcp/dist/index.js"],
      "env": { "OVS_SESSION_FILE": "/absolute/private/session.json" }
    }
  }
}
```

If a client supports only Streamable HTTP, start `node dist/index.js --transport http`; use `http://127.0.0.1:3000/mcp`. Never expose this endpoint publicly.

## Use OVS

- Search: `search_products` or `node dist/cli.js search "query" --session <path>`
- Catalog: `list_categories`, `list_manufacturers`, `list_currencies`
- Account: `get_cart`, `get_customer`, `list_addresses`, `list_favorites`
- Cart: call `add_to_cart` or `remove_from_cart` once for the preview, ask for confirmation, then call the same tool with the returned confirmation token.

Warn before profile or address reads when the configured MCP model provider is not trusted with personal data.

## Validate changes

Run `npm run verify`. Do not report completion when any type check, lint, test, privacy audit, build, or package verification fails.
