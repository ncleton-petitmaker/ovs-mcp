const BLOCKED_KEYS = new Set([
    "authorization",
    "token",
    "refresh_token",
    "refreshToken",
    "passwd",
    "password",
    "x-device-uuid",
    "deviceUuid",
    "secure_key",
]);
export function stripSecrets(value) {
    if (Array.isArray(value))
        return value.map(stripSecrets);
    if (!value || typeof value !== "object")
        return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !BLOCKED_KEYS.has(key))
        .map(([key, item]) => [key, stripSecrets(item)]));
}
export function normalizeCart(data) {
    if (!data || typeof data !== "object")
        throw new Error("OVS cart response data is no longer an object.");
    const cart = data;
    const id = scalarString(cart.id);
    const summary = cart.summary;
    if (!id || !summary || typeof summary !== "object") {
        throw new Error("OVS cart response no longer contains id and summary.");
    }
    const record = summary;
    if (!Array.isArray(record.products))
        throw new Error("OVS cart products are no longer an array.");
    return {
        cartId: id,
        items: record.products.map(normalizeCartItem),
        totalProducts: nullableScalar(record.total_products),
        totalPrice: nullableScalar(record.total_price),
        totalShipping: nullableScalar(record.total_shipping),
        hasFresh: nullableAvailability(cart.has_fresh),
    };
}
export function cartQuantity(cart, productId) {
    return cart.items.find((item) => item.productId === productId)?.quantity ?? 0;
}
function normalizeCartItem(value) {
    if (!value || typeof value !== "object")
        throw new Error("OVS cart product is no longer an object.");
    const item = value;
    const productId = scalarString(item.id_product);
    const name = scalarString(item.name);
    const quantity = numeric(item.cart_quantity);
    if (!productId || !name || quantity === null) {
        throw new Error("OVS cart product no longer contains id_product, name, and cart_quantity.");
    }
    return {
        productId,
        name,
        quantity,
        unitPrice: nullableScalar(item.price_wt ?? item.price),
        total: nullableScalar(item.total_wt ?? item.total),
        manufacturer: nullableString(item.manufacturer_name),
        reference: nullableString(item.reference),
    };
}
export function normalizeSearch(data, query, page, limit) {
    if (!data || typeof data !== "object")
        throw new Error("OVS search response data is no longer an object.");
    const record = data;
    const rawProducts = record.result;
    if (rawProducts !== null && !Array.isArray(rawProducts)) {
        throw new Error("OVS search result is no longer an array or null.");
    }
    const total = numeric(record.total);
    if (total === null)
        throw new Error("OVS search total is no longer numeric.");
    const products = (rawProducts ?? []).map((value) => normalizeProduct(value));
    return { query, page, limit, total, products };
}
function normalizeProduct(value) {
    if (!value || typeof value !== "object")
        throw new Error("OVS search product is no longer an object.");
    const item = value;
    const id = scalarString(item.id_product);
    const name = scalarString(item.name);
    if (!id || !name)
        throw new Error("OVS search product no longer contains id_product and name.");
    return {
        id,
        name,
        manufacturer: nullableString(item.manufacturer_name),
        category: nullableString(item.category_name ?? item.category),
        price: nullableScalar(item.price ?? item.product_price),
        unitPrice: nullableScalar(item.unit_price),
        quantity: nullableScalar(item.quantity ?? item.product_quantity),
        availableForOrder: nullableAvailability(item.available_for_order),
        reference: nullableString(item.reference),
        url: nullableString(item.link),
    };
}
function scalarString(value) {
    return typeof value === "string" || typeof value === "number"
        ? String(value)
        : null;
}
function nullableString(value) {
    return scalarString(value);
}
function nullableScalar(value) {
    return typeof value === "string" || typeof value === "number" ? value : null;
}
function nullableAvailability(value) {
    return typeof value === "boolean" ||
        typeof value === "string" ||
        typeof value === "number"
        ? value
        : null;
}
function numeric(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && /^\d+$/.test(value))
        return Number(value);
    return null;
}
//# sourceMappingURL=normalize.js.map