---
name: ovs-mcp
description: Connect and control an Official Vegan Shop account through the local unofficial OVS MCP server: search the live catalog, inspect the cart, and confirm cart changes without exposing credentials or personal data.
---

# OVS MCP

Use this skill when `ovs-mcp` is installed from GitHub or a checkout.

## Workflow

1. Call `connect_ovs` before the first operation.
2. If it returns `connection_required`, present `loginUrl` to the user. Never request or accept an OVS password in chat or an MCP form.
3. After the user completes the secure page, call `connect_ovs` again and require `connected`.
4. Use `search_products` to obtain the current `id`, `productAttributeId`,
   `productCustomizationId`, and availability. Preserve all three identifiers.
5. Read `get_cart` before planning a change.
6. Call `add_to_cart` or `remove_from_cart` with the exact three identifiers
   and without a confirmation token to preview the exact result.
7. Explain the proposed change and obtain the user's confirmation.
8. Repeat the same tool call with the returned token. If the cart changed, request a new preview.

Never expose cookies, local session files, customer records, addresses, or order data. Fail explicitly when OVS changes an observed response shape or rejects authentication.
