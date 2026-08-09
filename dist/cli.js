#!/usr/bin/env node
import { OvsClient } from "./api.js";
import { cartFingerprint } from "./confirmations.js";
import { cartMutationFailurePayload } from "./errors.js";
import { startLoginServer } from "./login-server.js";
import { cartQuantity } from "./normalize.js";
import { OvsService } from "./service.js";
import { publicSessionSummary, resolveSessionPath } from "./session.js";
async function main() {
    const args = process.argv.slice(2);
    const command = args.shift();
    if (!command || command === "help" || command === "--help")
        return usage();
    const sessionPath = resolveSessionPath(option(args, "--session"));
    const client = new OvsClient({ sessionPath });
    const service = new OvsService(client);
    let output;
    switch (command) {
        case "connect": {
            if (await client.isAuthenticated())
                output = { status: "connected", session: publicSessionSummary() };
            else {
                const flow = await startLoginServer(client);
                process.stdout.write(`Open this secure local page to connect OVS:\n${flow.url}\n`);
                await flow.completed;
                output = { status: "connected", session: publicSessionSummary() };
            }
            break;
        }
        case "doctor":
            output = {
                status: (await client.isAuthenticated()) ? "ok" : "connection_required",
                session: (await client.isAuthenticated())
                    ? publicSessionSummary()
                    : undefined,
            };
            break;
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
        case "cart":
            output = await service.getCart();
            break;
        case "add":
        case "remove": {
            const productId = args.shift();
            const productAttributeId = option(args, "--attribute");
            const productCustomizationId = option(args, "--customization");
            const quantity = Number(option(args, "--quantity") ?? "1");
            const expectedFingerprint = option(args, "--cart-fingerprint");
            const confirmed = flag(args, "--confirm");
            if (!productId || !/^[1-9]\d*$/.test(productId))
                throw new Error("Cart product ID must be a positive integer.");
            if (!productAttributeId || !/^\d+$/.test(productAttributeId))
                throw new Error("--attribute must contain the exact non-negative productAttributeId returned by search.");
            if (!productCustomizationId || !/^\d+$/.test(productCustomizationId))
                throw new Error("--customization must contain the exact non-negative productCustomizationId returned by search.");
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50)
                throw new Error("Cart quantity must be an integer from 1 to 50.");
            if (args.length > 0)
                throw new Error(`Unknown cart arguments: ${args.join(" ")}`);
            if (!confirmed) {
                const cart = await service.getCart();
                const currentQuantity = cartQuantity(cart, productId, productAttributeId, productCustomizationId);
                if (command === "remove" && currentQuantity < quantity)
                    throw new Error("Cannot remove more units than the cart currently contains.");
                output = {
                    status: "confirmation_required",
                    operation: command,
                    productId,
                    productAttributeId,
                    productCustomizationId,
                    quantity,
                    currentQuantity,
                    resultingQuantity: currentQuantity + (command === "add" ? quantity : -quantity),
                    cartFingerprint: cartFingerprint(cart),
                    next: "Run the same command with --confirm and the returned --cart-fingerprint to apply it.",
                };
            }
            else {
                if (!expectedFingerprint || !/^[a-f0-9]{64}$/.test(expectedFingerprint))
                    throw new Error("--confirm requires the exact --cart-fingerprint returned by the preview.");
                const current = await service.getCart();
                if (cartFingerprint(current) !== expectedFingerprint)
                    throw new Error("Cart changed after preview. Run the command again without --confirm.");
                const cart = command === "add"
                    ? await service.addToCart(productId, productAttributeId, productCustomizationId, quantity, expectedFingerprint)
                    : await service.removeFromCart(productId, productAttributeId, productCustomizationId, quantity, expectedFingerprint);
                output = {
                    status: "applied",
                    operation: command,
                    productId,
                    productAttributeId,
                    productCustomizationId,
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
    process.stdout.write("OVS CLI\n\nUsage:\n  ovs connect [--session /absolute/private/session.json]\n  ovs doctor [--session ...]\n  ovs search <query> [--session ...]\n  ovs cart [--session ...]\n  ovs add|remove <product-id> --attribute <id> --customization <id> [--quantity N] [--confirm --cart-fingerprint <sha256>] [--session ...]\n");
}
main().catch((error) => {
    const mutationFailure = cartMutationFailurePayload(error);
    if (mutationFailure) {
        process.stdout.write(`${JSON.stringify(mutationFailure, null, 2)}\n`);
        process.exitCode = 1;
        return;
    }
    process.stderr.write(`OVS CLI error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map