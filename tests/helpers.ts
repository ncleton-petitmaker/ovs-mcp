import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OvsSession } from "../src/session.js";

export const syntheticSession: OvsSession = {
  version: 1,
  baseUrl: "https://www.officialveganshop.com/module/vtj_api",
  headers: {
    authorization: "Bearer SYNTHETIC_TEST_VALUE",
    deviceUuid: "00000000-0000-4000-8000-000000000000",
    appVersion: "0.0-test",
    os: "test",
    osVersion: "0",
    userAgent: "ovs-mcp-tests",
    acceptLanguage: "fr-FR",
  },
  credentials: {
    token: "SYNTHETIC_ACCOUNT_TOKEN",
    refreshToken: "SYNTHETIC_REFRESH_TOKEN",
  },
};

export async function createSessionFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "ovs-mcp-test-"));
  const path = join(directory, "session.json");
  await writeFile(path, `${JSON.stringify(syntheticSession)}\n`, {
    mode: 0o600,
  });
  return path;
}
