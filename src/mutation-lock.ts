import { randomUUID } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { OvsError } from "./errors.js";

const DEFAULT_ACQUIRE_TIMEOUT_MS = 15_000;
const DEFAULT_STALE_AFTER_MS = 5_000;
const DEFAULT_POLL_INTERVAL_MS = 100;
type FileIdentity = ReturnType<typeof statSync>;

interface LockOwner {
  version: 1;
  token: string;
  pid: number;
  acquiredAt: string;
}

interface MissingOwnerRecovery {
  version: 1;
  missingOwnerRecovery: true;
  token: string;
  device: number;
  inode: number;
}

export interface MutationLockOptions {
  acquireTimeoutMs?: number;
  staleAfterMs?: number;
  pollIntervalMs?: number;
}

export class MutationFileLock {
  readonly #lockPath: string;
  readonly #acquireTimeoutMs: number;
  readonly #staleAfterMs: number;
  readonly #pollIntervalMs: number;

  constructor(sessionPath: string, options: MutationLockOptions = {}) {
    if (!sessionPath)
      throw new Error("OVS mutation lock requires a session path.");
    this.#lockPath = mutationLockPath(sessionPath);
    this.#acquireTimeoutMs = positiveDuration(
      options.acquireTimeoutMs,
      DEFAULT_ACQUIRE_TIMEOUT_MS,
      "acquire timeout",
    );
    this.#staleAfterMs = positiveDuration(
      options.staleAfterMs,
      DEFAULT_STALE_AFTER_MS,
      "stale threshold",
    );
    this.#pollIntervalMs = positiveDuration(
      options.pollIntervalMs,
      DEFAULT_POLL_INTERVAL_MS,
      "poll interval",
    );
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.#acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async #acquire(): Promise<() => void> {
    const deadline = performance.now() + this.#acquireTimeoutMs;
    while (true) {
      const owner = this.#tryCreate();
      if (owner) return () => this.#release(owner);
      this.#recoverDeadOwner();
      if (performance.now() >= deadline) {
        throw new OvsError(
          "Another OVS cart mutation still owns this private session. Retry after it finishes; if the process crashed, wait for stale-lock recovery instead of deleting runtime files manually.",
          "OVS_CART_MUTATION_LOCK_TIMEOUT",
          true,
        );
      }
      await delay(
        Math.min(
          this.#pollIntervalMs,
          Math.max(1, deadline - performance.now()),
        ),
      );
    }
  }

  #tryCreate(): LockOwner | null {
    const owner: LockOwner = {
      version: 1,
      token: randomUUID(),
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    };
    let createdIdentity: FileIdentity;
    try {
      mkdirSync(this.#lockPath, { mode: 0o700 });
      createdIdentity = statSync(this.#lockPath);
    } catch (error) {
      if (isCode(error, "EEXIST")) return null;
      throw error;
    }
    try {
      const temporaryOwner = `${this.#lockPath}/owner-${owner.token}.tmp`;
      // A crash can leave only this disposable temp file. owner.json itself
      // appears through one atomic, no-overwrite hard link and is never partial.
      writeFileSync(temporaryOwner, `${JSON.stringify(owner)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      linkSync(temporaryOwner, ownerPath(this.#lockPath));
      unlinkSync(temporaryOwner);
      return owner;
    } catch (error) {
      // A failure after mkdir belongs to this attempt. Renaming to a unique
      // path makes cleanup path-stable and cannot remove a later owner.
      const abandoned = `${this.#lockPath}.abandoned-${owner.token}`;
      try {
        const currentIdentity = statSync(this.#lockPath);
        if (
          currentIdentity.dev === createdIdentity.dev &&
          currentIdentity.ino === createdIdentity.ino
        ) {
          renameSync(this.#lockPath, abandoned);
          rmSync(abandoned, { recursive: true, force: true });
        }
      } catch {
        // The original error is more actionable; a later acquisition will
        // fail loudly rather than guessing ownership.
      }
      throw error;
    }
  }

  #release(owner: LockOwner): void {
    const current = readOwner(this.#lockPath);
    if (
      !current ||
      current.token !== owner.token ||
      current.pid !== owner.pid
    ) {
      throw new OvsError(
        "OVS cart mutation lock ownership changed before release.",
        "OVS_CART_MUTATION_LOCK_LOST",
      );
    }
    const released = `${this.#lockPath}.released-${owner.token}`;
    renameSync(this.#lockPath, released);
    rmSync(released, { recursive: true, force: true });
  }

  #recoverDeadOwner(): void {
    const owner = readOwner(this.#lockPath);
    if (!owner) {
      this.#recoverMissingOwner();
      return;
    }
    const acquiredAt = Date.parse(owner.acquiredAt);
    if (
      !Number.isFinite(acquiredAt) ||
      Date.now() - acquiredAt < this.#staleAfterMs ||
      processIsAlive(owner.pid)
    ) {
      return;
    }
    let identity: FileIdentity;
    try {
      identity = statSync(this.#lockPath);
    } catch (error) {
      if (isCode(error, "ENOENT")) return;
      throw error;
    }
    const quarantine = `${this.#lockPath}.stale-${owner.token}-${identity.dev}-${identity.ino}`;
    const latest = readOwner(this.#lockPath);
    let latestIdentity: FileIdentity;
    try {
      latestIdentity = statSync(this.#lockPath);
    } catch (error) {
      if (isCode(error, "ENOENT")) return;
      throw error;
    }
    if (
      !latest ||
      latest.token !== owner.token ||
      latest.pid !== owner.pid ||
      latestIdentity.dev !== identity.dev ||
      latestIdentity.ino !== identity.ino ||
      processIsAlive(owner.pid)
    ) {
      return;
    }
    try {
      // The quarantine is intentionally retained and non-empty. Every stale
      // observer of this exact inode/token chooses the same destination, so a
      // delayed observer can never rename or delete a new lock (ABA guard).
      renameSync(this.#lockPath, quarantine);
    } catch (error) {
      if (
        isCode(error, "ENOENT") ||
        isCode(error, "EEXIST") ||
        isCode(error, "ENOTEMPTY")
      ) {
        return;
      }
      throw error;
    }
  }

  #recoverMissingOwner(): void {
    let identity: FileIdentity;
    try {
      identity = statSync(this.#lockPath);
    } catch (error) {
      if (isCode(error, "ENOENT")) return;
      throw error;
    }
    let recovery = readMissingOwnerRecovery(this.#lockPath);
    if (!recovery) {
      if (ownerFileExists(this.#lockPath)) {
        let invalidOwnerIdentity: FileIdentity;
        try {
          invalidOwnerIdentity = statSync(ownerPath(this.#lockPath));
        } catch (error) {
          if (isCode(error, "ENOENT")) return;
          throw error;
        }
        if (Date.now() - invalidOwnerIdentity.mtimeMs < this.#staleAfterMs)
          return;
        let latestIdentity: FileIdentity;
        try {
          latestIdentity = statSync(this.#lockPath);
        } catch (error) {
          if (isCode(error, "ENOENT")) return;
          throw error;
        }
        if (
          latestIdentity.dev !== identity.dev ||
          latestIdentity.ino !== identity.ino
        ) {
          return;
        }
        const quarantine = `${this.#lockPath}.stale-invalid-${identity.dev}-${identity.ino}`;
        try {
          // The invalid owner already makes this directory non-empty, so the
          // retained destination is itself the ABA barrier for late reapers.
          renameSync(this.#lockPath, quarantine);
        } catch (error) {
          if (
            isCode(error, "ENOENT") ||
            isCode(error, "EEXIST") ||
            isCode(error, "ENOTEMPTY")
          ) {
            return;
          }
          throw error;
        }
        return;
      }
      if (Date.now() - identity.mtimeMs < this.#staleAfterMs) {
        return;
      }
      recovery = {
        version: 1,
        missingOwnerRecovery: true,
        token: randomUUID(),
        device: identity.dev,
        inode: identity.ino,
      };
      try {
        // Claiming owner.json with wx prevents a paused original acquirer from
        // later believing it owns this directory.
        writeFileSync(
          ownerPath(this.#lockPath),
          `${JSON.stringify(recovery)}\n`,
          { encoding: "utf8", mode: 0o600, flag: "wx" },
        );
      } catch (error) {
        if (isCode(error, "EEXIST") || isCode(error, "ENOENT")) return;
        throw error;
      }
    }
    let latestIdentity: FileIdentity;
    try {
      latestIdentity = statSync(this.#lockPath);
    } catch (error) {
      if (isCode(error, "ENOENT")) return;
      throw error;
    }
    const latestRecovery = readMissingOwnerRecovery(this.#lockPath);
    if (
      !latestRecovery ||
      latestRecovery.token !== recovery.token ||
      latestIdentity.dev !== recovery.device ||
      latestIdentity.ino !== recovery.inode
    ) {
      return;
    }
    const quarantine = `${this.#lockPath}.stale-missing-${recovery.token}-${recovery.device}-${recovery.inode}`;
    try {
      // As with normal stale owners, retain this non-empty destination as the
      // permanent ABA tombstone for every delayed observer of the old inode.
      renameSync(this.#lockPath, quarantine);
    } catch (error) {
      if (
        isCode(error, "ENOENT") ||
        isCode(error, "EEXIST") ||
        isCode(error, "ENOTEMPTY")
      ) {
        return;
      }
      throw error;
    }
  }
}

export function mutationLockPath(sessionPath: string): string {
  return `${sessionPath}.cart-mutation.lock`;
}

function ownerPath(lockPath: string): string {
  return `${lockPath}/owner.json`;
}

function readOwner(lockPath: string): LockOwner | null {
  try {
    const value = JSON.parse(
      readFileSync(ownerPath(lockPath), "utf8"),
    ) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const owner = value as Record<string, unknown>;
    if (
      owner.version !== 1 ||
      typeof owner.token !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        owner.token,
      ) ||
      typeof owner.pid !== "number" ||
      !Number.isInteger(owner.pid) ||
      owner.pid < 1 ||
      typeof owner.acquiredAt !== "string"
    ) {
      return null;
    }
    return owner as unknown as LockOwner;
  } catch (error) {
    if (isCode(error, "ENOENT") || error instanceof SyntaxError) return null;
    throw error;
  }
}

function readMissingOwnerRecovery(
  lockPath: string,
): MissingOwnerRecovery | null {
  try {
    const value = JSON.parse(
      readFileSync(ownerPath(lockPath), "utf8"),
    ) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const recovery = value as Record<string, unknown>;
    if (
      recovery.version !== 1 ||
      recovery.missingOwnerRecovery !== true ||
      typeof recovery.token !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        recovery.token,
      ) ||
      typeof recovery.device !== "number" ||
      typeof recovery.inode !== "number"
    ) {
      return null;
    }
    return recovery as unknown as MissingOwnerRecovery;
  } catch (error) {
    if (isCode(error, "ENOENT") || error instanceof SyntaxError) return null;
    throw error;
  }
}

function ownerFileExists(lockPath: string): boolean {
  try {
    statSync(ownerPath(lockPath));
    return true;
  } catch (error) {
    if (isCode(error, "ENOENT")) return false;
    throw error;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isCode(error, "ESRCH");
  }
}

function positiveDuration(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const duration = value ?? fallback;
  if (!Number.isFinite(duration) || duration < 1)
    throw new Error(`OVS mutation lock ${label} must be positive.`);
  return duration;
}

function isCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === code,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
