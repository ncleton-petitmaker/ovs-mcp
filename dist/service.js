import { cartQuantity, normalizeCart, } from "./normalize.js";
export class OvsService {
    client;
    constructor(client) {
        this.client = client;
    }
    async searchProducts(query, page = 1, limit = 20) {
        const response = await this.client.get(`/recherche?s=${encodeURIComponent(query)}&page=${page}`);
        if (!response.ok)
            throw new Error(`OVS search failed with HTTP ${response.status}.`);
        const products = parseProducts(await response.text()).slice(0, limit);
        return { query, page, limit, total: products.length, products };
    }
    async getCart() {
        const response = await this.client.get("/panier?action=show");
        if (!response.ok)
            throw new Error(`OVS cart failed with HTTP ${response.status}.`);
        return normalizeCart(parsePrestashop(await response.text()).cart);
    }
    addToCart(productId, quantity) {
        return this.changeCart("up", productId, quantity, 1);
    }
    removeFromCart(productId, quantity) {
        return this.changeCart("down", productId, quantity, -1);
    }
    async changeCart(op, productId, quantity, direction) {
        if (!/^\d+$/.test(productId) || Number(productId) < 1)
            throw new Error("OVS product ID must be a positive integer.");
        let cart = await this.getCart();
        if (direction === -1 && cartQuantity(cart, productId) < quantity)
            throw new Error("Cannot remove more units than the cart currently contains.");
        for (let index = 0; index < quantity; index += 1) {
            const expected = cartQuantity(cart, productId) + direction;
            try {
                const response = await this.client.postForm("/module/add_to_cart/Ajax", {
                    id_product: productId,
                    id_product_attribute: "0",
                    id_customization: "0",
                    op,
                });
                if (!response.ok)
                    throw new Error(`OVS cart update failed with HTTP ${response.status}.`);
                const result = (await response.json());
                if (result.success !== true || Number(result.qty) !== expected)
                    throw new Error("OVS cart update response is no longer recognized.");
            }
            catch (error) {
                const reconciled = await this.getCart();
                if (cartQuantity(reconciled, productId) !== expected)
                    throw error;
                cart = reconciled;
                continue;
            }
            cart = await this.getCart();
            if (cartQuantity(cart, productId) !== expected)
                throw new Error(`OVS did not apply the expected cart quantity for product ${productId}.`);
        }
        return cart;
    }
}
export function parsePrestashop(html) {
    const match = html.match(/\bvar\s+prestashop\s*=\s*(\{.*\});?\s*$/m);
    if (!match?.[1])
        throw new Error("OVS page no longer exposes the expected cart state.");
    try {
        const value = JSON.parse(match[1]);
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error();
        return value;
    }
    catch {
        throw new Error("OVS cart state is no longer valid JSON.");
    }
}
export function parseProducts(html) {
    const blocks = html.match(/<article\b[^>]*class="[^"]*product-miniature[^"]*"[\s\S]*?<\/article>/gi) ?? [];
    return blocks.flatMap((block) => {
        const id = attribute(block.match(/<article\b[^>]*>/i)?.[0] ?? "", "data-id-product");
        const title = block.match(/class="[^"]*product-title[^"]*"[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i);
        const titleHtml = title?.[2];
        if (!id || !titleHtml)
            return [];
        const addCart = block.match(/class="[^"]*add-cart[^"]*"[^>]*>/i)?.[0] ?? "";
        const stock = attribute(addCart, "data-quantity");
        const allowOosp = attribute(addCart, "data-allow-oosp");
        return [
            {
                id,
                name: text(titleHtml),
                manufacturer: text(block.match(/class="[^"]*nom-marque[^"]*"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "") || null,
                category: null,
                price: text(block.match(/class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "") || null,
                unitPrice: null,
                quantity: stock === null ? null : Number(stock),
                availableForOrder: stock === null ? null : Number(stock) > 0 || allowOosp === "1",
                reference: null,
                url: attribute(title?.[1] ?? "", "href"),
            },
        ];
    });
}
function attribute(tag, name) {
    const match = tag.match(new RegExp(`${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
    return match?.[1] ?? match?.[2] ?? null;
}
function text(html) {
    return decodeEntities(html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim());
}
function decodeEntities(value) {
    const named = {
        amp: "&",
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
        nbsp: " ",
    };
    return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_all, entity) => {
        if (entity.startsWith("#x"))
            return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        if (entity.startsWith("#"))
            return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        return named[entity.toLowerCase()] ?? `&${entity};`;
    });
}
//# sourceMappingURL=service.js.map