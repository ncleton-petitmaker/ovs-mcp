import { z } from "zod";
export declare const OVS_ORIGIN = "https://www.officialveganshop.com";
export declare const sessionSchema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    backend: z.ZodLiteral<"ovs-website">;
    cookies: z.ZodRecord<z.ZodString, z.ZodString>;
    authenticatedAt: z.ZodString;
}, z.core.$strip>;
export type OvsSession = z.infer<typeof sessionSchema>;
export declare function resolveSessionPath(input?: string | undefined): string;
export declare function loadSession(path?: string): Promise<OvsSession>;
export declare function saveSession(path: string, session: OvsSession): Promise<void>;
export declare function publicSessionSummary(): Record<string, string>;
//# sourceMappingURL=session.d.ts.map