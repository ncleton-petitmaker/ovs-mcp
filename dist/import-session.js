import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_BASE_URL, saveSession, sessionSchema, } from "./session.js";
export async function importSessionJson(source, output) {
    const parsed = sessionSchema.parse(JSON.parse(await readFile(source, "utf8")));
    await saveSession(resolve(output), parsed);
}
export async function importSessionHar(source, output) {
    const raw = JSON.parse(await readFile(source, "utf8"));
    const entries = getHarEntries(raw);
    const observedHeaders = new Map();
    let token;
    let refreshToken;
    for (const entry of entries) {
        const request = entry.request;
        if (!request ||
            typeof request.url !== "string" ||
            !request.url.startsWith(`${DEFAULT_BASE_URL}/`))
            continue;
        for (const header of Array.isArray(request.headers)
            ? request.headers
            : []) {
            if (typeof header.name === "string" && typeof header.value === "string") {
                observedHeaders.set(header.name.toLowerCase(), header.value);
            }
        }
        if (typeof request.postData?.text === "string") {
            try {
                const body = JSON.parse(request.postData.text);
                const found = findCredentials(body);
                token = found.token ?? token;
                refreshToken = found.refreshToken ?? refreshToken;
            }
            catch {
                // Non-JSON requests are irrelevant; all supported OVS API calls are JSON.
            }
        }
    }
    const required = (name) => {
        const value = observedHeaders.get(name);
        if (!value)
            throw new Error(`HAR does not contain required OVS header: ${name}`);
        return value;
    };
    if (!token || !refreshToken) {
        throw new Error("HAR does not contain both the account token and refresh token. Capture an authenticated customer/cart load and one refresh request.");
    }
    const session = {
        version: 1,
        baseUrl: DEFAULT_BASE_URL,
        headers: {
            authorization: required("authorization"),
            deviceUuid: required("x-device-uuid"),
            appVersion: required("x-app-version"),
            os: required("x-os"),
            osVersion: required("x-os-version"),
            userAgent: required("user-agent"),
            acceptLanguage: required("accept-language"),
        },
        credentials: { token, refreshToken },
    };
    await saveSession(resolve(output), session);
}
function getHarEntries(value) {
    if (!value || typeof value !== "object")
        throw new Error("HAR root must be an object.");
    const log = value.log;
    if (!log || typeof log !== "object")
        throw new Error("HAR log object is missing.");
    const entries = log.entries;
    if (!Array.isArray(entries))
        throw new Error("HAR entries array is missing.");
    return entries;
}
function findCredentials(value) {
    const found = {};
    visit(value, (key, item) => {
        if (typeof item !== "string" || !item)
            return;
        if (key === "token")
            found.token = item;
        if (key === "refresh_token")
            found.refreshToken = item;
    });
    return found;
}
function visit(value, callback) {
    if (Array.isArray(value)) {
        for (const item of value)
            visit(item, callback);
        return;
    }
    if (!value || typeof value !== "object")
        return;
    for (const [key, item] of Object.entries(value)) {
        callback(key, item);
        visit(item, callback);
    }
}
//# sourceMappingURL=import-session.js.map