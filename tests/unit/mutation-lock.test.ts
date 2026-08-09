import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MutationFileLock, mutationLockPath } from "../../src/mutation-lock.js";

const temporaryRoots: string[] = [];

function sessionPath(): string {
  const root = mkdtempSync(join(tmpdir(), "ovs-mutation-lock-"));
  temporaryRoots.push(root);
  return join(root, "session.json");
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("inter-process cart mutation lock", () => {
  it("serializes two independent lock instances for the same session", async () => {
    const session = sessionPath();
    const first = new MutationFileLock(session, { pollIntervalMs: 5 });
    const second = new MutationFileLock(session, { pollIntervalMs: 5 });
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      firstEntered = resolve;
    });
    const order: string[] = [];
    const firstRun = first.run(async () => {
      order.push("first-enter");
      firstEntered();
      await firstGate;
      order.push("first-exit");
    });
    await entered;
    const secondRun = second.run(async () => {
      order.push("second-enter");
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(order).toEqual(["first-enter"]);
    releaseFirst();
    await Promise.all([firstRun, secondRun]);
    expect(order).toEqual(["first-enter", "first-exit", "second-enter"]);
  });

  it("recovers a stale lock only after its recorded process is dead", async () => {
    const session = sessionPath();
    const lockPath = mutationLockPath(session);
    const token = randomUUID();
    mkdirSync(lockPath, { mode: 0o700 });
    writeFileSync(
      join(lockPath, "owner.json"),
      `${JSON.stringify({
        version: 1,
        token,
        pid: 2_147_483_647,
        acquiredAt: "2000-01-01T00:00:00.000Z",
      })}\n`,
      { mode: 0o600 },
    );
    const lock = new MutationFileLock(session, {
      acquireTimeoutMs: 500,
      staleAfterMs: 1,
      pollIntervalMs: 5,
    });
    await expect(lock.run(async () => "recovered")).resolves.toBe("recovered");
    expect(
      readdirSync(join(session, "..")).some((name) =>
        name.startsWith(`session.json.cart-mutation.lock.stale-${token}-`),
      ),
    ).toBe(true);
  });

  it("recovers the filesystem lock after its owning process crashes", async () => {
    const session = sessionPath();
    const moduleUrl = new URL("../../src/mutation-lock.ts", import.meta.url)
      .href;
    const script = `
      import { MutationFileLock } from ${JSON.stringify(moduleUrl)};
      const lock = new MutationFileLock(process.env.OVS_TEST_SESSION_PATH, {
        acquireTimeoutMs: 500,
        staleAfterMs: 1,
        pollIntervalMs: 5,
      });
      await lock.run(async () => {
        process.stdout.write("locked\\n");
        setInterval(() => {}, 1_000);
        await new Promise(() => {});
      });
    `;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: new URL("../../", import.meta.url),
        env: { ...process.env, OVS_TEST_SESSION_PATH: session },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          child.stdout.setEncoding("utf8");
          child.stdout.on("data", (chunk) => {
            if (String(chunk).includes("locked")) resolve();
          });
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Child lock did not start: ${stderr}`)),
            2_000,
          ),
        ),
      ]);
      child.kill(process.platform === "win32" ? undefined : "SIGKILL");
      await once(child, "exit");
      const recovered = new MutationFileLock(session, {
        acquireTimeoutMs: 1_000,
        staleAfterMs: 1,
        pollIntervalMs: 5,
      });
      await expect(recovered.run(async () => "recovered")).resolves.toBe(
        "recovered",
      );
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  });

  it("recovers a crash between atomic mkdir and owner metadata", async () => {
    const session = sessionPath();
    const lockPath = mutationLockPath(session);
    mkdirSync(lockPath, { mode: 0o700 });
    const stale = new Date("2000-01-01T00:00:00.000Z");
    utimesSync(lockPath, stale, stale);
    const lock = new MutationFileLock(session, {
      acquireTimeoutMs: 500,
      staleAfterMs: 1,
      pollIntervalMs: 5,
    });
    await expect(lock.run(async () => "recovered")).resolves.toBe("recovered");
    expect(
      readdirSync(join(session, "..")).some((name) =>
        name.startsWith("session.json.cart-mutation.lock.stale-missing-"),
      ),
    ).toBe(true);
  });

  it("recovers stale invalid owner JSON through a retained inode tombstone", async () => {
    const session = sessionPath();
    const lockPath = mutationLockPath(session);
    mkdirSync(lockPath, { mode: 0o700 });
    const owner = join(lockPath, "owner.json");
    writeFileSync(owner, '{"version":1', { mode: 0o600 });
    const stale = new Date("2000-01-01T00:00:00.000Z");
    utimesSync(owner, stale, stale);
    utimesSync(lockPath, stale, stale);
    const lock = new MutationFileLock(session, {
      acquireTimeoutMs: 500,
      staleAfterMs: 1,
      pollIntervalMs: 5,
    });
    await expect(lock.run(async () => "recovered")).resolves.toBe("recovered");
    expect(
      readdirSync(join(session, "..")).some((name) =>
        name.startsWith("session.json.cart-mutation.lock.stale-invalid-"),
      ),
    ).toBe(true);
  });

  it("times out loudly instead of stealing a stale-looking live lock", async () => {
    const session = sessionPath();
    const lockPath = mutationLockPath(session);
    mkdirSync(lockPath, { mode: 0o700 });
    writeFileSync(
      join(lockPath, "owner.json"),
      `${JSON.stringify({
        version: 1,
        token: randomUUID(),
        pid: process.pid,
        acquiredAt: "2000-01-01T00:00:00.000Z",
      })}\n`,
      { mode: 0o600 },
    );
    const lock = new MutationFileLock(session, {
      acquireTimeoutMs: 30,
      staleAfterMs: 1,
      pollIntervalMs: 5,
    });
    await expect(lock.run(async () => undefined)).rejects.toMatchObject({
      code: "OVS_CART_MUTATION_LOCK_TIMEOUT",
    });
  });
});
