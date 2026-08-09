export interface MutationLockOptions {
    acquireTimeoutMs?: number;
    staleAfterMs?: number;
    pollIntervalMs?: number;
}
export declare class MutationFileLock {
    #private;
    constructor(sessionPath: string, options?: MutationLockOptions);
    run<T>(operation: () => Promise<T>): Promise<T>;
}
export declare function mutationLockPath(sessionPath: string): string;
//# sourceMappingURL=mutation-lock.d.ts.map