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
  cartId: string;
  items: CartItem[];
  totalProducts: string | number | null;
  totalPrice: string | number | null;
  totalShipping: string | number | null;
  hasFresh: boolean | string | number | null;
}

export function normalizeCart(data: unknown): CartResult {
  if (!data || typeof data !== "object")
    throw new Error("OVS cart response data is no longer an object.");
  const cart = data as Record<string, unknown>;
  const id = scalarString(cart.id);
  const summary = cart.summary;
  if (!id || !summary || typeof summary !== "object") {
    throw new Error("OVS cart response no longer contains id and summary.");
  }
  const record = summary as Record<string, unknown>;
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

export function cartQuantity(cart: CartResult, productId: string): number {
  return cart.items.find((item) => item.productId === productId)?.quantity ?? 0;
}

function normalizeCartItem(value: unknown): CartItem {
  if (!value || typeof value !== "object")
    throw new Error("OVS cart product is no longer an object.");
  const item = value as Record<string, unknown>;
  const productId = scalarString(item.id_product);
  const name = scalarString(item.name);
  const quantity = numeric(item.cart_quantity);
  if (!productId || !name || quantity === null) {
    throw new Error(
      "OVS cart product no longer contains id_product, name, and cart_quantity.",
    );
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

export function normalizeSearch(
  data: unknown,
  query: string,
  page: number,
  limit: number,
): SearchResult {
  if (!data || typeof data !== "object")
    throw new Error("OVS search response data is no longer an object.");
  const record = data as Record<string, unknown>;
  const rawProducts = record.result;
  if (rawProducts !== null && !Array.isArray(rawProducts)) {
    throw new Error("OVS search result is no longer an array or null.");
  }
  const total = numeric(record.total);
  if (total === null) throw new Error("OVS search total is no longer numeric.");
  const products = (rawProducts ?? []).map((value) => normalizeProduct(value));
  return { query, page, limit, total, products };
}

function normalizeProduct(value: unknown): SearchProduct {
  if (!value || typeof value !== "object")
    throw new Error("OVS search product is no longer an object.");
  const item = value as Record<string, unknown>;
  const id = scalarString(item.id_product);
  const name = scalarString(item.name);
  if (!id || !name)
    throw new Error(
      "OVS search product no longer contains id_product and name.",
    );
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

function nullableAvailability(
  value: unknown,
): boolean | string | number | null {
  return typeof value === "boolean" ||
    typeof value === "string" ||
    typeof value === "number"
    ? value
    : null;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}
