export declare function redact(value: unknown): string;
export declare class OvsError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    constructor(message: string, code: string, retryable?: boolean);
}
export interface CartMutationTarget {
    operation: "add" | "remove";
    product_id: string;
    product_attribute_id: string;
    product_customization_id: string;
}
export interface CartMutationFailurePayload extends Record<string, unknown> {
    ok: false;
    status: "mutation_failed";
    code: string;
    error: string;
    cart_may_be_partially_modified: true;
    applied_units: number | null;
    requested_units: number;
    target: CartMutationTarget;
    details: string[];
}
export declare class OvsCartMutationError extends OvsError {
    readonly target: CartMutationTarget;
    readonly requestedUnits: number;
    readonly appliedUnits: number | null;
    readonly cartMayBePartiallyModified = true;
    constructor(target: CartMutationTarget, requestedUnits: number, appliedUnits: number | null, reason: unknown);
    readonly reason: string;
    publicPayload(): CartMutationFailurePayload;
}
export declare function cartMutationFailurePayload(error: unknown): CartMutationFailurePayload | null;
export declare function safeError(error: unknown): OvsError;
//# sourceMappingURL=errors.d.ts.map