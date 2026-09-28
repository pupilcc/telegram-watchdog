import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { webhookCallback } from 'grammy';
import { serve } from '@hono/node-server';
import type { Env } from '@/env';
import { initDatabase } from '@/db/init';
import { createSqliteClient } from '@/db/sqlite-adapter';
import { setupBot, WEBHOOK_PATH } from '@/app';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function buildEnv(): { env: Env; sqlite: DatabaseSync } {
  const spamProvider = process.env.SPAM_PROVIDER ?? 'llm';
  if (spamProvider !== 'llm' && spamProvider !== 'jev') {
    throw new Error('SPAM_PROVIDER must be llm or jev');
  }
  const dbPath = process.env.DB_PATH ?? '/data/watchdog.db';
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA foreign_keys = ON');

  return {
    sqlite,
    env: {
      DOMAIN: requireEnv('DOMAIN'),
      BOT_TOKEN: requireEnv('BOT_TOKEN'),
      BOT_SECRET: requireEnv('BOT_SECRET'),
      ADMIN_UID: requireEnv('ADMIN_UID'),
      ADMIN_GID: process.env.ADMIN_GID ?? '',
      SPAM_PROVIDER: spamProvider,
      LLM_API: spamProvider === 'llm' ? requireEnv('LLM_API') : '',
      LLM_MODEL: process.env.LLM_MODEL ?? 'gpt-3.5-turbo',
      LLM_KEY: spamProvider === 'llm' ? requireEnv('LLM_KEY') : '',
      JEV_KEY: spamProvider === 'jev' ? requireEnv('JEV_KEY') : undefined,
      DB: createSqliteClient(sqlite),
    },
  };
}

async function main(): Promise<void> {
  const { env, sqlite } = buildEnv();

  await initDatabase(env);

  const bot = setupBot(env);
  await bot.init();
  await bot.api.setWebhook(env.DOMAIN + WEBHOOK_PATH, {
    secret_token: env.BOT_SECRET,
  });

  const app = new Hono();
  app.get('/', (c) => c.text('Hello Hono!'));
  app.post(
    WEBHOOK_PATH,
    webhookCallback(bot, 'hono', { secretToken: env.BOT_SECRET })
  );

  const port = Number(process.env.PORT ?? 3000);
  const server = serve({ fetch: app.fetch, port });
  console.log(
    `telegram-watchdog listening on :${port} (webhook ${env.DOMAIN}${WEBHOOK_PATH})`
  );

  // 容器停止时收到 SIGTERM：关掉 HTTP 服务并让 SQLite 正常 checkpoint WAL。
  let shuttingDown = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`Received ${signal}, shutting down...`);
      server.close(() => {
        sqlite.close();
        process.exit(0);
      });
    });
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
