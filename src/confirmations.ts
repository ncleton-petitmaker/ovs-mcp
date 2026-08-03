import { createHash, randomUUID } from "node:crypto";
import type { CartResult } from "./normalize.js";

interface Confirmation {
  operation: "add" | "remove";
  productId: string;
  quantity: number;
  fingerprint: string;
  expiresAt: number;
}

export class ConfirmationStore {
  readonly #values = new Map<string, Confirmation>();

  create(
    operation: Confirmation["operation"],
    productId: string,
    quantity: number,
    cart: CartResult,
  ): string {
    this.#prune();
    const token = randomUUID();
    this.#values.set(token, {
      operation,
      productId,
      quantity,
      fingerprint: cartFingerprint(cart),
      expiresAt: Date.now() + 5 * 60_000,
    });
    return token;
  }

  consume(
    token: string,
    operation: Confirmation["operation"],
    productId: string,
    quantity: number,
    cart: CartResult,
  ): void {
    this.#prune();
    const value = this.#values.get(token);
    this.#values.delete(token);
    if (!value)
      throw new Error(
        "Confirmation token is missing, expired, or already used.",
      );
    if (
      value.operation !== operation ||
      value.productId !== productId ||
      value.quantity !== quantity
    ) {
      throw new Error("Confirmation token does not match this cart operation.");
    }
    if (value.fingerprint !== cartFingerprint(cart)) {
      throw new Error(
        "Cart changed after preview. Request a new confirmation.",
      );
    }
  }

  #prune(): void {
    const now = Date.now();
    for (const [token, value] of this.#values)
      if (value.expiresAt <= now) this.#values.delete(token);
  }
}

export function cartFingerprint(cart: CartResult): string {
  const state = {
    cartId: cart.cartId,
    items: [...cart.items]
      .map((item) => ({ productId: item.productId, quantity: item.quantity }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  };
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

export class MutationCoordinator {
  #tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const preceding = this.#tail;
    let release = () => {};
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await preceding;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
