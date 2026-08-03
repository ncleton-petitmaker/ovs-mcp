# Architecture

## Runtime

`src/index.ts` is the MCP composition root. It supports stdio and a stateless Streamable HTTP endpoint restricted to loopback. `src/server.ts` is side-effect free and can be imported by another Node.js application. `src/cli.ts` exposes the same read service without MCP. The audited `dist/` build is versioned so a GitHub npm spec can run through `npx` without installing development dependencies or compiling on the user's machine.

`OvsService` owns public operations and normalization. `OvsClient` is the only component that sends HTTP requests. `session.ts` is the only component that reads or writes credentials.

## Observed API Contract

The supported backend is `https://www.officialveganshop.com/module/vtj_api`. All supported calls use POST with JSON bodies containing `action` and, when applicable, `data`. The required app headers and account credentials come only from the user's private session file.

The repository documents request shapes but contains no raw response, account fixture, capture, credential, or device identifier. See `skills/ovs-mcp/references/observed-contract.md` for the expurgated operation list.

## Session Lifecycle

The server can start without a session. Its instructions tell the MCP host to call `connect_ovs`, which either reports one private user action or imports a local HAR, writes a versioned session file atomically with mode `0600`, and validates a live call. It never returns credentials. An authenticated call rejected with the observed HTTP 452 status invokes `/auth` with the observed `refresh_token` action, persists the replacement credentials, and retries the original call once.

Authentication failures, unknown response envelopes, timeouts, and network errors have distinct explicit errors. The client never guesses a replacement endpoint or silently changes backend.

## Privacy Boundary

Raw sessions remain outside the repository. The public result normalizer recursively removes authentication and device fields. Profile and address tools deliberately return account-owned personal data, so the README warns that the MCP host and its model provider can receive it.

The privacy audit rejects capture extensions, session filenames, JWT-shaped strings, long Bearer values, non-synthetic UUIDs, and credential-like literals. Package verification independently checks the publishable tarball.

## Tool Safety

Catalog and account reads are read-only, idempotent, and open-world. `add_to_cart` and `remove_from_cart` reproduce the observed one-unit app actions. Multi-unit changes repeat that unit contract and verify the target quantity after each response.

Cart mutations use a five-minute, state-bound, single-use confirmation token. Execution re-reads the cart, rejects stale previews, serializes mutations, and reconciles ambiguous failures against the live cart. Normalized cart output omits saved addresses and the upstream cart secure key.

## Adding a Tool

1. Capture the operation from an account and device you control.
2. Record only the expurgated endpoint, action, request keys, and response schema.
3. Add the call through `OvsClient`; never call `fetch` from a tool.
4. Define bounded Zod input and output schemas.
5. Normalize output and remove authentication fields.
6. Set accurate MCP annotations.
7. For a mutation, add preview/confirmation, state revalidation, serialization, timeouts, and ambiguous-result reconciliation.
8. Add unit and official MCP client integration tests with synthetic data.
9. Run `npm run verify` before publishing.
