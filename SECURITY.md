# Security Policy

## Reporting

Open a GitHub security advisory for code vulnerabilities. Do not open a public issue containing a session file, HAR, raw proxy flow, authorization header, token, refresh token, device identifier, email address, delivery address, telephone number, cart, or order.

If a credential was exposed, revoke or replace the OVS session first. Treat both the session JSON and the source capture like a password.

## Supported boundary

The server is intended for a local account owner. Streamable HTTP binds only to loopback and has no remote authentication layer. Use stdio for desktop MCP clients. Do not publish the HTTP port through a tunnel, reverse proxy, container port, or public interface.

The project does not contain an OVS app credential. Every user must bootstrap a session from a device and account they control.
