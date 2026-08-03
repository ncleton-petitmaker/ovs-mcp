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

export function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !BLOCKED_KEYS.has(key))
      .map(([key, item]) => [key, stripSecrets(item)]),
  );
}

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
  items: CartItem[];
  totalProducts: string | number | null;
  totalPrice: string | number | null;
  totalShipping: string | number | null;
}

export function normalizeCart(data: unknown): CartResult {
  if (!data || typeof data !== "object")
    throw new Error("OVS cart data is no longer an object.");
  const cart = data as Record<string, unknown>;
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

export function cartQuantity(cart: CartResult, productId: string): number {
  return cart.items.find((item) => item.productId === productId)?.quantity ?? 0;
}

function normalizeCartItem(value: unknown): CartItem {
  const item = object(value);
  if (!item) throw new Error("OVS cart product is no longer an object.");
  const productId = scalarString(item.id_product);
  const name = scalarString(item.name);
  const quantity = numeric(item.cart_quantity);
  if (!productId || !name || quantity === null)
    throw new Error(
      "OVS cart product no longer contains id_product, name, and cart_quantity.",
    );
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

function totalValue(
  value: Record<string, unknown> | null,
): string | number | null {
  return nullableScalar(value?.value ?? value?.amount);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function scalarString(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}
function nullableString(value: unknown): string | null {
  return scalarString(value);
}
function nullableScalar(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}
function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}
