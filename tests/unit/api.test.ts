import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { OvsClient } from "../../src/api.js";
import { createSessionFile } from "../helpers.js";

describe("OvsClient", () => {
  it("uses only the fixed OVS origin and private session cookie", async () => {
    const sessionPath = await createSessionFile();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("account", { status: 200 }));
    const client = new OvsClient({ sessionPath, fetch: fetchMock });
    expect(await client.isAuthenticated()).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://www.officialveganshop.com/mon-compte");
    expect(new Headers(init?.headers).get("cookie")).toBe(
      "ovs_test_session=SYNTHETIC_COOKIE_VALUE",
    );
    expect(init?.redirect).toBe("manual");
  });

  it("logs in without persisting the password", async () => {
    const sessionPath = await createSessionFile();
    const loginHeaders = new Headers({
      "set-cookie": "ovs_new=SYNTHETIC_NEW_COOKIE; Path=/; HttpOnly",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("login", { status: 200, headers: loginHeaders }),
      )
      .mockResolvedValueOnce(
        new Response("", { status: 302, headers: loginHeaders }),
      )
      .mockResolvedValueOnce(new Response("account", { status: 200 }));
    const client = new OvsClient({ sessionPath, fetch: fetchMock });
    await client.login("person@example.invalid", "SYNTHETIC_PASSWORD");
    const persisted = await readFile(sessionPath, "utf8");
    expect(persisted).toContain("SYNTHETIC_NEW_COOKIE");
    expect(persisted).not.toContain("person@example.invalid");
    expect(persisted).not.toContain("SYNTHETIC_PASSWORD");
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain(
      "submitLogin=1",
    );
  });

  it("rejects a login when the account page redirects", async () => {
    const sessionPath = await createSessionFile();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("login"))
      .mockResolvedValueOnce(new Response("", { status: 302 }))
      .mockResolvedValueOnce(new Response("", { status: 302 }));
    const client = new OvsClient({ sessionPath, fetch: fetchMock });
    await expect(
      client.login("person@example.invalid", "bad"),
    ).rejects.toMatchObject({ code: "OVS_LOGIN_REJECTED" });
  });
});
