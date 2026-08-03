import { describe, expect, it } from "vitest";
import { ConfirmationStore } from "../../src/confirmations.js";
import type { CartResult } from "../../src/normalize.js";

const cart: CartResult = {
  cartId: "1",
  items: [],
  totalProducts: "0",
  totalPrice: "0",
  totalShipping: "0",
  hasFresh: false,
};

describe("cart confirmations", () => {
  it("is single-use and bound to the operation", () => {
    const store = new ConfirmationStore();
    const token = store.create("add", "7", 1, cart);
    expect(() => store.consume(token, "add", "7", 1, cart)).not.toThrow();
    expect(() => store.consume(token, "add", "7", 1, cart)).toThrow(
      "already used",
    );
  });

  it("rejects a cart that changed after preview", () => {
    const store = new ConfirmationStore();
    const token = store.create("add", "7", 1, cart);
    const changed = {
      ...cart,
      items: [
        {
          productId: "8",
          name: "Other",
          quantity: 1,
          unitPrice: null,
          total: null,
          manufacturer: null,
          reference: null,
        },
      ],
    };
    expect(() => store.consume(token, "add", "7", 1, changed)).toThrow(
      "Cart changed",
    );
  });
});
