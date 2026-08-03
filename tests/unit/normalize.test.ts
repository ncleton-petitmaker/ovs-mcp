import { describe, expect, it } from "vitest";
import { normalizeCart, stripSecrets } from "../../src/normalize.js";
import { parseProducts } from "../../src/service.js";

describe("normalization", () => {
  it("extracts actionable product fields from OVS search HTML", () => {
    const products = parseProducts(
      `<article class="product-miniature" data-id-product="42"><a class="nom-marque">Example</a><h2 class="product-title"><a href="https://www.officialveganshop.com/p/42">Seitan &amp; poivre</a></h2><span class="price">5,90 €</span><div class="add-cart" data-quantity="7" data-allow-oosp="0"></div></article>`,
    );
    expect(products).toMatchObject([
      {
        id: "42",
        name: "Seitan & poivre",
        manufacturer: "Example",
        quantity: 7,
        availableForOrder: true,
      },
    ]);
  });

  it("recursively removes authentication and personal fields", () => {
    expect(
      stripSecrets({
        cookies: { secret: "SYNTHETIC" },
        customer: { id: 1 },
        nested: { id: 2 },
      }),
    ).toEqual({ nested: { id: 2 } });
  });

  it("normalizes website cart items without customer or address data", () => {
    expect(
      normalizeCart({
        id: "9",
        products: [
          {
            id_product: 7,
            name: "Seitan",
            cart_quantity: "2",
            price_wt: "4.90",
            total_wt: "9.80",
          },
        ],
        subtotals: { products: { value: "9.80" }, shipping: { value: "0" } },
        totals: { total: { value: "9.80" } },
        customer: { email: "private@example.invalid" },
      }),
    ).toEqual({
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
    });
  });
});
