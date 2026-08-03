import {
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";

export const OVS_ORIGIN = "https://www.officialveganshop.com";

export const sessionSchema = z.object({
  version: z.literal(2),
  backend: z.literal("ovs-website"),
  cookies: z.record(z.string().min(1), z.string().min(1)),
  authenticatedAt: z.string().datetime(),
});

export type OvsSession = z.infer<typeof sessionSchema>;

export function resolveSessionPath(
  input = process.env.OVS_SESSION_FILE,
): string {
  if (!input) return resolve(homedir(), ".config", "ovs-mcp", "session.json");
  if (!isAbsolute(input))
    throw new Error("OVS_SESSION_FILE must be an absolute path.");
  return resolve(input);
}

export async function loadSession(
  path = resolveSessionPath(),
): Promise<OvsSession> {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new Error(`OVS session file not found: ${path}`);
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    throw new Error(
      `OVS session file permissions are too broad: ${path}. Run chmod 600 on it.`,
    );
  }
  const result = sessionSchema.safeParse(
    JSON.parse(await readFile(path, "utf8")) as unknown,
  );
  if (!result.success)
    throw new Error(
      `OVS session file is invalid: ${z.prettifyError(result.error)}`,
    );
  return result.data;
}

export async function saveSession(
  path: string,
  session: OvsSession,
): Promise<void> {
  const data = `${JSON.stringify(sessionSchema.parse(session), null, 2)}\n`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, data, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, path);
  if (process.platform !== "win32") await chmod(path, 0o600);
}

export function publicSessionSummary(): Record<string, string> {
  return { backend: "ovs-website", authentication: "configured" };
}
