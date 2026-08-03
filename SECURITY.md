# Security Policy

## Reporting

Report code vulnerabilities with a private GitHub security advisory. Never place a session file, cookie, email address, delivery address, telephone number, cart, or order in a public issue.

If a session cookie was exposed, sign out of Official Vegan Shop and reconnect before reporting the problem. Treat the local session file like a password.

## Security boundary

The server is intended for the account owner on their own computer. The optional Streamable HTTP transport binds only to loopback and has no remote authentication layer. Do not publish its port through a tunnel, reverse proxy, container port, or public interface.

Credentials are entered on a loopback-only page, sent directly to Official Vegan Shop, and never stored. The local session contains only cookies, is created with mode `0600`, and must never be committed or shared. Public MCP tools intentionally omit customer profiles and addresses.
