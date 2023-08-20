import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const env = createEnv({
    isServer: true,
    server: {
        DATABASE_URL: z.string().url(),
        OPEN_AI_API_KEY: z.string().min(1),
    },
    runtimeEnv: process.env,
});

export const config = env;
