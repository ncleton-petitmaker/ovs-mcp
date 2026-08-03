import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OvsClient } from "../../src/api.js";
import { createServer } from "../../src/server.js";
import { createSessionFile } from "../helpers.js";

const searchHtml = `<article class="product-miniature" data-id-product="7"><a class="nom-marque">Example</a><h2 class="product-title"><a href="https://www.officialveganshop.com/p/7">Seitan</a></h2><span class="price">4,90 €</span><div class="add-cart" data-quantity="9" data-allow-oosp="0"></div></article>`;
function cartHtml(quantity: number): string {
  const products = quantity
    ? [
        {
          id_product: "7",
          name: "Seitan",
          cart_quantity: quantity,
          price_wt: "4.90",
          total_wt: String(4.9 * quantity),
        },
      ]
    : [];
  return `<script>var prestashop = ${JSON.stringify({ cart: { id: "1", products, subtotals: { products: { value: String(4.9 * quantity) }, shipping: { value: "0" } }, totals: { total: { value: String(4.9 * quantity) } } } })};\n</script>`;
}

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

  it("registers the portable connection, search, and cart tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      "connect_ovs",
      "search_products",
      "get_cart",
      "add_to_cart",
      "remove_from_cart",
    ]);
    expect(
      tools.find((tool) => tool.name === "search_products")?.annotations,
    ).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(
      tools.find((tool) => tool.name === "add_to_cart")?.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("returns structured live search content", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/mon-compte")
        ? new Response("account", { status: 200 })
        : new Response(searchHtml),
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

  it("rejects invalid search input before OVS", async () => {
    const result = await client.callTool({
      name: "search_products",
      arguments: { query: "x" },
    });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews and confirms an add-to-cart operation", async () => {
    let quantity = 0;
    fetchMock.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/mon-compte")
        return new Response("account", { status: 200 });
      if (path === "/panier") return new Response(cartHtml(quantity));
      if (path === "/module/add_to_cart/Ajax" && init?.method === "POST") {
        quantity += 1;
        return Response.json({ success: true, qty: String(quantity) });
      }
      return new Response("missing", { status: 404 });
    });
    const preview = await client.callTool({
      name: "add_to_cart",
      arguments: { productId: "7", quantity: 1 },
    });
    const token = (
      preview.structuredContent as { data: { confirmationToken: string } }
    ).data.confirmationToken;
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
