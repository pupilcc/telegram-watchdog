import { Hono } from 'hono'
import { Bot, webhookCallback, InlineKeyboard } from 'grammy';
import { Env } from '@/env';
import { startCommand } from '@/bot/command';
import { messageFilterMiddleware } from '@/bot/middleware';
import { messageHandler } from '@/bot/message';
import { initDatabase } from '@/db/init';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// Create a bot instance using the BOT_TOKEN from environment variables
let bot: Bot | undefined;
const WEBHOOK_PATH = "/webhook"

app.use(async (c, next) => {
  if (!bot) {
    bot = new Bot(c.env.BOT_TOKEN);

    // 初始化数据库
    await initDatabase(c.env);

    await bot.api.setWebhook(c.env.DOMAIN + WEBHOOK_PATH, {"secret_token": c.env.BOT_SECRET});

    bot.use(messageFilterMiddleware(c.env))

    // bot.command("start", startCommand);
    bot.on("message", messageHandler(c.env));
  }
  await next();
});

// Webhook endpoint for Telegram
app.post(WEBHOOK_PATH, async (c) => {
  if (!bot) {
    return c.text('Internal Server Error: Bot not initialized', 500);
  }

  // Use the webhookCallback to handle the webhook request
  const handler = webhookCallback(bot, 'hono', {secretToken: c.env.BOT_SECRET});
  return await handler(c);
})

export default app
