# Expurgated observed OVS contract

Base URL: `https://www.officialveganshop.com/module/vtj_api`

All operations use POST JSON. Required per-session headers are `authorization`, `x-device-uuid`, `x-app-version`, `x-os`, `x-os-version`, `user-agent`, and `accept-language`. Their values must come from the user's private session and are never stored here.

| Endpoint | Action | Observed data keys |
|----------|--------|--------------------|
| `/search` | `search` | `expr`, `page`, `nb`, `order_way`, `order_by` |
| `/category` | `categories` | `active`, `order` |
| `/manufacturer` | `manufacturers` | `active`, `all_group`, `html`, `random`, `nb`, `get_nb_products`, `group_by`, `random_num`, `with_product`, `page` |
| `/parameter` | `currencies` | none |
| `/cart` | `cart` | `token` |
| `/cart` | `add_product_cart` | `id_product`, `quantity` (observed value: 1), `token` |
| `/cart` | `remove_product_cart` | `id_product`, `quantity` (observed value: 1), `token` |
| `/customer` | `customer` | `token` |
| `/customer` | `addresses` | `token` |
| `/product` | `favoris` | `token` |
| `/auth` | `refresh_token` | `refresh_token` |

Observed authentication behavior: an expired account token can return HTTP 452. A successful refresh returns a replacement account token and refresh token. Retry the original authenticated call only once with the replacement token.

Observed search behavior: `order_way` is `desc`, `order_by` is `position`, page begins at 1, and the app used limits of 5 for suggestions and 30 for the full results view. The public tool bounds the caller-selected limit to 1–50.

Observed cart behavior: each plus action sends `add_product_cart` with quantity 1 and returns the updated cart. Each minus action sends `remove_product_cart` with quantity 1 and returns the updated cart. Multi-unit public operations repeat this observed unit request and verify the quantity after every response.

Do not add an endpoint or action to this file based on a guess, a web framework convention, or another PrestaShop integration.
