#!/usr/bin/env node
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ConfirmationStore } from "./confirmations.js";
import { createServer } from "./server.js";
import { resolveSessionPath } from "./session.js";
async function main() {
    const transportName = argument("--transport") ?? "stdio";
    const sessionPath = resolveSessionPath(argument("--session"));
    if (transportName === "stdio") {
        const server = createServer({ sessionPath });
        await server.connect(new StdioServerTransport());
        console.error("OVS MCP server running on stdio");
        return;
    }
    if (transportName !== "http")
        throw new Error("--transport must be stdio or http.");
    const host = process.env.OVS_MCP_HOST ?? "127.0.0.1";
    if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
        throw new Error("HTTP transport may only bind to loopback because OVS account data is private.");
    }
    const port = Number(process.env.OVS_MCP_PORT ?? "3000");
    if (!Number.isInteger(port) || port < 1 || port > 65_535)
        throw new Error("OVS_MCP_PORT is invalid.");
    const app = createMcpExpressApp({ host });
    // Streamable HTTP is stateless at the protocol layer, but confirmation
    // tokens must survive the preview POST so the following confirmation POST
    // can consume the same single-use state for this local process.
    const httpConfirmationStore = new ConfirmationStore();
    app.post("/mcp", async (request, response) => {
        const server = createServer({
            sessionPath,
            confirmationStore: httpConfirmationStore,
        });
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        try {
            await server.connect(transport);
            await transport.handleRequest(request, response, request.body);
        }
        catch {
            console.error("OVS MCP HTTP request failed");
            if (!response.headersSent) {
                response.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                });
            }
        }
        finally {
            response.on("close", () => {
                void transport.close();
                void server.close();
            });
        }
    });
    app.get("/mcp", (_request, response) => response.status(405).json({ error: "Use MCP Streamable HTTP POST." }));
    app.delete("/mcp", (_request, response) => response.status(405).json({ error: "Stateless server." }));
    await new Promise((resolve, reject) => {
        const listener = app.listen(port, host, () => {
            console.error(`OVS MCP server listening at http://${host}:${port}/mcp`);
            resolve();
        });
        listener.once("error", reject);
    });
}
function argument(name) {
    const index = process.argv.indexOf(name);
    if (index < 0)
        return undefined;
    const value = process.argv[index + 1];
    if (!value)
        throw new Error(`${name} requires a value.`);
    return value;
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`OVS MCP startup failed: ${message}`);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map