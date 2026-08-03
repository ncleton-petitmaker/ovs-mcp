import type { OvsClient } from "./api.js";
import {
  type CartResult,
  cartQuantity,
  normalizeCart,
  type SearchProduct,
  type SearchResult,
} from "./normalize.js";

export class OvsService {
  constructor(readonly client: OvsClient) {}

  async searchProducts(
    query: string,
    page = 1,
    limit = 20,
  ): Promise<SearchResult> {
    const response = await this.client.get(
      `/recherche?s=${encodeURIComponent(query)}&page=${page}`,
    );
    if (!response.ok)
      throw new Error(`OVS search failed with HTTP ${response.status}.`);
    const products = parseProducts(await response.text()).slice(0, limit);
    return { query, page, limit, total: products.length, products };
  }

  async getCart(): Promise<CartResult> {
    const response = await this.client.get("/panier?action=show");
    if (!response.ok)
      throw new Error(`OVS cart failed with HTTP ${response.status}.`);
    return normalizeCart(parsePrestashop(await response.text()).cart);
  }

  addToCart(productId: string, quantity: number): Promise<CartResult> {
    return this.changeCart("up", productId, quantity, 1);
  }

  removeFromCart(productId: string, quantity: number): Promise<CartResult> {
    return this.changeCart("down", productId, quantity, -1);
  }

  private async changeCart(
    op: "up" | "down",
    productId: string,
    quantity: number,
    direction: 1 | -1,
  ): Promise<CartResult> {
    if (!/^\d+$/.test(productId) || Number(productId) < 1)
      throw new Error("OVS product ID must be a positive integer.");
    let cart = await this.getCart();
    if (direction === -1 && cartQuantity(cart, productId) < quantity)
      throw new Error(
        "Cannot remove more units than the cart currently contains.",
      );
    for (let index = 0; index < quantity; index += 1) {
      const expected = cartQuantity(cart, productId) + direction;
      try {
        const response = await this.client.postForm(
          "/module/add_to_cart/Ajax",
          {
            id_product: productId,
            id_product_attribute: "0",
            id_customization: "0",
            op,
          },
        );
        if (!response.ok)
          throw new Error(
            `OVS cart update failed with HTTP ${response.status}.`,
          );
        const result = (await response.json()) as Record<string, unknown>;
        if (result.success !== true || Number(result.qty) !== expected)
          throw new Error("OVS cart update response is no longer recognized.");
      } catch (error) {
        const reconciled = await this.getCart();
        if (cartQuantity(reconciled, productId) !== expected) throw error;
        cart = reconciled;
        continue;
      }
      cart = await this.getCart();
      if (cartQuantity(cart, productId) !== expected)
        throw new Error(
          `OVS did not apply the expected cart quantity for product ${productId}.`,
        );
    }
    return cart;
  }
}

export function parsePrestashop(html: string): Record<string, unknown> {
  const match = html.match(/\bvar\s+prestashop\s*=\s*(\{.*\});?\s*$/m);
  if (!match?.[1])
    throw new Error("OVS page no longer exposes the expected cart state.");
  try {
    const value = JSON.parse(match[1]) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error("OVS cart state is no longer valid JSON.");
  }
}

export function parseProducts(html: string): SearchProduct[] {
  const blocks =
    html.match(
      /<article\b[^>]*class="[^"]*product-miniature[^"]*"[\s\S]*?<\/article>/gi,
    ) ?? [];
  return blocks.flatMap((block) => {
    const id = attribute(
      block.match(/<article\b[^>]*>/i)?.[0] ?? "",
      "data-id-product",
    );
    const title = block.match(
      /class="[^"]*product-title[^"]*"[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i,
    );
    const titleHtml = title?.[2];
    if (!id || !titleHtml) return [];
    const addCart = block.match(/class="[^"]*add-cart[^"]*"[^>]*>/i)?.[0] ?? "";
    const stock = attribute(addCart, "data-quantity");
    const allowOosp = attribute(addCart, "data-allow-oosp");
    return [
      {
        id,
        name: text(titleHtml),
        manufacturer:
          text(
            block.match(
              /class="[^"]*nom-marque[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
            )?.[1] ?? "",
          ) || null,
        category: null,
        price:
          text(
            block.match(
              /class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
            )?.[1] ?? "",
          ) || null,
        unitPrice: null,
        quantity: stock === null ? null : Number(stock),
        availableForOrder:
          stock === null ? null : Number(stock) > 0 || allowOosp === "1",
        reference: null,
        url: attribute(title?.[1] ?? "", "href"),
      },
    ];
  });
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match?.[1] ?? match?.[2] ?? null;
}
function text(html: string): string {
  return decodeEntities(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (_all, entity: string) => {
      if (entity.startsWith("#x"))
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith("#"))
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return named[entity.toLowerCase()] ?? `&${entity};`;
    },
  );
}
