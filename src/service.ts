import type { OvsClient } from "./api.js";
import { cartFingerprint } from "./confirmations.js";
import { OvsCartMutationError } from "./errors.js";
import { MutationFileLock } from "./mutation-lock.js";
import {
  type CartResult,
  cartQuantity,
  type SearchProduct,
  type SearchResult,
} from "./normalize.js";
import { OVS_ORIGIN } from "./session.js";

const JSON_REQUEST_HEADERS = {
  accept: "application/json",
  "x-requested-with": "XMLHttpRequest",
} as const;

const SEARCH_ENVELOPE_KEYS = [
  "current_url",
  "js_enabled",
  "label",
  "pagination",
  "products",
  "rendered_active_filters",
  "rendered_facets",
  "rendered_products",
  "rendered_products_bottom",
  "rendered_products_top",
  "result",
  "sort_orders",
  "sort_selected",
] as const;

const SEARCH_PAGINATION_KEYS = [
  "current_page",
  "items_shown_from",
  "items_shown_to",
  "pages",
  "pages_count",
  "should_be_displayed",
  "total_items",
] as const;

const CART_PREVIEW_KEYS = [
  "flying_image",
  "maximum_already",
  "modal",
  "preview",
  "products_count",
  "total_value",
] as const;

const CART_REFRESH_KEYS = [
  "cart_detailed",
  "cart_detailed_actions",
  "cart_detailed_totals",
  "cart_summary_items_subtotal",
  "cart_summary_subtotals_container",
  "cart_summary_totals",
  "cart_voucher",
] as const;

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

export class OvsService {
  readonly #mutationLock: MutationFileLock;

  constructor(
    readonly client: OvsClient,
    mutationLock = new MutationFileLock(client.sessionPath),
  ) {
    this.#mutationLock = mutationLock;
  }

  async searchProducts(
    query: string,
    page = 1,
    limit = 20,
  ): Promise<SearchResult> {
    const response = await this.client.get(
      `/recherche?s=${encodeURIComponent(query)}&page=${page}&from-xhr`,
      JSON_REQUEST_HEADERS,
    );
    if (!response.ok)
      throw new Error(`OVS search failed with HTTP ${response.status}.`);
    const envelope = parseSearchEnvelope(
      await strictJsonResponse(response, "search"),
    );
    if (envelope.currentPage !== page)
      throw new Error("OVS search returned a different page than requested.");
    const products = validateSearchProducts(
      parseProducts(envelope.renderedProducts),
      envelope.products,
    ).slice(0, limit);
    return { query, page, limit, total: envelope.total, products };
  }

  async getCart(): Promise<CartResult> {
    const cartResponse = await this.client.get(
      "/index.php?controller=cart&ajax=1&action=refresh",
      JSON_REQUEST_HEADERS,
    );
    if (!cartResponse.ok)
      throw new Error(
        `OVS cart refresh failed with HTTP ${cartResponse.status}.`,
      );
    const cart = parseDetailedCart(
      parseCartRefreshEnvelope(
        await strictJsonResponse(cartResponse, "cart refresh"),
      ),
    );

    const previewResponse = await this.client.get(
      "/module/stshoppingcart/ajax",
      JSON_REQUEST_HEADERS,
    );
    if (!previewResponse.ok)
      throw new Error(
        `OVS cart preview failed with HTTP ${previewResponse.status}.`,
      );
    const preview = parseCartPreviewEnvelope(
      await strictJsonResponse(previewResponse, "cart preview"),
    );
    validateCartPreview(preview, cart);
    return cart;
  }

  addToCart(
    productId: string,
    productAttributeId: string,
    productCustomizationId: string,
    quantity: number,
    expectedCartFingerprint: string,
  ): Promise<CartResult> {
    return this.changeCart(
      "up",
      productId,
      productAttributeId,
      productCustomizationId,
      quantity,
      1,
      expectedCartFingerprint,
    );
  }

  removeFromCart(
    productId: string,
    productAttributeId: string,
    productCustomizationId: string,
    quantity: number,
    expectedCartFingerprint: string,
  ): Promise<CartResult> {
    return this.changeCart(
      "down",
      productId,
      productAttributeId,
      productCustomizationId,
      quantity,
      -1,
      expectedCartFingerprint,
    );
  }

