# Architecture

`ovs-mcp` is a local TypeScript MCP server with a small CLI over the same service layer.

1. `connect_ovs` checks the saved website session.
2. If needed, a one-time login page binds to `127.0.0.1` on a random port and uses a random path token.
3. Credentials are submitted directly from that page to OVS. The password is discarded; cookies are written atomically with mode `0600`.
4. Catalog and cart operations use the observed OVS website contracts.
5. Normalizers return only product and cart fields. Account and address objects are never exposed.

Cart writes require a state-bound, single-use confirmation token valid for five minutes. Mutations are serialized. Each unit change is verified against the resulting product quantity; an uncertain response triggers a cart reconciliation and fails loudly unless the expected state is proven.

All upstream URLs are constructed from a fixed HTTPS origin and a local relative path. The optional MCP HTTP transport and the login page bind only to loopback.

The privacy audit rejects private session files and credential-shaped values. Package verification independently inspects the distributable archive.

## Updating an observed contract

1. Work only with an account you control.
2. Record only the minimal request and response shape required by the operation.
3. Add synthetic tests with no account or personal values.
4. Update `skills/ovs-mcp/references/observed-contract.md`.
5. Run `npm run verify` before publication.
