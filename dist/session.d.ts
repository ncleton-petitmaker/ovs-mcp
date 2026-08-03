import { z } from "zod";
export declare const DEFAULT_BASE_URL = "https://www.officialveganshop.com/module/vtj_api";
export declare const sessionSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    baseUrl: z.ZodLiteral<"https://www.officialveganshop.com/module/vtj_api">;
    headers: z.ZodObject<{
        authorization: z.ZodString;
        deviceUuid: z.ZodString;
        appVersion: z.ZodString;
        os: z.ZodString;
        osVersion: z.ZodString;
        userAgent: z.ZodString;
        acceptLanguage: z.ZodString;
    }, z.core.$strip>;
    credentials: z.ZodObject<{
        token: z.ZodString;
        refreshToken: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type OvsSession = z.infer<typeof sessionSchema>;
export declare function resolveSessionPath(input?: string | undefined): string;
export declare function loadSession(path?: string): Promise<OvsSession>;
export declare function saveSession(path: string, session: OvsSession): Promise<void>;
export declare function publicSessionSummary(session: OvsSession): Record<string, string>;
//# sourceMappingURL=session.d.ts.map