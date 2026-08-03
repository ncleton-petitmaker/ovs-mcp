import { chmod } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadSession } from "../../src/session.js";
import { createSessionFile } from "../helpers.js";

describe("session storage", () => {
  it("loads a private session", async () => {
    const path = await createSessionFile();
    await expect(loadSession(path)).resolves.toMatchObject({
      version: 2,
      backend: "ovs-website",
    });
  });

  it.skipIf(process.platform === "win32")(
    "rejects group-readable session files",
    async () => {
      const path = await createSessionFile();
      await chmod(path, 0o644);
      await expect(loadSession(path)).rejects.toThrow(
        "permissions are too broad",
      );
    },
  );
});
