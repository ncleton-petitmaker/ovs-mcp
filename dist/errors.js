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
export function safeError(error) {
    if (error instanceof OvsError)
        return error;
    return new OvsError(redact(error), "OVS_UNEXPECTED_ERROR");
}
//# sourceMappingURL=errors.js.map