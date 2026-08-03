import { type OvsSession } from "./session.js";
export interface OvsEnvelope {
    action: string;
    data: unknown;
}
export interface OvsClientOptions {
    sessionPath: string;
    fetch?: typeof globalThis.fetch;
    timeoutMs?: number;
}
export declare class OvsClient {
    #private;
    constructor(options: OvsClientOptions);
    session(): Promise<OvsSession>;
    call(endpoint: string, action: string, data?: Record<string, unknown>): Promise<OvsEnvelope>;
    authenticatedCall(endpoint: string, action: string, data?: Record<string, unknown>): Promise<OvsEnvelope>;
}
//# sourceMappingURL=api.d.ts.map