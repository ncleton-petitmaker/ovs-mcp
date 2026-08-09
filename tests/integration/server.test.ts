import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OvsClient } from "../../src/api.js";
import { ConfirmationStore } from "../../src/confirmations.js";
import { createServer } from "../../src/server.js";
import { createSessionFile } from "../helpers.js";

const PRODUCT_ID = "7";
const ATTRIBUTE_ID = "3";
const CUSTOMIZATION_ID = "0";

function searchEnvelope(): Record<string, unknown> {
  return {
    rendered_products_top: "<div></div>",
    rendered_products:
      `<article class="product-miniature js-product-miniature" data-id-product="${PRODUCT_ID}" data-id-product-attribute="${ATTRIBUTE_ID}">` +
      `<a class="nom-marque">Synthetic Brand</a>` +
      `<h2 class="product-title"><a href="https://www.officialveganshop.com/synthetic-product">Synthetic Seitan</a></h2>` +
      `<span class="price">4,90 €</span>` +
      `<div class="add-cart" data-id-product="${PRODUCT_ID}" data-id-product-attribute="${ATTRIBUTE_ID}" data-id-customization="${CUSTOMIZATION_ID}" data-quantity="9" data-allow-oosp="0"></div>` +
      `</article>`,
    rendered_products_bottom: "<div></div>",
    result: { categories: [] },
    label: "Synthetic result",
    products: [
      {
        id_product: PRODUCT_ID,
        add_to_cart_url: `/panier?add=1&id_product=${PRODUCT_ID}&id_product_attribute=${ATTRIBUTE_ID}`,
      },
    ],
    sort_orders: [],
    sort_selected: "position",
    pagination: {
      total_items: "1",
      items_shown_from: 1,
      items_shown_to: 1,
      current_page: 1,
      pages_count: 1,
      pages: { 1: { page: 1 } },
      should_be_displayed: false,
    },
    rendered_facets: "",
    rendered_active_filters: "",
    js_enabled: true,
    current_url:
      "https://www.officialveganshop.com/recherche?s=synthetic&from-xhr",
  };
}

function money(quantity: number): string {
  return `${(quantity * 4.9).toFixed(2).replace(".", ",")} €`;
}

function cartRefresh(quantity: number): Record<string, unknown> {
  const cartDetailed = quantity
    ? `<div class="cart-overview js-cart"><ul class="cart-items"><li class="cart-item"><div class="product-line-grid"><div class="product-line-info"><a class="label" href="https://www.officialveganshop.com/synthetic-product" data-id_customization="${CUSTOMIZATION_ID}">Synthetic Seitan</a></div><div class="current-price"><span class="price">4,90 €</span></div><div class="product-line-actions"><input class="js-cart-line-product-quantity" data-product-id="${PRODUCT_ID}" value="${quantity}"><span class="product-price"><strong>${money(quantity)}</strong></span><a class="remove-from-cart" data-id-product="${PRODUCT_ID}" data-id-product-attribute="${ATTRIBUTE_ID}" data-id-customization="${CUSTOMIZATION_ID}"></a></div></div></li></ul></div>`
    : `<div class="cart-overview js-cart"><span class="no-items">Empty</span></div>`;
  return {
    cart_detailed: cartDetailed,
    cart_detailed_totals:
      `<div class="cart-detailed-totals"><div class="cart-summary-line" id="cart-subtotal-products"><span class="value">${money(quantity)}</span></div>` +
      `<div class="cart-summary-line" id="cart-subtotal-shipping"><span class="value">0,00 €</span></div>` +
      `<div class="cart-summary-line cart-total"><span class="value">${money(quantity)}</span></div></div>`,
    cart_summary_items_subtotal: "<div></div>",
    cart_summary_subtotals_container: "<div></div>",
    cart_summary_totals: "<div></div>",
    cart_detailed_actions: "<div></div>",
    cart_voucher: "<div></div>",
  };
}

function cartPreview(quantity: number): Record<string, unknown> {
  // Only selectors observed in the public OVS theme are represented here. The
  // product values are deliberately synthetic; item identity comes from the
  // strict prestashop.cart JSON on the cart page, never from this HTML.
  const preview = quantity
    ? `<div class="shoppingcart-list"><div class="small_cart_product_list"><div class="item-panier-apercu"></div></div><div class="small_cart_sumary"></div></div>`
    : `<div class="shoppingcart-list"><div class="cart_empty">Empty</div></div>`;
  return {
    preview,
    modal: null,
    flying_image: null,
    products_count: quantity,
    total_value: money(quantity),
    maximum_already: 0,
  };
}

