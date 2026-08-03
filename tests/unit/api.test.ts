import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { OvsClient } from "../../src/api.js";
import { createSessionFile } from "../helpers.js";

describe("OvsClient", () => {
  it("uses the observed headers and request contract", async () => {
    const sessionPath = await createSessionFile();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ action: "currencies", data: { currencies: [] } }),
      );
    const client = new OvsClient({ sessionPath, fetch: fetchMock });
    await client.call("/parameter", "currencies");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://www.officialveganshop.com/module/vtj_api/parameter",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ action: "currencies" });
    expect(new Headers(init?.headers).get("x-app-version")).toBe("0.0-test");
  });

  it("refreshes status 452, persists credentials, and retries once", async () => {
    const sessionPath = await createSessionFile();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("expired", { status: 452 }))
      .mockResolvedValueOnce(
        Response.json({
          action: "refresh_token",
          data: {
            token: "SYNTHETIC_NEW_TOKEN",
            refresh_token: "SYNTHETIC_NEW_REFRESH",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ action: "cart", data: { id_cart: "1" } }),
      );
    const client = new OvsClient({ sessionPath, fetch: fetchMock });
    const output = await client.authenticatedCall("/cart", "cart");

    expect(output.data).toEqual({ id_cart: "1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const persisted = JSON.parse(await readFile(sessionPath, "utf8"));
    expect(persisted.credentials).toEqual({
      token: "SYNTHETIC_NEW_TOKEN",
      refreshToken: "SYNTHETIC_NEW_REFRESH",
    });
    const retry = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(retry.data.token).toBe("SYNTHETIC_NEW_TOKEN");
  });

  it("fails loudly on an unrecognized response envelope", async () => {
    const sessionPath = await createSessionFile();
    const client = new OvsClient({
      sessionPath,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ ok: true })),
    });
    await expect(client.call("/parameter", "currencies")).rejects.toMatchObject(
      { code: "OVS_SCHEMA_CHANGED" },
    );
  });
});
