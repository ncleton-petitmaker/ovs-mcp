# OVS MCP contributor instructions

- Never commit or print an OVS token, refresh token, authorization header, device UUID, raw capture, HAR file, customer record, address, cart, order, email, telephone number, or Wi-Fi identifier.
- Keep runtime session files outside the repository with mode `0600`.
- Use only API operations observed from the official OVS app or site. Do not invent endpoints, actions, headers, or response fields.
- Fail explicitly when authentication, API version, or response schemas are no longer recognized. Never switch to a browser or mock backend silently.
- Reserve stdout for MCP stdio frames. Send diagnostics to stderr after redacting secrets.
- Read operations may be exposed directly. Any future mutation must use preview/confirmation, state revalidation, serialization, timeouts, and ambiguous-result reconciliation.
- `AGENTS.md` is the source of truth. Keep `CLAUDE.md` as an import of this file.
