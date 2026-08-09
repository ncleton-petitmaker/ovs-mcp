import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OvsClient } from "./api.js";
import { ConfirmationStore } from "./confirmations.js";
export interface CreateServerOptions {
    sessionPath: string;
    client?: OvsClient;
    confirmationStore?: ConfirmationStore;
}
export declare function createServer(options: CreateServerOptions): McpServer;
//# sourceMappingURL=server.d.ts.map