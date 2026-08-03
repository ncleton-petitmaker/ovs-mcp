import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_BASE_URL,
  type OvsSession,
  saveSession,
  sessionSchema,
} from "./session.js";

interface HarHeader {
  name?: unknown;
  value?: unknown;
}

interface HarEntry {
  request?: {
    url?: unknown;
    headers?: unknown;
    postData?: { text?: unknown };
  };
}

export async function importSessionJson(
  source: string,
  output: string,
): Promise<void> {
  const parsed = sessionSchema.parse(
    JSON.parse(await readFile(source, "utf8")) as unknown,
  );
  await saveSession(resolve(output), parsed);
}

export async function importSessionHar(
  source: string,
  output: string,
): Promise<void> {
  const raw = JSON.parse(await readFile(source, "utf8")) as unknown;
  const entries = getHarEntries(raw);
  const observedHeaders = new Map<string, string>();
  let token: string | undefined;
  let refreshToken: string | undefined;

  for (const entry of entries) {
    const request = entry.request;
    if (
      !request ||
      typeof request.url !== "string" ||
      !request.url.startsWith(`${DEFAULT_BASE_URL}/`)
    )
      continue;
    for (const header of Array.isArray(request.headers)
      ? (request.headers as HarHeader[])
      : []) {
      if (typeof header.name === "string" && typeof header.value === "string") {
        observedHeaders.set(header.name.toLowerCase(), header.value);
      }
    }
    if (typeof request.postData?.text === "string") {
      try {
        const body = JSON.parse(request.postData.text) as unknown;
        const found = findCredentials(body);
        token = found.token ?? token;
        refreshToken = found.refreshToken ?? refreshToken;
      } catch {
        // Non-JSON requests are irrelevant; all supported OVS API calls are JSON.
      }
    }
  }

  const required = (name: string): string => {
    const value = observedHeaders.get(name);
    if (!value)
      throw new Error(`HAR does not contain required OVS header: ${name}`);
    return value;
  };
  if (!token || !refreshToken) {
    throw new Error(
      "HAR does not contain both the account token and refresh token. Capture an authenticated customer/cart load and one refresh request.",
    );
  }
  const session: OvsSession = {
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

function getHarEntries(value: unknown): HarEntry[] {
  if (!value || typeof value !== "object")
    throw new Error("HAR root must be an object.");
  const log = (value as Record<string, unknown>).log;
  if (!log || typeof log !== "object")
    throw new Error("HAR log object is missing.");
  const entries = (log as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) throw new Error("HAR entries array is missing.");
  return entries as HarEntry[];
}

function findCredentials(value: unknown): {
  token?: string;
  refreshToken?: string;
} {
  const found: { token?: string; refreshToken?: string } = {};
  visit(value, (key, item) => {
    if (typeof item !== "string" || !item) return;
    if (key === "token") found.token = item;
    if (key === "refresh_token") found.refreshToken = item;
  });
  return found;
}

function visit(
  value: unknown,
  callback: (key: string, value: unknown) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    callback(key, item);
    visit(item, callback);
  }
}
