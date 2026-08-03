export declare function redact(value: unknown): string;
export declare class OvsError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    constructor(message: string, code: string, retryable?: boolean);
}
export declare function safeError(error: unknown): OvsError;
//# sourceMappingURL=errors.d.ts.map