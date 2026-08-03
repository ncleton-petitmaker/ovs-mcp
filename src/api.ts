import { OvsError } from "./errors.js";
import { loadSession, type OvsSession, saveSession } from "./session.js";

export interface OvsEnvelope {
  action: string;
  data: unknown;
}

interface RefreshData {
  token: string;
  refresh_token: string;
}

export interface OvsClientOptions {
  sessionPath: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export class OvsClient {
  readonly #sessionPath: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  #session?: OvsSession;
  #refreshPromise?: Promise<void>;

  constructor(options: OvsClientOptions) {
    this.#sessionPath = options.sessionPath;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 20_000;
  }

  async session(): Promise<OvsSession> {
    this.#session ??= await loadSession(this.#sessionPath);
    return this.#session;
  }

  async call(
    endpoint: string,
    action: string,
    data?: Record<string, unknown>,
  ): Promise<OvsEnvelope> {
    const body = data === undefined ? { action } : { action, data };
    let response = await this.#request(endpoint, body);
    if (response.status === 452 && action !== "refresh_token") {
      await this.#refresh();
      const session = await this.session();
      const retriedData =
        data && "token" in data
          ? { ...data, token: session.credentials.token }
          : data;
      response = await this.#request(
        endpoint,
        retriedData === undefined ? { action } : { action, data: retriedData },
      );
    }
    if (!response.ok) {
      throw new OvsError(
        `OVS API rejected ${endpoint}/${action} with HTTP ${response.status}. Re-import the session if authentication changed.`,
        response.status === 401 ||
          response.status === 403 ||
          response.status === 452
          ? "OVS_AUTHENTICATION_FAILED"
          : "OVS_UPSTREAM_ERROR",
        response.status >= 500,
      );
    }
    return this.#parseEnvelope(response, action);
  }

  async authenticatedCall(
    endpoint: string,
    action: string,
    data: Record<string, unknown> = {},
  ): Promise<OvsEnvelope> {
    const session = await this.session();
    return this.call(endpoint, action, {
      ...data,
      token: session.credentials.token,
    });
  }

  async #request(endpoint: string, body: unknown): Promise<Response> {
    if (!/^\/[a-z_]+$/i.test(endpoint))
      throw new OvsError("Invalid OVS endpoint.", "OVS_INVALID_ENDPOINT");
    const session = await this.session();
    const headers: Record<string, string> = {
      accept: "application/json",
      "accept-language": session.headers.acceptLanguage,
      authorization: session.headers.authorization,
      "cache-control": "no-cache",
      "content-type": "application/json",
      "user-agent": session.headers.userAgent,
      "x-app-version": session.headers.appVersion,
      "x-device-uuid": session.headers.deviceUuid,
      "x-os": session.headers.os,
      "x-os-version": session.headers.osVersion,
    };
    try {
      return await this.#fetch(`${session.baseUrl}${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      const timeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new OvsError(
        timeout
          ? `OVS API did not answer within ${this.#timeoutMs} ms.`
          : "OVS API network request failed.",
        timeout ? "OVS_TIMEOUT" : "OVS_NETWORK_ERROR",
        true,
      );
    }
  }

  async #parseEnvelope(
    response: Response,
    expectedAction: string,
  ): Promise<OvsEnvelope> {
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new OvsError(
        "OVS API returned invalid JSON.",
        "OVS_SCHEMA_CHANGED",
      );
    }
    if (
      !value ||
      typeof value !== "object" ||
      !("action" in value) ||
      !("data" in value)
    ) {
      throw new OvsError(
        "OVS API response shape is no longer recognized.",
        "OVS_SCHEMA_CHANGED",
      );
    }
    const envelope = value as Record<string, unknown>;
    if (typeof envelope.action !== "string") {
      throw new OvsError(
        "OVS API action field is no longer recognized.",
        "OVS_SCHEMA_CHANGED",
      );
    }
    if (envelope.action !== expectedAction) {
      throw new OvsError(
        `OVS API returned action ${envelope.action} instead of ${expectedAction}.`,
        "OVS_SCHEMA_CHANGED",
      );
    }
    return { action: envelope.action, data: envelope.data };
  }

  async #refresh(): Promise<void> {
    this.#refreshPromise ??= this.#performRefresh().finally(() => {
      this.#refreshPromise = undefined;
    });
    return this.#refreshPromise;
  }

  async #performRefresh(): Promise<void> {
    const session = await this.session();
    const response = await this.#request("/auth", {
      action: "refresh_token",
      data: { refresh_token: session.credentials.refreshToken },
    });
    if (!response.ok) {
      throw new OvsError(
        `OVS session refresh failed with HTTP ${response.status}. Import a fresh session from the official app.`,
        "OVS_AUTHENTICATION_FAILED",
      );
    }
    const envelope = await this.#parseEnvelope(response, "refresh_token");
    if (!isRefreshData(envelope.data)) {
      throw new OvsError(
        "OVS refresh response shape is no longer recognized.",
        "OVS_SCHEMA_CHANGED",
      );
    }
    this.#session = {
      ...session,
      credentials: {
        token: envelope.data.token,
        refreshToken: envelope.data.refresh_token,
      },
    };
    await saveSession(this.#sessionPath, this.#session);
  }
}

function isRefreshData(value: unknown): value is RefreshData {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).token === "string" &&
      typeof (value as Record<string, unknown>).refresh_token === "string",
  );
}
