import { cartQuantity, normalizeCart, normalizeSearch, stripSecrets, } from "./normalize.js";
export class OvsService {
    client;
    constructor(client) {
        this.client = client;
    }
    async searchProducts(query, page = 1, limit = 20) {
        const envelope = await this.client.call("/search", "search", {
            expr: query,
            page,
            nb: limit,
            order_way: "desc",
            order_by: "position",
        });
        return normalizeSearch(envelope.data, query, page, limit);
    }
    async listCategories() {
        return stripSecrets((await this.client.call("/category", "categories", {
            active: true,
            order: true,
        })).data);
    }
    async listManufacturers(page = 1) {
        return stripSecrets((await this.client.call("/manufacturer", "manufacturers", {
            active: true,
            all_group: false,
            html: false,
            random: true,
            nb: 100,
            get_nb_products: false,
            group_by: false,
            random_num: 16,
            with_product: true,
            page,
        })).data);
    }
    async listCurrencies() {
        return stripSecrets((await this.client.call("/parameter", "currencies")).data);
    }
    async getCart() {
        return normalizeCart((await this.client.authenticatedCall("/cart", "cart")).data);
    }
    async addToCart(productId, quantity) {
        return this.changeCart("add_product_cart", productId, quantity, 1);
    }
    async removeFromCart(productId, quantity) {
        return this.changeCart("remove_product_cart", productId, quantity, -1);
    }
    async getCustomer() {
        return stripSecrets((await this.client.authenticatedCall("/customer", "customer")).data);
    }
    async listAddresses() {
        return stripSecrets((await this.client.authenticatedCall("/customer", "addresses")).data);
    }
    async listFavorites() {
        return stripSecrets((await this.client.authenticatedCall("/product", "favoris")).data);
    }
    async changeCart(action, productId, quantity, direction) {
        const numericProductId = Number(productId);
        if (!Number.isSafeInteger(numericProductId) || numericProductId < 1) {
            throw new Error("OVS product ID must be a positive integer.");
        }
        let cart = await this.getCart();
        if (direction === -1 && cartQuantity(cart, productId) < quantity) {
            throw new Error("Cannot remove more units than the cart currently contains.");
        }
        for (let index = 0; index < quantity; index += 1) {
            const before = cartQuantity(cart, productId);
            const expected = before + direction;
            try {
                const envelope = await this.client.authenticatedCall("/cart", action, {
                    id_product: numericProductId,
                    quantity: 1,
                });
                cart = normalizeCart(envelope.data);
            }
            catch (error) {
                const reconciled = await this.getCart();
                if (cartQuantity(reconciled, productId) !== expected)
                    throw error;
                cart = reconciled;
            }
            if (cartQuantity(cart, productId) !== expected) {
                throw new Error(`OVS did not apply the expected cart quantity for product ${productId}.`);
            }
        }
        return cart;
    }
}
//# sourceMappingURL=service.js.map