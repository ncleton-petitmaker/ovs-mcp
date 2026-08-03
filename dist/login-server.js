import { randomBytes } from "node:crypto";
import { createServer, } from "node:http";
const OVS_ACCOUNT_CREATION_URL = "https://www.officialveganshop.com/connexion?create_account=1";
export async function startLoginServer(client) {
    const token = randomBytes(32).toString("hex");
    let attempts = 0;
    let settle;
    const completed = new Promise((resolve) => {
        settle = resolve;
    });
    const server = createServer(async (request, response) => {
        secure(response);
        const expected = `/${token}`;
        if (request.url !== expected)
            return send(response, 404, page("Page introuvable", "Cette page de connexion n’est pas valide."));
        if (request.method === "GET")
            return send(response, 200, formPage());
        if (request.method !== "POST")
            return send(response, 405, page("Méthode refusée", "Revenez à la page de connexion."));
        if (++attempts > 5)
            return send(response, 429, page("Trop de tentatives", "Fermez cette page puis relancez la connexion depuis votre client MCP."));
        try {
            const body = await readBody(request);
            const values = new URLSearchParams(body);
            await client.login(values.get("email") ?? "", values.get("password") ?? "");
            send(response, 200, page("Connexion réussie", "Vous pouvez fermer cette page et revenir dans votre client MCP."));
            settle();
            setTimeout(() => server.close(), 500).unref();
        }
        catch {
            send(response, 401, formPage("Connexion refusée. Vérifiez votre email et votre mot de passe."));
        }
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("Secure OVS login server did not start.");
    return {
        url: `http://127.0.0.1:${address.port}/${token}`,
        completed,
        close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    };
}
function secure(response) {
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
}
function send(response, status, body) {
    response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    response.end(body);
}
async function readBody(request) {
    let body = "";
    for await (const chunk of request) {
        body += String(chunk);
        if (body.length > 16_384)
            throw new Error("Login form is too large.");
    }
    return body;
}
function formPage(error = "") {
    return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connexion OVS</title><style>${styles}</style><main><h1>Connexion à Official Vegan Shop</h1><p>Connectez votre propre compte. Votre mot de passe est envoyé directement à OVS et n’est pas enregistré.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}<form method="post" autocomplete="on"><label>Email<input name="email" type="email" autocomplete="username" required autofocus></label><label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Se connecter</button></form><p class="create">Vous n’avez pas encore de compte ? <a href="${OVS_ACCOUNT_CREATION_URL}" target="_blank" rel="noopener noreferrer">Créer un compte OVS</a></p></main></html>`;
}
function page(title, message) {
    return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>${styles}</style><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></html>`;
}
const styles = "body{font:16px system-ui;background:#f5f7f4;color:#172018;margin:0}main{max-width:28rem;margin:10vh auto;background:white;padding:2rem;border-radius:1rem;box-shadow:0 8px 32px #0001}h1{font-size:1.5rem}label{display:block;margin:1rem 0}input{box-sizing:border-box;width:100%;padding:.75rem;margin-top:.35rem;border:1px solid #aab5aa;border-radius:.5rem}button{width:100%;padding:.8rem;border:0;border-radius:.5rem;background:#267a3e;color:white;font-weight:700}.error{color:#a01818}.create{margin:1.5rem 0 0;color:#435443}.create a{color:#16642e;font-weight:650}";
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
//# sourceMappingURL=login-server.js.map