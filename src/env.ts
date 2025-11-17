// Define environment variable types for Cloudflare Workers
export type Env = {
  DOMAIN: string;
  BOT_TOKEN: string;
  BOT_SECRET: string;
  ADMIN_UID: string;
  ADMIN_GID: string;
  LLM_API: string;
  LLM_MODEL: string;
  LLM_KEY: string;
  DB: D1Database;
};
