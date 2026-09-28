import type { DBClient } from '@/db/client';

// 业务代码统一面向 DBClient。
// - Cloudflare Workers: c.env.DB 是 D1Database，结构上满足 DBClient
// - Docker / Node: 由 sqlite-adapter 包装 node:sqlite 后注入
export type Env = {
  DOMAIN: string;
  BOT_TOKEN: string;
  BOT_SECRET: string;
  ADMIN_UID: string;
  ADMIN_GID: string;
  SPAM_PROVIDER?: string;
  LLM_API: string;
  LLM_MODEL: string;
  LLM_KEY: string;
  JEV_KEY?: string;
  DB: DBClient;
};
