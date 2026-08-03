# OVS MCP Server

Local Model Context Protocol server and CLI for the unofficial Official Vegan Shop API. Give the GitHub link to Codex or Claude Code, connect one private OVS session, then search the live catalog and fill the real cart without keeping the iPhone connected.

This project uses an unofficial API and is not affiliated with Official Vegan Shop. Tool calls for the cart, profile, favorites, and addresses can send personal shopping or delivery information to the MCP client and its configured model provider.

## Requirements

- Node.js 22.12 or newer
- npm
- An Official Vegan Shop account
- One authenticated HAR capture from your own OVS app session

The iPhone or Android device is only needed to bootstrap or replace a session. Once imported, the MCP calls OVS directly and refreshes the account token itself.

## Add the GitHub MCP

No global installation or clone is required. Generic MCP configuration:

```json
{
  "mcpServers": {
    "ovs": {
      "command": "npx",
      "args": ["-y", "github:ncleton-petitmaker/ovs-mcp"]
    }
  }
}
```

Claude Code:

```bash
claude mcp add ovs -- npx -y github:ncleton-petitmaker/ovs-mcp
```

Codex configuration:

```toml
[mcp_servers.ovs]
command = "npx"
args = ["-y", "github:ncleton-petitmaker/ovs-mcp"]
```

The server starts even when no OVS account is connected. Its MCP instructions tell the client to call `connect_ovs` first. The tool reports `connection_required` and asks only for the local path to a private authenticated HAR; it never asks the user to paste a password, token, capture, customer record, or address into chat.

## Connect OVS

The default private session path is `~/.config/ovs-mcp/session.json`. `OVS_SESSION_FILE` may override it with an absolute path.

Capture an authenticated OVS app session with an HTTPS inspection tool you control, load the customer or cart screen, and include a token-refresh request. Export the capture locally as HAR, then immediately restore the device proxy and remove the inspection certificate when it is no longer needed.

Give the local HAR path to Codex or Claude Code when `connect_ovs` asks for it. The client calls `connect_ovs` again with that path. The tool imports it with mode `0600`, validates a live OVS call, and reports `connected` without returning any credential.

CLI alternative:

```bash
git clone https://github.com/ncleton-petitmaker/ovs-mcp.git
cd ovs-mcp
npm install
npm run build
node dist/cli.js session import-har \
  --from /absolute/private/ovs-session.har \
  --output ~/.config/ovs-mcp/session.json
```

The importer accepts only calls to `https://www.officialveganshop.com/module/vtj_api`, extracts the observed app headers and account credentials, and writes the result with permissions `0600`. It does not modify or delete the HAR. Delete the raw capture yourself after validating the session; never upload it to GitHub, an issue, a chat, or a model provider.

Validate the direct connection without an iPhone:

```bash
node dist/cli.js doctor
```

## Run

```bash
OVS_SESSION_FILE=/absolute/private/ovs-session.json npm start
```

`npm start` runs the universal stdio transport. stdout is reserved for MCP frames; diagnostics go to stderr and never include session credentials.

For MCP clients that only support Streamable HTTP, run a loopback-only endpoint:

```bash
OVS_SESSION_FILE=/absolute/private/ovs-session.json \
  node dist/index.js --transport http
```

The endpoint is `http://127.0.0.1:3000/mcp`. The server refuses non-loopback binding because account data is private.

## Local path configuration

For a cloned development checkout, any MCP host that supports stdio can run the built entry point directly:

```json
{
  "mcpServers": {
    "ovs": {
      "command": "node",
      "args": ["/absolute/path/to/ovs-mcp/dist/index.js"],
      "env": {
        "OVS_SESSION_FILE": "/absolute/private/ovs-session.json"
      }
    }
  }
}
```

Generic Streamable HTTP configuration:

```json
{
  "mcpServers": {
    "ovs": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

## Tools

| Tool | Behavior |
|------|----------|
| `connect_ovs` | Detect a missing session, privately import the user's local authenticated HAR, validate OVS, and report connection status without credentials |
| `search_products` | Search the live catalog with pagination and return normalized product IDs, names, brands, prices, stock, and URLs |
| `list_categories` | List active catalog categories |
| `list_manufacturers` | List active manufacturers that have products |
| `list_currencies` | List currencies exposed by OVS |
| `get_cart` | Read the authenticated cart |
| `add_to_cart` | Preview, confirm, add 1–50 units, and verify the resulting live cart quantity |
| `remove_from_cart` | Preview, confirm, remove 1–50 units, and verify the resulting live cart quantity |
| `get_customer` | Read the authenticated customer profile; contains personal data |
| `list_addresses` | Read delivery addresses; contains personal data |
| `list_favorites` | Read favorite products |

All tools return both human-readable text and validated structured MCP content. Tool annotations distinguish reads from cart mutations. Authentication fields are recursively removed from tool output, and cart output deliberately excludes saved addresses and the cart secure key.

## Cart confirmations

Cart changes use the same two-call design as the Picnic MCP. The first call previews the current and resulting quantity and returns a single-use UUID confirmation token. The client calls the same tool again with that token within five minutes.

The token is bound to the operation, product, quantity, and current cart contents. It is rejected when the cart changed, was already used, expired, or belongs to another operation. Mutations are serialized. Each applied unit uses the exact observed OVS request, verifies the returned cart quantity, and reconciles an ambiguous failure by reading the live cart before returning.

Only operations observed from the official OVS app are implemented. The server fails explicitly when authentication, an endpoint, or a response shape is no longer recognized; it never switches to browser automation, fake data, or another backend.

## CLI

```bash
node dist/cli.js search "seitan" --session /absolute/private/ovs-session.json
node dist/cli.js categories --session /absolute/private/ovs-session.json
node dist/cli.js cart --session /absolute/private/ovs-session.json
node dist/cli.js favorites --session /absolute/private/ovs-session.json
node dist/cli.js add 16126 --quantity 1 --session /absolute/private/ovs-session.json
node dist/cli.js add 16126 --quantity 1 --confirm --session /absolute/private/ovs-session.json
```

The CLI also exposes `manufacturers`, `currencies`, `customer`, `addresses`, `add`, and `remove`. Cart commands preview unless `--confirm` is supplied. JSON output may contain private account information; redirect it only to a trusted local destination.

## Session Security

| Rule | Enforcement |
|------|-------------|
| Private storage | Session files must be `0600` on Unix-like systems |
| No embedded credential | The repository contains no OVS authorization header, token, refresh token, device identifier, capture, or customer fixture |
| Guided connection | The MCP starts disconnected, calls `connect_ovs`, and never exposes imported credentials in tool output |
| Direct backend | Every supported operation runs through the OVS private API only |
| Automatic refresh | HTTP 452 triggers the observed refresh flow and atomically replaces the private session file |
| Network deadline | Every OVS request has a 20-second abort deadline |
| Local HTTP only | Streamable HTTP refuses public network interfaces |
| Public-output filtering | Authentication fields, cart addresses, and cart secure keys are absent from normalized MCP cart results |

See [SECURITY.md](SECURITY.md) before reporting a security issue. Never attach a capture or session file to a public report.

## Development

```bash
npm run typecheck
npm run typecheck:tests
npm run lint
npm run test:all
npm run build
npm run test:privacy
npm run test:package
```

`npm run verify` runs the complete gate. Unit tests use synthetic clients and credentials. MCP integration tests use the official client and in-memory transport; no test contacts OVS.

See [docs/architecture.md](docs/architecture.md) for runtime boundaries, observed protocol rules, privacy controls, and the checklist for adding tools.

## License

MIT. Official Vegan Shop names and trademarks belong to their respective owner.
