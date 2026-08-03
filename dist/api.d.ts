export interface OvsClientOptions {
    sessionPath: string;
    fetch?: typeof globalThis.fetch;
    timeoutMs?: number;
}
export declare class OvsClient {
    #private;
    constructor(options: OvsClientOptions);
    login(email: string, password: string): Promise<void>;
    isAuthenticated(): Promise<boolean>;
    get(path: string): Promise<Response>;
    postForm(path: string, values: Record<string, string>): Promise<Response>;
    private requireAuthenticated;
    private loadCookies;
    private persist;
    private request;
    private captureCookies;
}
//# sourceMappingURL=api.d.ts.map