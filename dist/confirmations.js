import { createHash, randomUUID } from "node:crypto";
export class ConfirmationStore {
    #values = new Map();
    create(operation, productId, productAttributeId, productCustomizationId, quantity, cart) {
        this.#prune();
        const token = randomUUID();
        this.#values.set(token, {
            operation,
            productId,
            productAttributeId,
            productCustomizationId,
            quantity,
            fingerprint: cartFingerprint(cart),
            expiresAt: Date.now() + 5 * 60_000,
        });
        return token;
    }
    consume(token, operation, productId, productAttributeId, productCustomizationId, quantity) {
        this.#prune();
        const value = this.#values.get(token);
        this.#values.delete(token);
        if (!value)
            throw new Error("Confirmation token is missing, expired, or already used.");
        if (value.operation !== operation ||
            value.productId !== productId ||
            value.productAttributeId !== productAttributeId ||
            value.productCustomizationId !== productCustomizationId ||
            value.quantity !== quantity) {
            throw new Error("Confirmation token does not match this cart operation.");
        }
        return value.fingerprint;
    }
    #prune() {
        const now = Date.now();
        for (const [token, value] of this.#values)
            if (value.expiresAt <= now)
                this.#values.delete(token);
    }
}
export function cartFingerprint(cart) {
    const state = {
        items: [...cart.items]
            .map((item) => ({
            productId: item.productId,
            productAttributeId: item.productAttributeId,
            productCustomizationId: item.productCustomizationId,
            quantity: item.quantity,
        }))
            .sort((a, b) => [a.productId, a.productAttributeId, a.productCustomizationId]
            .join(":")
            .localeCompare([b.productId, b.productAttributeId, b.productCustomizationId].join(":"))),
    };
    return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}
//# sourceMappingURL=confirmations.js.map