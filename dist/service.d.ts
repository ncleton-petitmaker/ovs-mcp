import type { OvsClient } from "./api.js";
import { MutationFileLock } from "./mutation-lock.js";
import { type CartResult, type SearchProduct, type SearchResult } from "./normalize.js";
interface SearchEnvelope {
    renderedProducts: string;
    products: unknown[];
    total: number;
    currentPage: number;
}
interface CartPreviewEnvelope {
    preview: string;
    productsCount: number;
    totalValue: string;
}
interface CartRefreshEnvelope {
    cartDetailed: string;
    cartDetailedTotals: string;
}
export declare class OvsService {
    #private;
    readonly client: OvsClient;
    constructor(client: OvsClient, mutationLock?: MutationFileLock);
    searchProducts(query: string, page?: number, limit?: number): Promise<SearchResult>;
    getCart(): Promise<CartResult>;
    addToCart(productId: string, productAttributeId: string, productCustomizationId: string, quantity: number, expectedCartFingerprint: string): Promise<CartResult>;
    removeFromCart(productId: string, productAttributeId: string, productCustomizationId: string, quantity: number, expectedCartFingerprint: string): Promise<CartResult>;
    private changeCart;
}
export declare function parseSearchEnvelope(value: unknown): SearchEnvelope;
export declare function parseCartRefreshEnvelope(value: unknown): CartRefreshEnvelope;
export declare function parseDetailedCart(envelope: CartRefreshEnvelope): CartResult;
export declare function parseCartPreviewEnvelope(value: unknown): CartPreviewEnvelope;
export declare function validateCartPreview(preview: CartPreviewEnvelope, cart: CartResult): void;
export declare function parseCartMutationResponse(textValue: string, expectedQuantity: number): void;
export declare function parsePrestashop(html: string): Record<string, unknown>;
export declare function parseProducts(html: string): SearchProduct[];
export {};
//# sourceMappingURL=service.d.ts.map