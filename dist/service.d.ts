import type { OvsClient } from "./api.js";
import { type CartResult, type SearchProduct, type SearchResult } from "./normalize.js";
export declare class OvsService {
    readonly client: OvsClient;
    constructor(client: OvsClient);
    searchProducts(query: string, page?: number, limit?: number): Promise<SearchResult>;
    getCart(): Promise<CartResult>;
    addToCart(productId: string, quantity: number): Promise<CartResult>;
    removeFromCart(productId: string, quantity: number): Promise<CartResult>;
    private changeCart;
}
export declare function parsePrestashop(html: string): Record<string, unknown>;
export declare function parseProducts(html: string): SearchProduct[];
//# sourceMappingURL=service.d.ts.map