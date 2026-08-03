#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";
import { OvsClient } from "./api.js";
import { importSessionHar, importSessionJson } from "./import-session.js";
import { cartQuantity } from "./normalize.js";
import { OvsService } from "./service.js";
import { loadSession, publicSessionSummary, resolveSessionPath, } from "./session.js";
async function main() {
    const args = process.argv.slice(2);
    const command = args.shift();
    if (!command || command === "help" || command === "--help")
        return usage();
    if (command === "session") {
        const action = args.shift();
        const source = option(args, "--from");
        const output = option(args, "--output");
        if (!source || !output || !isAbsolute(output)) {
            throw new Error("Session import requires --from <file> and an absolute --output <private-session.json>.");
        }
        if (action === "import-har")
            await importSessionHar(resolve(source), output);
        else if (action === "import-json")
            await importSessionJson(resolve(source), output);
        else
            throw new Error("Unknown session command. Use import-har or import-json.");
        process.stdout.write(`${JSON.stringify({ session: "imported", path: output, permissions: "0600" })}\n`);
        return;
    }
    const sessionPath = resolveSessionPath(option(args, "--session"));
    const client = new OvsClient({ sessionPath });
    const service = new OvsService(client);
    let output;
    switch (command) {
        case "doctor": {
            const session = await loadSession(sessionPath);
            await service.listCurrencies();
            output = {
                status: "ok",
                backend: "ovs-private-api",
                session: publicSessionSummary(session),
            };
            break;
        }
        case "search": {
            const query = args
                .filter((value) => !value.startsWith("--"))
                .join(" ")
                .trim();
            if (query.length < 2)
                throw new Error("Search query must contain at least two characters.");
            output = await service.searchProducts(query);
            break;
        }
        case "categories":
            output = await service.listCategories();
            break;
        case "manufacturers":
            output = await service.listManufacturers();
            break;
        case "currencies":
            output = await service.listCurrencies();
            break;
        case "cart":
            output = await service.getCart();
            break;
        case "customer":
            output = await service.getCustomer();
            break;
        case "addresses":
            output = await service.listAddresses();
            break;
        case "favorites":
            output = await service.listFavorites();
            break;
        case "add":
        case "remove": {
            const productId = args.shift();
            const quantity = Number(option(args, "--quantity") ?? "1");
            const confirmed = flag(args, "--confirm");
            if (!productId || !/^\d+$/.test(productId))
                throw new Error("Cart product ID must be a positive integer.");
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50)
                throw new Error("Cart quantity must be an integer from 1 to 50.");
            if (!confirmed) {
                const cart = await service.getCart();
                const currentQuantity = cartQuantity(cart, productId);
                if (command === "remove" && currentQuantity < quantity)
                    throw new Error("Cannot remove more units than the cart currently contains.");
                output = {
                    status: "confirmation_required",
                    operation: command,
                    productId,
                    quantity,
                    currentQuantity,
                    resultingQuantity: currentQuantity + (command === "add" ? quantity : -quantity),
                    next: "Run the same command with --confirm to apply it.",
                };
            }
            else {
                const cart = command === "add"
                    ? await service.addToCart(productId, quantity)
                    : await service.removeFromCart(productId, quantity);
                output = {
                    status: "applied",
                    operation: command,
                    productId,
                    quantity,
                    cart,
                };
            }
            break;
        }
        default:
            throw new Error(`Unknown command: ${command}`);
    }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
function option(args, name) {
    const index = args.indexOf(name);
    if (index < 0)
        return undefined;
    const value = args[index + 1];
    if (!value)
        throw new Error(`${name} requires a value.`);
    args.splice(index, 2);
    return value;
}
function flag(args, name) {
    const index = args.indexOf(name);
    if (index < 0)
        return false;
    args.splice(index, 1);
    return true;
}
function usage() {
    process.stdout.write(`OVS CLI\n\nUsage:\n  ovs session import-har --from capture.har --output /absolute/private/session.json\n  ovs doctor --session /absolute/private/session.json\n  ovs search <query> --session /absolute/private/session.json\n  ovs categories|manufacturers|currencies|cart|customer|addresses|favorites --session <path>\n  ovs add|remove <product-id> [--quantity N] [--confirm] --session <path>\n`);
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`OVS CLI error: ${message}\n`);
    process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map