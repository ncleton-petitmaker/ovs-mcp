import { describe, expect, it, vi } from "vitest";
import type { OvsClient } from "../../src/api.js";
import { startLoginServer } from "../../src/login-server.js";

describe("OVS login wizard", () => {
  it("offers the official account-creation link without weakening local security", async () => {
    const client = { login: vi.fn() } as unknown as OvsClient;
    const flow = await startLoginServer(client);
    try {
      const response = await fetch(flow.url);
      const page = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(page).toContain(
        "https://www.officialveganshop.com/connexion?create_account=1",
      );
      expect(page).toContain("Créer un compte OVS");
      expect(page).toContain('rel="noopener noreferrer"');
    } finally {
      await flow.close();
    }
  });
});
