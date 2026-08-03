import { chmod, mkdir, readFile, rename, stat, writeFile, } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
export const DEFAULT_BASE_URL = "https://www.officialveganshop.com/module/vtj_api";
const nonEmpty = z.string().trim().min(1);
export const sessionSchema = z.object({
    version: z.literal(1),
    baseUrl: z.literal(DEFAULT_BASE_URL),
    headers: z.object({
        authorization: nonEmpty,
        deviceUuid: z.string().uuid(),
        appVersion: nonEmpty,
        os: nonEmpty,
        osVersion: nonEmpty,
        userAgent: nonEmpty,
        acceptLanguage: nonEmpty,
    }),
    credentials: z.object({
        token: nonEmpty,
        refreshToken: nonEmpty,
    }),
});
export function resolveSessionPath(input = process.env.OVS_SESSION_FILE) {
    if (!input)
        return resolve(homedir(), ".config", "ovs-mcp", "session.json");
    if (!isAbsolute(input)) {
        throw new Error("OVS_SESSION_FILE must be an absolute path.");
    }
    return resolve(input);
}
export async function loadSession(path = resolveSessionPath()) {
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
        throw new Error(`OVS session file not found: ${path}`);
    }
    if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
        throw new Error(`OVS session file permissions are too broad: ${path}. Run chmod 600 on it.`);
    }
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const result = sessionSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(`OVS session file is invalid: ${z.prettifyError(result.error)}`);
    }
    return result.data;
}
export async function saveSession(path, session) {
    const data = `${JSON.stringify(sessionSchema.parse(session), null, 2)}\n`;
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, data, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
    });
    await rename(temporary, path);
    if (process.platform !== "win32")
        await chmod(path, 0o600);
}
export function publicSessionSummary(session) {
    return {
        baseUrl: session.baseUrl,
        appVersion: session.headers.appVersion,
        os: session.headers.os,
        osVersion: session.headers.osVersion,
        acceptLanguage: session.headers.acceptLanguage,
        authentication: "configured",
    };
}
//# sourceMappingURL=session.js.map