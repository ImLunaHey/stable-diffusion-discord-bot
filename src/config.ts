import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const env = createEnv({
    isServer: true,
    server: {
        NODE_ENV: z.string().default('development'),
        BOT_TOKEN: z.string(),
    },
    runtimeEnv: process.env,
});

export const config = {
    environment: env.NODE_ENV,
    botToken: env.BOT_TOKEN,
};
