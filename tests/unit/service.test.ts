import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  parseCartMutationResponse,
  parseCartPreviewEnvelope,
  parseCartRefreshEnvelope,
  parseDetailedCart,
  parseProducts,
  parseSearchEnvelope,
  validateCartPreview,
} from "../../src/service.js";

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

describe("observed OVS response contracts", () => {
  it("accepts the strict XHR search envelope and its rendered products", async () => {
    const value = JSON.parse(
      await fixture("search-envelope.synthetic.json"),
    ) as unknown;
    const envelope = parseSearchEnvelope(value);
    expect(envelope).toMatchObject({ total: 1, currentPage: 1 });
    expect(parseProducts(envelope.renderedProducts)).toMatchObject([
      {
        id: "7",
        productAttributeId: "3",
        productCustomizationId: "0",
        availableForOrder: true,
      },
    ]);
  });

  it("rejects a search envelope with an unobserved shape", async () => {
    const value = JSON.parse(
      await fixture("search-envelope.synthetic.json"),
    ) as Record<string, unknown>;
    value.unobserved = true;
    expect(() => parseSearchEnvelope(value)).toThrow(
      "search response keys are no longer recognized",
    );
  });

  it("accepts both observed pagination page collections", async () => {
    const value = JSON.parse(
      await fixture("search-envelope.synthetic.json"),
    ) as { pagination: { pages: unknown } };
    value.pagination.pages = [{ page: 1 }];
    expect(parseSearchEnvelope(value)).toMatchObject({ currentPage: 1 });
  });

  it("validates the observed empty cart preview", async () => {
    const cart = parseDetailedCart(
      parseCartRefreshEnvelope(
        JSON.parse(
          await fixture("cart-refresh-empty.public-shape.synthetic.json"),
        ),
      ),
    );
    const preview = parseCartPreviewEnvelope(
      JSON.parse(await fixture("cart-preview-empty.public.json")),
    );
    expect(cart.items).toEqual([]);
    validateCartPreview(preview, cart);
  });

  it("cross-checks a synthetic non-empty detailed cart against source-proven preview selectors", async () => {
    const cart = parseDetailedCart(
      parseCartRefreshEnvelope(
        JSON.parse(
          await fixture(
            "cart-refresh-non-empty.source-contract.synthetic.json",
          ),
        ),
      ),
    );
    const preview = parseCartPreviewEnvelope(
      JSON.parse(
        await fixture("cart-preview-non-empty.source-selectors.synthetic.json"),
      ),
    );
    expect(cart.items).toMatchObject([
      {
        productId: "7",
        productAttributeId: "3",
        productCustomizationId: "0",
        quantity: 2,
      },
    ]);
    expect(() => validateCartPreview(preview, cart)).not.toThrow();
  });

  it("rejects a preview whose count differs from the page cart", async () => {
    const preview = parseCartPreviewEnvelope(
      JSON.parse(await fixture("cart-preview-empty.public.json")),
    );
    expect(() =>
      validateCartPreview(preview, {
        items: [
          {
            productId: "7",
            productAttributeId: "3",
            productCustomizationId: "0",
            name: "Synthetic",
            quantity: 1,
            unitPrice: null,
            total: null,
            manufacturer: null,
            reference: null,
          },
        ],
        totalProducts: "4,90 €",
        totalPrice: "4,90 €",
        totalShipping: null,
      }),
    ).toThrow("count no longer matches");
  });

  it("accepts only the custom frontend retour and exact qty mutation contract", () => {
    expect(() =>
      parseCartMutationResponse(JSON.stringify({ retour: true, qty: 2 }), 2),
    ).not.toThrow();
    expect(() =>
      parseCartMutationResponse(JSON.stringify({ success: true, qty: 2 }), 2),
    ).toThrow("rejected");
    expect(() =>
      parseCartMutationResponse(JSON.stringify({ retour: true, qty: 1 }), 2),
    ).toThrow("quantity is no longer recognized");
  });
});
