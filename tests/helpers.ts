import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OvsSession } from "../src/session.js";

export const syntheticSession: OvsSession = {
  version: 2,
  backend: "ovs-website",
  cookies: { ovs_test_session: "SYNTHETIC_COOKIE_VALUE" },
  authenticatedAt: "2026-01-01T00:00:00.000Z",
};

export async function createSessionFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ovs-mcp-test-"));
  const path = join(directory, "session.json");
  await writeFile(path, `${JSON.stringify(syntheticSession)}\n`, {
    mode: 0o600,
  });
  return path;
}
