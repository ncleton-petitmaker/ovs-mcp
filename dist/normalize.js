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
    const items = cart.products.map(normalizeCartItem);
    const declaredProductsCount = numeric(cart.products_count);
    const actualProductsCount = items.reduce((total, item) => total + item.quantity, 0);
    if (cart.products_count !== undefined &&
        (declaredProductsCount === null ||
            declaredProductsCount !== actualProductsCount)) {
        throw new Error("OVS cart products_count no longer matches its products.");
    }
    return {
        items,
        totalProducts: totalValue(object(subtotals?.products)),
        totalPrice: totalValue(object(totals?.total)),
        totalShipping: totalValue(object(subtotals?.shipping)),
    };
}
export function cartQuantity(cart, productId, productAttributeId, productCustomizationId) {
    return (cart.items.find((item) => item.productId === productId &&
        item.productAttributeId === productAttributeId &&
        item.productCustomizationId === productCustomizationId)?.quantity ?? 0);
}
function normalizeCartItem(value) {
    const item = object(value);
    if (!item)
        throw new Error("OVS cart product is no longer an object.");
    const productId = scalarString(item.id_product);
    const productAttributeId = nonNegativeIntegerString(item.id_product_attribute);
    const productCustomizationId = Object.hasOwn(item, "id_customization")
        ? nullableCustomizationId(item.id_customization)
        : null;
    const name = scalarString(item.name);
    const quantity = numeric(item.cart_quantity);
    if (!productId ||
        !/^[1-9]\d*$/.test(productId) ||
        productAttributeId === null ||
        productCustomizationId === null ||
        !name ||
        quantity === null)
        throw new Error("OVS cart product no longer contains its exact product, variant, customization, name, and quantity.");
    return {
        productId,
        productAttributeId,
        productCustomizationId,
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
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value !== "string")
        return null;
    return value.trim() ? value : null;
}
function numeric(value) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0)
        return value;
    if (typeof value === "string" && /^\d+$/.test(value))
        return Number(value);
    return null;
}
function nonNegativeIntegerString(value) {
    const normalized = scalarString(value);
    return normalized !== null && /^\d+$/.test(normalized) ? normalized : null;
}
function nullableCustomizationId(value) {
    if (value === null)
        return "0";
    return nonNegativeIntegerString(value);
}
//# sourceMappingURL=normalize.js.map