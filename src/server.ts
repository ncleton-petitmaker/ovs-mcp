import { stat } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OvsClient } from "./api.js";
import { ConfirmationStore, MutationCoordinator } from "./confirmations.js";
import { safeError } from "./errors.js";
import { importSessionHar } from "./import-session.js";
import type { SearchResult } from "./normalize.js";
import { cartQuantity } from "./normalize.js";
import { OvsService } from "./service.js";
import { loadSession, publicSessionSummary } from "./session.js";

export interface CreateServerOptions {
  sessionPath: string;
  client?: OvsClient;
}

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};
const genericOutput = { data: z.unknown() };

export function createServer(options: CreateServerOptions): McpServer {
  const server = new McpServer(
    {
      name: "ovs-mcp",
      version: "1.0.0",
      websiteUrl: "https://github.com/ncleton-petitmaker/ovs-mcp",
    },
    {
      capabilities: { logging: {} },
      instructions:
        "Call connect_ovs before the first OVS operation. If it reports connection_required, ask the user for the local path to an authenticated HAR captured from an OVS app session they control. Never ask the user to paste credentials, tokens, captures, customer data, or addresses into chat. Product search returns product IDs. Cart mutations require a preview call followed by the same tool with its confirmation token.",
    },
  );
  const service = new OvsService(
    options.client ?? new OvsClient({ sessionPath: options.sessionPath }),
  );
  const confirmations = new ConfirmationStore();
  const mutations = new MutationCoordinator();

  server.registerTool(
    "connect_ovs",
    {
      title: "Connect Official Vegan Shop",
      description:
        "Check OVS authentication or privately import an authenticated HAR owned by the user. Call this when another tool reports that the session is missing.",
      inputSchema: {
        harPath: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Absolute local path to a private authenticated OVS HAR capture.",
          ),
      },
      outputSchema: genericOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ harPath }) =>
      result(async () => {
        if (harPath) await importSessionHar(harPath, options.sessionPath);
        const exists = await stat(options.sessionPath).then(
          (value) => value.isFile(),
          () => false,
        );
        if (!exists) {
          return {
            data: {
              status: "connection_required",
              sessionPath: options.sessionPath,
              userAction:
                "Capture one authenticated OVS app session as HAR on a device you control, then call connect_ovs again with its absolute local path.",
              privacy:
                "Keep the HAR local. Never upload it to GitHub, chat, an issue, or a model provider. Restore the phone proxy after capture.",
            },
          };
        }
        await service.listCurrencies();
        return {
          data: {
            status: "connected",
            backend: "ovs-private-api",
            session: publicSessionSummary(
              await loadSession(options.sessionPath),
            ),
          },
        };
      }),
  );

  server.registerTool(
    "search_products",
    {
      title: "Search OVS products",
      description: "Search the live Official Vegan Shop catalog.",
      inputSchema: {
        query: z.string().trim().min(2).max(120),
        page: z.number().int().min(1).max(100).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      },
      outputSchema: {
        query: z.string(),
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        products: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            manufacturer: z.string().nullable(),
            category: z.string().nullable(),
            price: z.union([z.string(), z.number()]).nullable(),
            unitPrice: z.union([z.string(), z.number()]).nullable(),
            quantity: z.union([z.string(), z.number()]).nullable(),
            availableForOrder: z
              .union([z.boolean(), z.string(), z.number()])
              .nullable(),
            reference: z.string().nullable(),
            url: z.string().nullable(),
          }),
        ),
      },
      annotations,
    },
    async ({ query, page, limit }) =>
      result(() => service.searchProducts(query, page, limit)),
  );

  registerReadTool(
    server,
    "list_categories",
    "List OVS categories",
    "List active catalog categories.",
    () => service.listCategories(),
  );
  registerReadTool(
    server,
    "list_manufacturers",
    "List OVS manufacturers",
    "List active brands that currently have products.",
    () => service.listManufacturers(),
  );

  registerCartMutation(
    server,
    "add_to_cart",
    "Add OVS product to cart",
    "add",
    service,
    confirmations,
    mutations,
  );
  registerCartMutation(
    server,
    "remove_from_cart",
    "Remove OVS product from cart",
    "remove",
    service,
    confirmations,
    mutations,
  );
  registerReadTool(
    server,
    "list_currencies",
    "List OVS currencies",
    "List currencies exposed by OVS.",
    () => service.listCurrencies(),
  );
  registerReadTool(
    server,
    "get_cart",
    "Get OVS cart",
    "Read the authenticated account cart.",
    () => service.getCart(),
  );
  registerReadTool(
    server,
    "get_customer",
    "Get OVS customer",
    "Read the authenticated customer profile. This can contain personal data.",
    () => service.getCustomer(),
  );
  registerReadTool(
    server,
    "list_addresses",
    "List OVS addresses",
    "Read delivery addresses for the authenticated account. This returns personal data.",
    () => service.listAddresses(),
  );
  registerReadTool(
    server,
    "list_favorites",
    "List OVS favorites",
    "Read favorite products.",
    () => service.listFavorites(),
  );

  return server;
}

function registerCartMutation(
  server: McpServer,
  name: "add_to_cart" | "remove_from_cart",
  title: string,
  operation: "add" | "remove",
  service: OvsService,
  confirmations: ConfirmationStore,
  mutations: MutationCoordinator,
): void {
  server.registerTool(
    name,
    {
      title,
      description:
        operation === "add"
          ? "Preview, confirm, and add one or more units of an observed OVS product ID."
          : "Preview, confirm, and remove one or more units of an observed OVS product ID.",
      inputSchema: {
        productId: z.string().regex(/^\d+$/),
        quantity: z.number().int().min(1).max(50).default(1),
        confirmationToken: z.string().uuid().optional(),
      },
      outputSchema: genericOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ productId, quantity, confirmationToken }) =>
      result(async () => {
        if (!confirmationToken) {
          const cart = await service.getCart();
          const currentQuantity = cartQuantity(cart, productId);
          if (operation === "remove" && currentQuantity < quantity) {
            throw new Error(
              "Cannot remove more units than the cart currently contains.",
            );
          }
          return {
            data: {
              status: "confirmation_required",
              operation,
              productId,
              quantity,
              currentQuantity,
              resultingQuantity:
                currentQuantity + (operation === "add" ? quantity : -quantity),
              confirmationToken: confirmations.create(
                operation,
                productId,
                quantity,
                cart,
              ),
              expiresInSeconds: 300,
            },
          };
        }
        return mutations.run(async () => {
          const current = await service.getCart();
          confirmations.consume(
            confirmationToken,
            operation,
            productId,
            quantity,
            current,
          );
          const cart =
            operation === "add"
              ? await service.addToCart(productId, quantity)
              : await service.removeFromCart(productId, quantity);
          return {
            data: { status: "applied", operation, productId, quantity, cart },
          };
        });
      }),
  );
}

function registerReadTool(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  action: () => Promise<unknown>,
): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: {},
      outputSchema: genericOutput,
      annotations,
    },
    async () => result(async () => ({ data: await action() })),
  );
}

async function result<T extends Record<string, unknown> | SearchResult>(
  action: () => Promise<T>,
) {
  try {
    const structuredContent = await action();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
      structuredContent,
    };
  } catch (error) {
    const safe = safeError(error);
    return {
      isError: true,
      content: [
        { type: "text" as const, text: `${safe.code}: ${safe.message}` },
      ],
    };
  }
}
