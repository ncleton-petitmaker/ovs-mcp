import { describe, expect, it } from "vitest";
import { ConfirmationStore, cartFingerprint } from "../../src/confirmations.js";
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
    const token = store.create("add", "7", "3", "0", 1, cart);
    expect(store.consume(token, "add", "7", "3", "0", 1)).toBe(
      cartFingerprint(cart),
    );
    expect(() => store.consume(token, "add", "7", "3", "0", 1)).toThrow(
      "already used",
    );
  });

  it("binds a confirmation to the exact product variant", () => {
    const store = new ConfirmationStore();
    const token = store.create("add", "7", "3", "0", 1, cart);
    expect(() => store.consume(token, "add", "7", "4", "0", 1)).toThrow(
      "does not match",
    );
  });

  it("returns the exact preview fingerprint for locked revalidation", () => {
    const store = new ConfirmationStore();
    const token = store.create("add", "7", "3", "0", 1, cart);
    expect(store.consume(token, "add", "7", "3", "0", 1)).toBe(
      cartFingerprint(cart),
    );
  });
});
