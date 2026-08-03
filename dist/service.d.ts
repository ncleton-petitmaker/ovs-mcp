import type { OvsClient } from "./api.js";
import { type CartResult } from "./normalize.js";
export declare class OvsService {
    readonly client: OvsClient;
    constructor(client: OvsClient);
    searchProducts(query: string, page?: number, limit?: number): Promise<import("./normalize.js").SearchResult>;
    listCategories(): Promise<unknown>;
    listManufacturers(page?: number): Promise<unknown>;
    listCurrencies(): Promise<unknown>;
    getCart(): Promise<CartResult>;
    addToCart(productId: string, quantity: number): Promise<CartResult>;
    removeFromCart(productId: string, quantity: number): Promise<CartResult>;
    getCustomer(): Promise<unknown>;
    listAddresses(): Promise<unknown>;
    listFavorites(): Promise<unknown>;
    private changeCart;
}
//# sourceMappingURL=service.d.ts.map