const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /("?(?:token|refresh_token|authorization|x-device-uuid)"?\s*[:=]\s*")[^"]+/gi,
];

export function redact(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value);
  for (const pattern of SECRET_PATTERNS)
    text = text.replace(pattern, "$1<redacted>");
  return text;
}

export class OvsError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "OvsError";
  }
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

export class OvsCartMutationError extends OvsError {
  readonly cartMayBePartiallyModified = true;

  constructor(
    readonly target: CartMutationTarget,
    readonly requestedUnits: number,
    readonly appliedUnits: number | null,
    reason: unknown,
  ) {
    const code =
      appliedUnits === null
        ? "OVS_CART_MUTATION_AMBIGUOUS"
        : appliedUnits > 0
          ? "OVS_CART_MUTATION_PARTIAL"
          : "OVS_CART_MUTATION_FAILED_AFTER_TOUCH";
    const message =
      appliedUnits === null
        ? "OVS cart mutation became ambiguous after the write started. Read the live cart before requesting a new preview."
        : `OVS cart mutation stopped after ${appliedUnits} of ${requestedUnits} requested units were proven. Read the live cart before requesting a new preview.`;
    super(message, code, false);
    this.name = "OvsCartMutationError";
    this.reason = redact(reason).slice(0, 300);
  }

  readonly reason: string;

  publicPayload(): CartMutationFailurePayload {
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

export function cartMutationFailurePayload(
  error: unknown,
): CartMutationFailurePayload | null {
  return error instanceof OvsCartMutationError ? error.publicPayload() : null;
}

export function safeError(error: unknown): OvsError {
  if (error instanceof OvsError) return error;
  return new OvsError(redact(error), "OVS_UNEXPECTED_ERROR");
}
