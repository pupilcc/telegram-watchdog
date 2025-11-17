import { Context } from "grammy";

export const startCommand = (ctx: Context) => {
  return ctx.reply('👋 Runing.');
};
