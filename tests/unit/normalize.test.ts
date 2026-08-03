import { describe, expect, it } from "vitest";
import {
  normalizeCart,
  normalizeSearch,
  stripSecrets,
} from "../../src/normalize.js";

describe("normalization", () => {
  it("keeps actionable product fields", () => {
    expect(
      normalizeSearch(
        {
          total: "1",
          result: [
            {
              id_product: 42,
              name: "Seitan nature",
              manufacturer_name: "Example",
              category_name: "Épicerie",
              price: "5.90",
              quantity: 7,
              available_for_order: true,
              reference: "TEST-42",
              link: "https://example.invalid/product/42",
            },
          ],
        },
        "seitan",
        1,
        20,
      ),
    ).toMatchObject({
      total: 1,
      products: [{ id: "42", name: "Seitan nature", quantity: 7 }],
    });
  });

  it("recursively removes authentication secrets from tool output", () => {
    expect(
      stripSecrets({
        token: "SYNTHETIC",
        nested: { refresh_token: "SYNTHETIC", id: 1 },
      }),
    ).toEqual({
      nested: { id: 1 },
    });
  });

  it("normalizes cart items without address or secure-key fields", () => {
    expect(
      normalizeCart({
        id: "9",
        secure_key: "SYNTHETIC",
        has_fresh: false,
        summary: {
          products: [
            {
              id_product: 7,
              name: "Seitan",
              cart_quantity: "2",
              price_wt: "4.90",
              total_wt: "9.80",
            },
          ],
          total_products: "9.80",
          total_price: "9.80",
          total_shipping: "0",
          formattedAddresses: { delivery: "SYNTHETIC_PRIVATE_ADDRESS" },
        },
      }),
    ).toEqual({
      cartId: "9",
      items: [
        {
          productId: "7",
          name: "Seitan",
          quantity: 2,
          unitPrice: "4.90",
          total: "9.80",
          manufacturer: null,
          reference: null,
        },
      ],
      totalProducts: "9.80",
      totalPrice: "9.80",
      totalShipping: "0",
      hasFresh: false,
    });
  });
});
