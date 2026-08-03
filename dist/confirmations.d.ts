import type { CartResult } from "./normalize.js";
interface Confirmation {
    operation: "add" | "remove";
    productId: string;
    quantity: number;
    fingerprint: string;
    expiresAt: number;
}
export declare class ConfirmationStore {
    #private;
    create(operation: Confirmation["operation"], productId: string, quantity: number, cart: CartResult): string;
    consume(token: string, operation: Confirmation["operation"], productId: string, quantity: number, cart: CartResult): void;
}
export declare function cartFingerprint(cart: CartResult): string;
export declare class MutationCoordinator {
    #private;
    run<T>(operation: () => Promise<T>): Promise<T>;
}
export {};
//# sourceMappingURL=confirmations.d.ts.map