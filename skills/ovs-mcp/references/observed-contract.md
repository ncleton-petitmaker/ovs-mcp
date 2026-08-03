# Expurgated observed OVS website contract

Fixed origin: `https://www.officialveganshop.com`

| Operation | Request | Required fields |
|---|---|---|
| Login | `POST /connexion` as form data | `email`, `password`, `submitLogin=1` |
| Validate session | `GET /mon-compte` with redirects disabled | HTTP 200 means connected; a redirect means disconnected |
| Search | `GET /recherche?s=<query>&page=<page>` | Product cards expose product ID, title, link, price, brand and stock attributes |
| Read cart | `GET /panier?action=show` | The page's `prestashop.cart` JSON contains products, subtotals and totals |
| Change quantity | `POST /module/add_to_cart/Ajax` as form data | `id_product`, `id_product_attribute=0`, `id_customization=0`, `op=up|down` |

The cart mutation response must report `success=true` and the exact expected resulting `qty`. Multi-unit operations repeat the observed single-unit request and verify every step.

Only `prestashop.cart` is normalized. Never return the page's customer, address, token, or secure-key values.
