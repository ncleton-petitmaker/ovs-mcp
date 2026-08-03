import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OvsClient } from "../../src/api.js";
import { createServer } from "../../src/server.js";
import { createSessionFile } from "../helpers.js";

describe("MCP server", () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(async () => {
    fetchMock.mockReset();
    const sessionPath = await createSessionFile();
    server = createServer({
      sessionPath,
      client: new OvsClient({ sessionPath, fetch: fetchMock }),
    });
    client = new Client({ name: "integration-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("registers connection, catalog, account, and confirmed cart tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "connect_ovs",
      "search_products",
      "list_categories",
      "list_manufacturers",
      "add_to_cart",
      "remove_from_cart",
      "list_currencies",
      "get_cart",
      "get_customer",
      "list_addresses",
      "list_favorites",
    ]);
    for (const tool of tools) {
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations?.openWorldHint).toBe(true);
    }
    expect(
      tools.find((tool) => tool.name === "search_products")?.annotations,
    ).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(
      tools.find((tool) => tool.name === "add_to_cart")?.annotations,
    ).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it("validates input and returns structured search content", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        action: "search",
        data: {
          total: "1",
          result: [{ id_product: "7", name: "Seitan", price: "4.90" }],
        },
      }),
    );
    const result = await client.callTool({
      name: "search_products",
      arguments: { query: "seitan" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      query: "seitan",
      total: 1,
      products: [{ id: "7" }],
    });
  });

  it("rejects invalid search input before the API call", async () => {
    const result = await client.callTool({
      name: "search_products",
      arguments: { query: "x" },
    });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews and confirms an add-to-cart operation", async () => {
    const emptyCart = {
      id: "1",
      has_fresh: false,
      summary: {
        products: [],
        total_products: "0",
        total_price: "0",
        total_shipping: "0",
      },
    };
    const filledCart = {
      id: "1",
      has_fresh: false,
      summary: {
        products: [
          {
            id_product: "7",
            name: "Seitan",
            cart_quantity: 1,
            price_wt: "4.90",
            total_wt: "4.90",
          },
        ],
        total_products: "4.90",
        total_price: "4.90",
        total_shipping: "0",
      },
    };
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({
        action: body.action,
        data: body.action === "add_product_cart" ? filledCart : emptyCart,
      });
    });

    const preview = await client.callTool({
      name: "add_to_cart",
      arguments: { productId: "7", quantity: 1 },
    });
    expect(preview.isError).not.toBe(true);
    const token = (
      preview.structuredContent as { data: { confirmationToken: string } }
    ).data.confirmationToken;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);

    const applied = await client.callTool({
      name: "add_to_cart",
      arguments: { productId: "7", quantity: 1, confirmationToken: token },
    });
    expect(applied.isError).not.toBe(true);
    expect(applied.structuredContent).toMatchObject({
      data: {
        status: "applied",
        cart: { items: [{ productId: "7", quantity: 1 }] },
      },
    });
  });
});
