# Expurgated observed OVS website contract

Observed against the public French storefront on 2026-08-09. No cart mutation
was performed to document this contract. Fixtures contain no account, cookie,
customer, address, or real cart data.

Fixed origin: `https://www.officialveganshop.com`

| Operation | Request | Strictly consumed response |
|---|---|---|
| Login | `POST /connexion` as form data | `email`, `password`, `submitLogin=1`, then an authenticated account page |
| Validate session | `GET /mon-compte` with redirects disabled | HTTP 200 means connected; a redirect means disconnected |
| Search | `GET /recherche?s=<query>&page=<page>&from-xhr` with `X-Requested-With: XMLHttpRequest` | JSON envelope containing `rendered_products`, `products`, and strict pagination fields |
| Read exact cart items | `GET /index.php?controller=cart&ajax=1&action=refresh` with `X-Requested-With: XMLHttpRequest` | Strict JSON fragments `cart_detailed`, `cart_detailed_totals`, summary fragments, actions, and voucher |
| Refresh cart proof | `GET /module/stshoppingcart/ajax` with `X-Requested-With: XMLHttpRequest` | JSON with `preview`, `modal`, `flying_image`, `products_count`, `total_value`, and `maximum_already` |
| Change exact quantity | `POST /module/add_to_cart/Ajax` as form data | Frontend-observed `retour` truthiness and exact numeric `qty`, followed by a fresh cart reconciliation |

The search JSON is not itself the rendered catalogue. Product cards are parsed
from `rendered_products`; their IDs are cross-checked against `products[]` and
the same-origin `add_to_cart_url`. Each actionable card supplies
`data-id-product`, `data-id-product-attribute`, and `data-id-customization`.
The last two identifiers must be propagated exactly and are never assumed to be
zero.

The detailed refresh is the structured source for each line. Its product,
attribute, and customization IDs are cross-checked between the removal action,
quantity input, and product label; its unit price, total, quantity, subtotal,
shipping, and total fragments are required. The public empty mini-cart preview
is a `shoppingcart-list` containing `cart_empty`. Live theme assets prove the
non-empty selectors `small_cart_product_list` and `item-panier-apercu`; its
count and total are checked against the detailed refresh before anything is
returned.

The live custom cart frontend posts exactly `id_product`,
`id_product_attribute`, `id_customization`, and `op=up|down` to
`/module/add_to_cart/Ajax`. It parses the text response as JSON, tests `retour`,
and renders `qty`. Multi-unit operations repeat this observed single-unit
request. Every step then reads both cart sources again; an ambiguous network or
schema result succeeds only if reconciliation proves the exact expected line
quantity.

If reconciliation cannot prove the exact delta, the mutation stops without a
retry and reports `cart_may_be_partially_modified=true`. `applied_units` is a
number only for units already established by successful independent cart
reads; it remains `null` when the resulting count is unknown.

Only the cart fields described above are normalized. Never return the page's
customer, address, token, secure-key, or unrelated global state.
