export declare function stripSecrets(value: unknown): unknown;
export interface SearchProduct {
    id: string;
    name: string;
    manufacturer: string | null;
    category: string | null;
    price: string | number | null;
    unitPrice: string | number | null;
    quantity: string | number | null;
    availableForOrder: boolean | string | number | null;
    reference: string | null;
    url: string | null;
}
export interface SearchResult extends Record<string, unknown> {
    query: string;
    page: number;
    limit: number;
    total: number;
    products: SearchProduct[];
}
export interface CartItem {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: string | number | null;
    total: string | number | null;
    manufacturer: string | null;
    reference: string | null;
}
export interface CartResult extends Record<string, unknown> {
    cartId: string;
    items: CartItem[];
    totalProducts: string | number | null;
    totalPrice: string | number | null;
    totalShipping: string | number | null;
    hasFresh: boolean | string | number | null;
}
export declare function normalizeCart(data: unknown): CartResult;
export declare function cartQuantity(cart: CartResult, productId: string): number;
export declare function normalizeSearch(data: unknown, query: string, page: number, limit: number): SearchResult;
//# sourceMappingURL=normalize.d.ts.map