  private async changeCart(
    op: "up" | "down",
    productId: string,
    productAttributeId: string,
    productCustomizationId: string,
    quantity: number,
    direction: 1 | -1,
    expectedCartFingerprint: string,
  ): Promise<CartResult> {
    if (!/^[1-9]\d*$/.test(productId))
      throw new Error("OVS product ID must be a positive integer.");
    for (const [label, value] of [
      ["product attribute", productAttributeId],
      ["product customization", productCustomizationId],
    ] as const) {
      if (!/^\d+$/.test(value))
        throw new Error(`OVS ${label} ID must be a non-negative integer.`);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50)
      throw new Error("OVS cart quantity must be an integer from 1 to 50.");
    if (!/^[a-f0-9]{64}$/.test(expectedCartFingerprint))
      throw new Error(
        "OVS cart mutation requires its exact preview fingerprint.",
      );

    const target = {
      operation: op === "up" ? ("add" as const) : ("remove" as const),
      product_id: productId,
      product_attribute_id: productAttributeId,
      product_customization_id: productCustomizationId,
    };

    return this.#mutationLock.run(async () => {
      let cart = await this.getCart();
      if (cartFingerprint(cart) !== expectedCartFingerprint) {
        throw new Error(
          "Cart changed after preview. Request a new confirmation.",
        );
      }
      if (
        direction === -1 &&
        cartQuantity(
          cart,
          productId,
          productAttributeId,
          productCustomizationId,
        ) < quantity
      ) {
        throw new Error(
          "Cannot remove more units than the cart currently contains.",
        );
      }
      for (let index = 0; index < quantity; index += 1) {
        const beforeQuantity = cartQuantity(
          cart,
          productId,
          productAttributeId,
          productCustomizationId,
        );
        const expected = beforeQuantity + direction;
        try {
          const response = await this.client.postForm(
            "/module/add_to_cart/Ajax",
            {
              id_product: productId,
              id_product_attribute: productAttributeId,
              id_customization: productCustomizationId,
              op,
            },
          );
          if (!response.ok)
            throw new Error(
              `OVS cart update failed with HTTP ${response.status}.`,
            );
          parseCartMutationResponse(await response.text(), expected);
        } catch (writeError) {
          let reconciled: CartResult;
          try {
            reconciled = await this.getCart();
          } catch (reconciliationError) {
            throw new OvsCartMutationError(
              target,
              quantity,
              null,
              `Write result: ${errorMessage(writeError)} Reconciliation: ${errorMessage(reconciliationError)}`,
            );
          }
          const reconciledQuantity = cartQuantity(
            reconciled,
            productId,
            productAttributeId,
            productCustomizationId,
          );
          if (reconciledQuantity !== expected) {
            throw new OvsCartMutationError(
              target,
              quantity,
              reconciledQuantity === beforeQuantity ? index : null,
              writeError,
            );
          }
          // The write response was ambiguous, but the independent cart read
          // proved the exact expected delta. Continue without retrying POST.
          cart = reconciled;
          continue;
        }
        let verified: CartResult;
        try {
          verified = await this.getCart();
        } catch (reconciliationError) {
          throw new OvsCartMutationError(
            target,
            quantity,
            null,
            reconciliationError,
          );
        }
        const verifiedQuantity = cartQuantity(
          verified,
          productId,
          productAttributeId,
          productCustomizationId,
        );
        if (verifiedQuantity !== expected) {
          throw new OvsCartMutationError(
            target,
            quantity,
            verifiedQuantity === beforeQuantity ? index : null,
            `OVS returned a successful write response but the live cart quantity is ${verifiedQuantity}, expected ${expected}.`,
          );
        }
        cart = verified;
      }
      return cart;
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseSearchEnvelope(value: unknown): SearchEnvelope {
  const envelope = plainObject(value);
  if (!envelope) throw new Error("OVS search response is no longer an object.");
  assertExactKeys(envelope, SEARCH_ENVELOPE_KEYS, "search response");
  for (const key of [
    "rendered_products_top",
    "rendered_products",
    "rendered_products_bottom",
    "label",
    "sort_selected",
    "rendered_facets",
    "rendered_active_filters",
    "current_url",
  ] as const) {
    if (typeof envelope[key] !== "string")
      throw new Error(`OVS search response ${key} is no longer a string.`);
  }
  if (
    !Array.isArray(envelope.products) ||
    !Array.isArray(envelope.sort_orders) ||
    typeof envelope.js_enabled !== "boolean"
  ) {
    throw new Error(
      "OVS search response collections are no longer recognized.",
    );
  }
  const result = plainObject(envelope.result);
  if (!result || !Array.isArray(result.categories))
    throw new Error("OVS search response categories are no longer recognized.");
  const pagination = plainObject(envelope.pagination);
  if (!pagination)
    throw new Error("OVS search response pagination is no longer an object.");
  assertExactKeys(pagination, SEARCH_PAGINATION_KEYS, "search pagination");
  if (
    typeof pagination.total_items !== "string" ||
    !/^\d+$/.test(pagination.total_items) ||
    !nonNegativeInteger(pagination.items_shown_from) ||
    !digitInteger(pagination.items_shown_to) ||
    !positiveInteger(pagination.current_page) ||
    !nonNegativeInteger(pagination.pages_count) ||
    (!plainObject(pagination.pages) && !Array.isArray(pagination.pages)) ||
    typeof pagination.should_be_displayed !== "boolean"
  ) {
    throw new Error("OVS search pagination fields are no longer recognized.");
  }
  return {
    renderedProducts: String(envelope.rendered_products),
    products: envelope.products,
    total: Number(pagination.total_items),
    currentPage: pagination.current_page,
  };
}

export function parseCartRefreshEnvelope(value: unknown): CartRefreshEnvelope {
  const envelope = plainObject(value);
  if (!envelope)
    throw new Error("OVS cart refresh response is no longer an object.");
  assertExactKeys(envelope, CART_REFRESH_KEYS, "cart refresh response");
  for (const key of CART_REFRESH_KEYS) {
    if (typeof envelope[key] !== "string")
      throw new Error(`OVS cart refresh ${key} is no longer a string.`);
  }
  return {
    cartDetailed: String(envelope.cart_detailed),
    cartDetailedTotals: String(envelope.cart_detailed_totals),
  };
}

export function parseDetailedCart(envelope: CartRefreshEnvelope): CartResult {
  if (!hasClass(envelope.cartDetailed, "cart-overview"))
    throw new Error("OVS cart detail no longer contains cart-overview.");
  const empty = hasClass(envelope.cartDetailed, "no-items");
  const itemBlocks = elementsWithClass(
    envelope.cartDetailed,
    "li",
    "cart-item",
  );
  if ((empty && itemBlocks.length !== 0) || (!empty && itemBlocks.length === 0))
    throw new Error("OVS cart detail empty state is no longer recognized.");
  const items = itemBlocks.map((block) => parseDetailedCartItem(block));
  const totalProducts = cartSummaryValue(
    envelope.cartDetailedTotals,
    "cart-subtotal-products",
  );
  const totalPrice = cartTotalValue(envelope.cartDetailedTotals);
  const totalShipping = hasId(
    envelope.cartDetailedTotals,
    "cart-subtotal-shipping",
  )
    ? cartSummaryValue(envelope.cartDetailedTotals, "cart-subtotal-shipping")
    : null;
  return { items, totalProducts, totalPrice, totalShipping };
}

export function parseCartPreviewEnvelope(value: unknown): CartPreviewEnvelope {
  const envelope = plainObject(value);
  if (!envelope)
    throw new Error("OVS cart preview response is no longer an object.");
  assertExactKeys(envelope, CART_PREVIEW_KEYS, "cart preview response");
  if (
    typeof envelope.preview !== "string" ||
    typeof envelope.total_value !== "string" ||
    !envelope.total_value.trim() ||
    !nonNegativeInteger(envelope.products_count) ||
    !nonNegativeInteger(envelope.maximum_already) ||
    !nullableString(envelope.modal) ||
    !nullableString(envelope.flying_image)
  ) {
    throw new Error(
      "OVS cart preview response fields are no longer recognized.",
    );
  }
  return {
    preview: envelope.preview,
    productsCount: envelope.products_count,
    totalValue: envelope.total_value,
  };
}

export function validateCartPreview(
  preview: CartPreviewEnvelope,
  cart: CartResult,
): void {
  if (!hasClass(preview.preview, "shoppingcart-list"))
    throw new Error("OVS cart preview no longer contains shoppingcart-list.");
  const quantity = cart.items.reduce((total, item) => total + item.quantity, 0);
  if (preview.productsCount !== quantity)
    throw new Error("OVS cart preview count no longer matches the cart page.");
  if (quantity === 0) {
    if (!hasClass(preview.preview, "cart_empty"))
      throw new Error("OVS empty cart preview is no longer recognized.");
  } else if (
    hasClass(preview.preview, "cart_empty") ||
    !hasClass(preview.preview, "small_cart_product_list") ||
    !hasClass(preview.preview, "item-panier-apercu")
  ) {
    throw new Error("OVS non-empty cart preview is no longer recognized.");
  }
  const previewTotal = moneyNumber(preview.totalValue);
  const cartTotal = moneyNumber(cart.totalPrice);
  if (
    previewTotal === null ||
    cartTotal === null ||
    Math.abs(previewTotal - cartTotal) > 0.005
  ) {
    throw new Error("OVS cart preview total no longer matches the cart page.");
  }
}

export function parseCartMutationResponse(
  textValue: string,
  expectedQuantity: number,
): void {
  const value = parseJsonObject(textValue, "cart mutation response");
  const accepted =
    value.retour === true ||
    (typeof value.retour === "number" && value.retour !== 0) ||
    (typeof value.retour === "string" && value.retour.length > 0);
  if (!accepted) throw new Error("OVS rejected the cart update.");
  if (!nonNegativeInteger(value.qty) || value.qty !== expectedQuantity)
    throw new Error("OVS cart mutation quantity is no longer recognized.");
}

export function parsePrestashop(html: string): Record<string, unknown> {
  const match = html.match(/\bvar\s+prestashop\s*=\s*(\{.*\});?\s*$/m);
  if (!match?.[1])
    throw new Error("OVS page no longer exposes the expected cart state.");
  return parseJsonObject(match[1], "cart state");
}

function parseDetailedCartItem(block: string): CartResult["items"][number] {
  const remove = openingTagWithClass(block, "a", "remove-from-cart");
  const quantityInput = openingTagWithClass(
    block,
    "input",
    "js-cart-line-product-quantity",
  );
  const label = elementWithClass(block, "a", "label");
  const unitPriceMatch = block.match(
    /class="[^"]*\bcurrent-price\b[^"]*"[\s\S]*?<span\b[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  );
  const totalMatch = block.match(
    /class="[^"]*\bproduct-line-actions\b[^"]*"[\s\S]*?<span\b[^>]*class="[^"]*\bproduct-price\b[^"]*"[^>]*>[\s\S]*?<strong\b[^>]*>([\s\S]*?)<\/strong>/i,
  );
  const productId = attribute(remove ?? "", "data-id-product");
  const productAttributeId = attribute(
    remove ?? "",
    "data-id-product-attribute",
  );
  const productCustomizationId = attribute(
    remove ?? "",
    "data-id-customization",
  );
  const quantityProductId = attribute(quantityInput ?? "", "data-product-id");
  const labelCustomizationId = attribute(
    label?.opening ?? "",
    "data-id_customization",
  );
  const quantityValue = attribute(quantityInput ?? "", "value");
  const name = text(label?.inner ?? "");
  const normalizedUnitPrice = text(unitPriceMatch?.[1] ?? "");
  const normalizedTotal = text(totalMatch?.[1] ?? "");
  if (
    !productId ||
    !/^[1-9]\d*$/.test(productId) ||
    productAttributeId === null ||
    !/^\d+$/.test(productAttributeId) ||
    productCustomizationId === null ||
    !/^\d+$/.test(productCustomizationId) ||
    quantityProductId !== productId ||
    labelCustomizationId !== productCustomizationId ||
    quantityValue === null ||
    !/^[1-9]\d*$/.test(quantityValue) ||
    !name ||
    !normalizedUnitPrice ||
    !normalizedTotal
  ) {
    throw new Error("OVS detailed cart product line is no longer recognized.");
  }
  return {
    productId,
    productAttributeId,
    productCustomizationId,
    name,
    quantity: Number(quantityValue),
    unitPrice: normalizedUnitPrice,
    total: normalizedTotal,
    manufacturer: null,
    reference: null,
  };
}

function cartSummaryValue(html: string, id: string): string {
  const escaped = escapeRegExp(id);
  const match = html.match(
    new RegExp(
      `<div\\b(?=[^>]*\\bid=(?:"${escaped}"|'${escaped}'))[^>]*>[\\s\\S]*?<span\\b[^>]*class=(?:"[^"]*\\bvalue\\b[^"]*"|'[^']*\\bvalue\\b[^']*')[^>]*>([\\s\\S]*?)<\\/span>`,
      "i",
    ),
  );
  const value = text(match?.[1] ?? "");
  if (!value)
    throw new Error(`OVS cart summary ${id} is no longer recognized.`);
  return value;
}

function cartTotalValue(html: string): string {
  const match = html.match(
    /class="[^"]*\bcart-total\b[^"]*"[\s\S]*?<span\b[^>]*class="[^"]*\bvalue\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  );
  const normalized = text(match?.[1] ?? "");
  if (!normalized) throw new Error("OVS cart total is no longer recognized.");
  return normalized;
}

export function parseProducts(html: string): SearchProduct[] {
  const blocks =
    html.match(
      /<article\b[^>]*class="[^"]*product-miniature[^"]*"[\s\S]*?<\/article>/gi,
    ) ?? [];
  return blocks.map((block) => {
    const opening = block.match(/<article\b[^>]*>/i)?.[0] ?? "";
    const id = attribute(opening, "data-id-product");
    const productAttributeId = attribute(opening, "data-id-product-attribute");
    const title = block.match(
      /class="[^"]*product-title[^"]*"[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i,
    );
    const name = text(title?.[2] ?? "");
    const url = attribute(title?.[1] ?? "", "href");
    const price = text(
      block.match(/class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1] ??
        "",
    );
    if (
      !id ||
      !/^[1-9]\d*$/.test(id) ||
      productAttributeId === null ||
      !/^\d+$/.test(productAttributeId) ||
      !name ||
      !url ||
      !isOvsUrl(url) ||
      !price
    ) {
      throw new Error("OVS rendered search product is no longer recognized.");
    }
    const addCart =
      block.match(/class="[^"]*add-cart[^"]*"[^>]*>/i)?.[0] ?? null;
    let quantity: number | null = null;
    let availableForOrder = false;
    let productCustomizationId: string | null = null;
    if (addCart) {
      const stock = attribute(addCart, "data-quantity");
      const allowOosp = attribute(addCart, "data-allow-oosp");
      productCustomizationId = attribute(addCart, "data-id-customization");
      const disabledWithoutCartData =
        hasClass(addCart, "addtocart-disabled") &&
        stock === null &&
        allowOosp === null &&
        productCustomizationId === null;
      if (disabledWithoutCartData) {
        quantity = 0;
      } else if (
        stock === null ||
        !/^\d+$/.test(stock) ||
        !/^[01]$/.test(allowOosp ?? "") ||
        productCustomizationId === null ||
        !/^\d+$/.test(productCustomizationId)
      ) {
        throw new Error(
          "OVS rendered product availability is no longer recognized.",
        );
      } else {
        quantity = Number(stock);
        availableForOrder =
          !hasClass(addCart, "addtocart-disabled") &&
          (quantity > 0 || allowOosp === "1");
      }
    }
    return {
      id,
      productAttributeId,
      productCustomizationId,
      name,
      manufacturer:
        text(
          block.match(
            /class="[^"]*nom-marque[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
          )?.[1] ?? "",
        ) || null,
      category: null,
      price,
      unitPrice: null,
      quantity,
      availableForOrder,
      reference: null,
      url,
    };
  });
}

function validateSearchProducts(
  rendered: SearchProduct[],
  rawProducts: unknown[],
): SearchProduct[] {
  const records = new Map<string, { addToCartUrl: string | null }>();
  for (const value of rawProducts) {
    const product = plainObject(value);
    const id = stringScalar(product?.id_product);
    const addToCartUrl = product?.add_to_cart_url;
    if (
      !product ||
      !id ||
      !/^[1-9]\d*$/.test(id) ||
      (addToCartUrl !== null && typeof addToCartUrl !== "string") ||
      records.has(id)
    ) {
      throw new Error("OVS search product JSON is no longer recognized.");
    }
    records.set(id, { addToCartUrl });
  }
  if (records.size !== rendered.length)
    throw new Error(
      "OVS rendered search products no longer match its JSON list.",
    );
  return rendered.map((product) => {
    const record = records.get(product.id);
    if (!record)
      throw new Error(
        "OVS rendered search product ID is missing from its JSON list.",
      );
    if (record.addToCartUrl === null) {
      return { ...product, availableForOrder: false };
    }
    let addUrl: URL;
    try {
      addUrl = new URL(record.addToCartUrl, OVS_ORIGIN);
    } catch {
      throw new Error("OVS add-to-cart URL is no longer valid.");
    }
    if (
      addUrl.origin !== OVS_ORIGIN ||
      addUrl.pathname !== "/panier" ||
      addUrl.searchParams.get("add") !== "1" ||
      addUrl.searchParams.get("id_product") !== product.id ||
      addUrl.searchParams.get("id_product_attribute") !==
        product.productAttributeId
    ) {
      throw new Error("OVS add-to-cart product scope is no longer recognized.");
    }
    // Le flux de recherche retourne aussi les variantes épuisées : leur URL
    // panier garde l'identité produit/variante, mais elles ne fournissent pas
    // forcément l'identifiant de personnalisation exigé avant toute mutation.
    // Elles restent donc visibles comme indisponibles, jamais actionnables.
    if (product.availableForOrder !== true) {
      return { ...product, availableForOrder: false };
    }
    if (product.productCustomizationId === null) {
      throw new Error("OVS add-to-cart product scope is no longer recognized.");
    }
    return product;
  });
}

async function strictJsonResponse(
  response: Response,
  label: string,
): Promise<unknown> {
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json")
    throw new Error(`OVS ${label} response is no longer JSON.`);
  return parseJsonObject(await response.text(), `${label} response`);
}

function parseJsonObject(
  textValue: string,
  label: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(textValue);
  } catch {
    throw new Error(`OVS ${label} is no longer valid JSON.`);
  }
  const object = plainObject(value);
  if (!object) throw new Error(`OVS ${label} is no longer an object.`);
  return object;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length ||
    actual.some((key, index) => key !== keys[index])
  )
    throw new Error(`OVS ${label} keys are no longer recognized.`);
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return nonNegativeInteger(value) && value > 0;
}

function digitInteger(value: unknown): boolean {
  return (
    nonNegativeInteger(value) ||
    (typeof value === "string" && /^\d+$/.test(value))
  );
}

function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function elementsWithClass(
  html: string,
  tag: string,
  className: string,
): string[] {
  const escapedTag = escapeRegExp(tag);
  const escapedClass = escapeRegExp(className);
  const expression = new RegExp(
    `<${escapedTag}\\b(?=[^>]*class=(?:"[^"]*\\b${escapedClass}\\b[^"]*"|'[^']*\\b${escapedClass}\\b[^']*'))[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`,
    "gi",
  );
  return [...html.matchAll(expression)].map((match) => match[1] ?? "");
}

function openingTagWithClass(
  html: string,
  tag: string,
  className: string,
): string | null {
  const escapedTag = escapeRegExp(tag);
  const escapedClass = escapeRegExp(className);
  return (
    html.match(
      new RegExp(
        `<${escapedTag}\\b(?=[^>]*class=(?:"[^"]*\\b${escapedClass}\\b[^"]*"|'[^']*\\b${escapedClass}\\b[^']*'))[^>]*>`,
        "i",
      ),
    )?.[0] ?? null
  );
}

function elementWithClass(
  html: string,
  tag: string,
  className: string,
): { opening: string; inner: string } | null {
  const escapedTag = escapeRegExp(tag);
  const escapedClass = escapeRegExp(className);
  const match = html.match(
    new RegExp(
      `(<${escapedTag}\\b(?=[^>]*class=(?:"[^"]*\\b${escapedClass}\\b[^"]*"|'[^']*\\b${escapedClass}\\b[^']*'))[^>]*>)([\\s\\S]*?)<\\/${escapedTag}>`,
      "i",
    ),
  );
  return match ? { opening: match[1] ?? "", inner: match[2] ?? "" } : null;
}

function hasId(html: string, id: string): boolean {
  const escaped = escapeRegExp(id);
  return new RegExp(`\\bid=(?:"${escaped}"|'${escaped}')`, "i").test(html);
}

function hasClass(html: string, className: string): boolean {
  const escaped = escapeRegExp(className);
  return new RegExp(
    `class=(?:"[^"]*\\b${escaped}\\b[^"]*"|'[^']*\\b${escaped}\\b[^']*')`,
    "i",
  ).test(html);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function moneyNumber(value: string | number | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  let normalized = value.normalize("NFKC").replace(/[\s€]/g, "");
  if (normalized.includes(","))
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  normalized = normalized.replace(/[^\d.-]/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOvsUrl(value: string): boolean {
  try {
    return new URL(value, OVS_ORIGIN).origin === OVS_ORIGIN;
  } catch {
    return false;
  }
}

function stringScalar(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match?.[1] ?? match?.[2] ?? null;
}

function text(html: string): string {
  return decodeEntities(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (_all, entity: string) => {
      if (entity.startsWith("#x"))
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith("#"))
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return named[entity.toLowerCase()] ?? `&${entity};`;
    },
  );
}
