import type { OvsClient } from "./api.js";
export interface LoginFlow {
    url: string;
    completed: Promise<void>;
    close(): Promise<void>;
}
export declare function startLoginServer(client: OvsClient): Promise<LoginFlow>;
//# sourceMappingURL=login-server.d.ts.map