async function connectClient(
  server: ReturnType<typeof createServer>,
): Promise<Client> {
  const connected = new Client({ name: "integration-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await connected.connect(clientTransport);
  return connected;
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

  it("returns products from the strict live XHR search envelope", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/mon-compte")
        return new Response("account", { status: 200 });
      expect(parsed.pathname).toBe("/recherche");
      expect(parsed.searchParams.get("from-xhr")).toBe("");
      expect(new Headers(init?.headers).get("x-requested-with")).toBe(
        "XMLHttpRequest",
      );
      return Response.json(searchEnvelope());
    });
    const result = await client.callTool({
      name: "search_products",
      arguments: { query: "seitan" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      query: "seitan",
      total: 1,
      products: [
        {
          id: PRODUCT_ID,
          productAttributeId: ATTRIBUTE_ID,
          productCustomizationId: CUSTOMIZATION_ID,
        },
      ],
    });
  });

  it("fails explicitly when search stops returning JSON", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/mon-compte")
        ? new Response("account", { status: 200 })
        : new Response("<!doctype html>", {
            headers: { "content-type": "text/html" },
          }),
    );
    const result = await client.callTool({
      name: "search_products",
      arguments: { query: "seitan" },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining("no longer JSON"),
      }),
    ]);
  });

  it("rejects invalid search input before OVS", async () => {
    const result = await client.callTool({
      name: "search_products",
      arguments: { query: "x" },
    });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads and cross-checks an empty cart through both observed sources", async () => {
    fetchMock.mockImplementation(async (url, init) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/mon-compte") return new Response("account");
      if (parsed.pathname === "/index.php") {
        expect(parsed.searchParams.get("controller")).toBe("cart");
        expect(parsed.searchParams.get("action")).toBe("refresh");
        return Response.json(cartRefresh(0));
      }
      if (parsed.pathname === "/module/stshoppingcart/ajax") {
        expect(new Headers(init?.headers).get("x-requested-with")).toBe(
          "XMLHttpRequest",
        );
        return Response.json(cartPreview(0));
      }
      return new Response("missing", { status: 404 });
    });
    const result = await client.callTool({ name: "get_cart", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ data: { items: [] } });
  });

  it("previews and confirms an exact-variant add-to-cart operation", async () => {
    let quantity = 0;
    fetchMock.mockImplementation(async (url, init) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/mon-compte") return new Response("account");
      if (parsed.pathname === "/index.php")
        return Response.json(cartRefresh(quantity));
      if (parsed.pathname === "/module/stshoppingcart/ajax")
        return Response.json(cartPreview(quantity));
      if (
        parsed.pathname === "/module/add_to_cart/Ajax" &&
        init?.method === "POST"
      ) {
        const body = new URLSearchParams(String(init.body));
        expect(Object.fromEntries(body)).toEqual({
          id_product: PRODUCT_ID,
          id_product_attribute: ATTRIBUTE_ID,
          id_customization: CUSTOMIZATION_ID,
          op: "up",
        });
        quantity += 1;
        return new Response(JSON.stringify({ retour: true, qty: quantity }));
      }
      return new Response("missing", { status: 404 });
    });
    const preview = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
        quantity: 1,
      },
    });
    const token = (
      preview.structuredContent as { data: { confirmationToken: string } }
    ).data.confirmationToken;
    expect(preview.structuredContent).toMatchObject({
      data: {
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
      },
    });
    const applied = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
        quantity: 1,
        confirmationToken: token,
      },
    });
    expect(applied.isError).not.toBe(true);
    expect(applied.structuredContent).toMatchObject({
      data: {
        status: "applied",
        cart: {
          items: [
            {
              productId: PRODUCT_ID,
              productAttributeId: ATTRIBUTE_ID,
              productCustomizationId: CUSTOMIZATION_ID,
              quantity: 1,
            },
          ],
        },
      },
    });
  });

  it("shares single-use confirmations across two stateless HTTP server instances", async () => {
    let quantity = 0;
    fetchMock.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/mon-compte") return new Response("account");
      if (path === "/index.php") return Response.json(cartRefresh(quantity));
      if (path === "/module/stshoppingcart/ajax")
        return Response.json(cartPreview(quantity));
      if (path === "/module/add_to_cart/Ajax" && init?.method === "POST") {
        quantity += 1;
        return new Response(JSON.stringify({ retour: true, qty: quantity }));
      }
      return new Response("missing", { status: 404 });
    });
    const sessionPath = await createSessionFile();
    const confirmationStore = new ConfirmationStore();
    const previewServer = createServer({
      sessionPath,
      client: new OvsClient({ sessionPath, fetch: fetchMock }),
      confirmationStore,
    });
    const previewClient = await connectClient(previewServer);
    let confirmationServer: ReturnType<typeof createServer> | null = null;
    let confirmationClient: Client | null = null;
    try {
      const preview = await previewClient.callTool({
        name: "add_to_cart",
        arguments: {
          productId: PRODUCT_ID,
          productAttributeId: ATTRIBUTE_ID,
          productCustomizationId: CUSTOMIZATION_ID,
        },
      });
      const confirmationToken = (
        preview.structuredContent as { data: { confirmationToken: string } }
      ).data.confirmationToken;
      await previewClient.close();
      await previewServer.close();

      confirmationServer = createServer({
        sessionPath,
        client: new OvsClient({ sessionPath, fetch: fetchMock }),
        confirmationStore,
      });
      confirmationClient = await connectClient(confirmationServer);
      const applied = await confirmationClient.callTool({
        name: "add_to_cart",
        arguments: {
          productId: PRODUCT_ID,
          productAttributeId: ATTRIBUTE_ID,
          productCustomizationId: CUSTOMIZATION_ID,
          confirmationToken,
        },
      });
      expect(applied.isError).not.toBe(true);
      expect(applied.structuredContent).toMatchObject({
        data: { status: "applied", cart: { items: [{ quantity: 1 }] } },
      });
    } finally {
      if (confirmationClient) await confirmationClient.close();
      if (confirmationServer) await confirmationServer.close();
    }
  });

  it("wires the process-wide HTTP confirmation store into every request server", async () => {
    const source = await readFile(
      new URL("../../src/index.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      "const httpConfirmationStore = new ConfirmationStore()",
    );
    expect(source).toContain("confirmationStore: httpConfirmationStore");
    const cliSource = await readFile(
      new URL("../../src/cli.ts", import.meta.url),
      "utf8",
    );
    expect(cliSource).toContain("cartMutationFailurePayload(error)");
    expect(cliSource).toContain("JSON.stringify(mutationFailure, null, 2)");
  });

  it("requires exact variant identifiers before a cart preview", async () => {
    const result = await client.callTool({
      name: "add_to_cart",
      arguments: { productId: PRODUCT_ID, quantity: 1 },
    });
    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revalidates the preview fingerprint under the mutation lock before any POST", async () => {
    let quantity = 0;
    let mutationPosts = 0;
    fetchMock.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/mon-compte") return new Response("account");
      if (path === "/index.php") return Response.json(cartRefresh(quantity));
      if (path === "/module/stshoppingcart/ajax")
        return Response.json(cartPreview(quantity));
      if (path === "/module/add_to_cart/Ajax" && init?.method === "POST") {
        mutationPosts += 1;
        return new Response(
          JSON.stringify({ retour: true, qty: quantity + 1 }),
        );
      }
      return new Response("missing", { status: 404 });
    });
    const preview = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
      },
    });
    const confirmationToken = (
      preview.structuredContent as { data: { confirmationToken: string } }
    ).data.confirmationToken;
    quantity = 1;
    const result = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
        confirmationToken,
      },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining("Cart changed"),
      }),
    ]);
    expect(mutationPosts).toBe(0);
  });

  it("reconciles an ambiguous mutation result against the live cart", async () => {
    let quantity = 0;
    fetchMock.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/mon-compte") return new Response("account");
      if (path === "/index.php") return Response.json(cartRefresh(quantity));
      if (path === "/module/stshoppingcart/ajax")
        return Response.json(cartPreview(quantity));
      if (path === "/module/add_to_cart/Ajax" && init?.method === "POST") {
        quantity += 1;
        throw new TypeError("synthetic connection reset after write");
      }
      return new Response("missing", { status: 404 });
    });
    const preview = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
      },
    });
    const confirmationToken = (
      preview.structuredContent as { data: { confirmationToken: string } }
    ).data.confirmationToken;
    const result = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
        confirmationToken,
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: { status: "applied", cart: { items: [{ quantity: 1 }] } },
    });
  });

  it("returns a structured ambiguous result when the post-write cart cannot be reread", async () => {
    let quantity = 0;
    let mutationPosts = 0;
    let failCartRead = false;
    fetchMock.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/mon-compte") return new Response("account");
      if (path === "/index.php") {
        if (failCartRead)
          throw new TypeError("synthetic cart reread unavailable");
        return Response.json(cartRefresh(quantity));
      }
      if (path === "/module/stshoppingcart/ajax")
        return Response.json(cartPreview(quantity));
      if (path === "/module/add_to_cart/Ajax" && init?.method === "POST") {
        mutationPosts += 1;
        quantity += 1;
        failCartRead = true;
        return new Response(JSON.stringify({ retour: true, qty: quantity }));
      }
      return new Response("missing", { status: 404 });
    });
    const preview = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
      },
    });
    const confirmationToken = (
      preview.structuredContent as { data: { confirmationToken: string } }
    ).data.confirmationToken;
    const result = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
        confirmationToken,
      },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      code: "OVS_CART_MUTATION_AMBIGUOUS",
      cart_may_be_partially_modified: true,
      applied_units: null,
      requested_units: 1,
      target: {
        operation: "add",
        product_id: PRODUCT_ID,
        product_attribute_id: ATTRIBUTE_ID,
        product_customization_id: CUSTOMIZATION_ID,
      },
    });
    expect(mutationPosts).toBe(1);
  });

  it("reports only proven units when a multi-unit mutation stops after the first unit", async () => {
    let quantity = 0;
    let mutationPosts = 0;
    fetchMock.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/mon-compte") return new Response("account");
      if (path === "/index.php") return Response.json(cartRefresh(quantity));
      if (path === "/module/stshoppingcart/ajax")
        return Response.json(cartPreview(quantity));
      if (path === "/module/add_to_cart/Ajax" && init?.method === "POST") {
        mutationPosts += 1;
        if (mutationPosts === 1) {
          quantity += 1;
          return new Response(JSON.stringify({ retour: true, qty: quantity }));
        }
        return new Response(JSON.stringify({ retour: false, qty: quantity }));
      }
      return new Response("missing", { status: 404 });
    });
    const preview = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
        quantity: 2,
      },
    });
    const confirmationToken = (
      preview.structuredContent as { data: { confirmationToken: string } }
    ).data.confirmationToken;
    const result = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
        quantity: 2,
        confirmationToken,
      },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "OVS_CART_MUTATION_PARTIAL",
      cart_may_be_partially_modified: true,
      applied_units: 1,
      requested_units: 2,
      target: {
        operation: "add",
        product_id: PRODUCT_ID,
        product_attribute_id: ATTRIBUTE_ID,
        product_customization_id: CUSTOMIZATION_ID,
      },
    });
    expect(mutationPosts).toBe(2);
    expect(quantity).toBe(1);
  });

  it("does not accept the obsolete success response when the cart did not change", async () => {
    const quantity = 0;
    fetchMock.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/mon-compte") return new Response("account");
      if (path === "/index.php") return Response.json(cartRefresh(quantity));
      if (path === "/module/stshoppingcart/ajax")
        return Response.json(cartPreview(quantity));
      if (path === "/module/add_to_cart/Ajax" && init?.method === "POST")
        return new Response(JSON.stringify({ success: true, qty: 1 }));
      return new Response("missing", { status: 404 });
    });
    const preview = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
      },
    });
    const confirmationToken = (
      preview.structuredContent as { data: { confirmationToken: string } }
    ).data.confirmationToken;
    const result = await client.callTool({
      name: "add_to_cart",
      arguments: {
        productId: PRODUCT_ID,
        productAttributeId: ATTRIBUTE_ID,
        productCustomizationId: CUSTOMIZATION_ID,
        confirmationToken,
      },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining("rejected") }),
    ]);
    expect(quantity).toBe(0);
  });
});
