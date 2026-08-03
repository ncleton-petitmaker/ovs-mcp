const BLOCKED_KEYS = new Set([
    "authorization",
    "token",
    "password",
    "passwd",
    "cookie",
    "cookies",
    "secure_key",
    "customer",
    "addresses",
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
        throw new Error("OVS cart data is no longer an object.");
    const cart = data;
    if (!Array.isArray(cart.products))
        throw new Error("OVS cart no longer contains products.");
    const totals = object(cart.totals);
    const subtotals = object(cart.subtotals);
    return {
        items: cart.products.map(normalizeCartItem),
        totalProducts: totalValue(object(subtotals?.products)),
        totalPrice: totalValue(object(totals?.total)),
        totalShipping: totalValue(object(subtotals?.shipping)),
    };
}
export function cartQuantity(cart, productId) {
    return cart.items.find((item) => item.productId === productId)?.quantity ?? 0;
}
function normalizeCartItem(value) {
    const item = object(value);
    if (!item)
        throw new Error("OVS cart product is no longer an object.");
    const productId = scalarString(item.id_product);
    const name = scalarString(item.name);
    const quantity = numeric(item.cart_quantity);
    if (!productId || !name || quantity === null)
        throw new Error("OVS cart product no longer contains id_product, name, and cart_quantity.");
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
function totalValue(value) {
    return nullableScalar(value?.value ?? value?.amount);
}
function object(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
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
function numeric(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && /^\d+$/.test(value))
        return Number(value);
    return null;
}
//# sourceMappingURL=normalize.js.map