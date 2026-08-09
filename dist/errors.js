const SECRET_PATTERNS = [
    /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    /("?(?:token|refresh_token|authorization|x-device-uuid)"?\s*[:=]\s*")[^"]+/gi,
];
export function redact(value) {
    let text = value instanceof Error ? value.message : String(value);
    for (const pattern of SECRET_PATTERNS)
        text = text.replace(pattern, "$1<redacted>");
    return text;
}
export class OvsError extends Error {
    code;
    retryable;
    constructor(message, code, retryable = false) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.name = "OvsError";
    }
}
export class OvsCartMutationError extends OvsError {
    target;
    requestedUnits;
    appliedUnits;
    cartMayBePartiallyModified = true;
    constructor(target, requestedUnits, appliedUnits, reason) {
        const code = appliedUnits === null
            ? "OVS_CART_MUTATION_AMBIGUOUS"
            : appliedUnits > 0
                ? "OVS_CART_MUTATION_PARTIAL"
                : "OVS_CART_MUTATION_FAILED_AFTER_TOUCH";
        const message = appliedUnits === null
            ? "OVS cart mutation became ambiguous after the write started. Read the live cart before requesting a new preview."
            : `OVS cart mutation stopped after ${appliedUnits} of ${requestedUnits} requested units were proven. Read the live cart before requesting a new preview.`;
        super(message, code, false);
        this.target = target;
        this.requestedUnits = requestedUnits;
        this.appliedUnits = appliedUnits;
        this.name = "OvsCartMutationError";
        this.reason = redact(reason).slice(0, 300);
    }
    reason;
    publicPayload() {
        return {
            ok: false,
            status: "mutation_failed",
            code: this.code,
            error: this.message,
            cart_may_be_partially_modified: true,
            applied_units: this.appliedUnits,
            requested_units: this.requestedUnits,
            target: this.target,
            details: [
                this.reason,
                "No cart write was retried automatically. Read the live cart before creating another confirmation.",
            ],
        };
    }
}
export function cartMutationFailurePayload(error) {
    return error instanceof OvsCartMutationError ? error.publicPayload() : null;
}
export function safeError(error) {
    if (error instanceof OvsError)
        return error;
    return new OvsError(redact(error), "OVS_UNEXPECTED_ERROR");
}
//# sourceMappingURL=errors.js.map