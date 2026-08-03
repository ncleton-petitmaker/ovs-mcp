import { createHash, randomUUID } from "node:crypto";
export class ConfirmationStore {
    #values = new Map();
    create(operation, productId, quantity, cart) {
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
    consume(token, operation, productId, quantity, cart) {
        this.#prune();
        const value = this.#values.get(token);
        this.#values.delete(token);
        if (!value)
            throw new Error("Confirmation token is missing, expired, or already used.");
        if (value.operation !== operation ||
            value.productId !== productId ||
            value.quantity !== quantity) {
            throw new Error("Confirmation token does not match this cart operation.");
        }
        if (value.fingerprint !== cartFingerprint(cart)) {
            throw new Error("Cart changed after preview. Request a new confirmation.");
        }
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
        cartId: cart.cartId,
        items: [...cart.items]
            .map((item) => ({ productId: item.productId, quantity: item.quantity }))
            .sort((a, b) => a.productId.localeCompare(b.productId)),
    };
    return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}
export class MutationCoordinator {
    #tail = Promise.resolve();
    async run(operation) {
        const preceding = this.#tail;
        let release = () => { };
        this.#tail = new Promise((resolve) => {
            release = resolve;
        });
        await preceding;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
}
//# sourceMappingURL=confirmations.js.map