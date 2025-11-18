import { Context, NextFunction } from "grammy"; // 导入 NextFunction 类型
import { Env } from '@/env';
import { detectSpam } from '@/llm/client';


export const messageFilterMiddleware = (env: Env) => async (ctx: Context, next: NextFunction) => {
  // 只处理普通消息，忽略命令
  if (!ctx.message?.text || ctx.message.text.startsWith('/')) {
    await next();
    return;
  }

  const messageText = ctx.message.text;
  const senderUser = ctx.from;

  if (!senderUser) {
    await ctx.reply('222');
    await next();
    return;
  }

  // 获取发送者的姓名
  const senderName = `${senderUser.first_name || ''}${senderUser.last_name ? ' ' + senderUser.last_name : ''}`.trim();

  const senderId = senderUser.id;
  const chatId = ctx.chat?.id;

  try {
    // 调用 AI API 判断是否为垃圾信息
    const judgment = await detectSpam(env, senderName, messageText);

    // 如果判定为垃圾信息
    if (judgment.startsWith('SPAM')) {
      // 发送到管理群组（如果配置了管理群组 ID）
      if (env.ADMIN_GID && chatId) {
        // 先转发原消息到管理群组
        const forwardedMessage = await ctx.api.forwardMessage(
          env.ADMIN_GID,
          chatId,
          ctx.message.message_id
        );

        // 获取当前时间并格式化为 UTC+8 (yyyy-MM-dd HH:mm:ss)
        const now = new Date();
        const utcPlus8Ms = now.getTime() + 8 * 60 * 60 * 1000;
        const utcPlus8Date = new Date(utcPlus8Ms);

        const year = utcPlus8Date.getUTCFullYear();
        const month = String(utcPlus8Date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(utcPlus8Date.getUTCDate()).padStart(2, '0');
        const hours = String(utcPlus8Date.getUTCHours()).padStart(2, '0');
        const minutes = String(utcPlus8Date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(utcPlus8Date.getUTCSeconds()).padStart(2, '0');

        const utcPlus8Time = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

        // 回复转发的消息，发送警告信息
        await ctx.api.sendMessage(
          env.ADMIN_GID,
          `🚨 垃圾信息警告\n\n` +
          `发送者: ${senderName}${senderUser.username ? ` (@${senderUser.username})` : ''} (ID: ${senderId})\n` +
          `AI 判定: ${judgment}\n` +
          `时间: ${utcPlus8Time}`,
          { reply_to_message_id: forwardedMessage.message_id }
        );
      }

      // 警告发送者
      await ctx.reply(
        "您的消息因包含垃圾信息已被过滤。如有疑问，请联系管理员。",
        { reply_to_message_id: ctx.message.message_id }
      );

      return; // 阻止消息传递到后续处理函数
    }

    // 消息通过过滤，继续处理
    await next();
  } catch (error) {
    // 出错时默认放行消息，避免误杀
    await ctx.reply('抱歉，中间件处理失败');
    // await next();
  }
};