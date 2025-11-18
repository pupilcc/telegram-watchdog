import { Context } from "grammy";
import { Env } from '@/env';

/**
 * 消息处理器：实现用户与管理员之间的消息转发
 * @param env - 环境变量
 */
export const messageHandler = (env: Env) => async (ctx: Context) => {
  const chatId = ctx.chatId;
  const msg = ctx.message?.text;
  const senderUser = ctx.from;

  if (!senderUser || !msg || !chatId) {
    return;
  }

  if (msg.startsWith('/')) {
    return;
  }

  const senderId = senderUser.id;
  const adminUid = Number(env.ADMIN_UID);

  // 检查是否是私聊消息
  const isPrivateChat = ctx.chat?.type === 'private';

  if (!isPrivateChat) {
    // 不是私聊消息，不处理
    return;
  }

  // 情况1：普通用户给 bot 发送消息，转发给管理员
  if (senderId !== adminUid) {

    try {
      // 使用 forwardMessage 转发原始消息给管理员
      const forwardedMessage = await ctx.api.forwardMessage(
        adminUid,
        senderId,
        ctx.message.message_id
      );

      // 存储消息映射关系：bot转发的消息ID -> 原始用户的chatID
      // 用于管理员回复时找到原始用户
      await env.DB.prepare(`
        INSERT INTO message_mappings (forwarded_message_id, original_user_chat_id, created_at)
        VALUES (?, ?, ?)
      `).bind(
        forwardedMessage.message_id,
        String(senderId),
        Date.now()
      ).run();

    } catch (error) {
      await ctx.reply('抱歉，消息发送失败，请稍后重试。');
    }

    return;
  }

  // 情况2：管理员回复消息，转发给原始用户
  if (senderId === adminUid) {
    // 检查管理员是否在回复某条消息
    const replyToMessage = ctx.message?.reply_to_message;

    if (!replyToMessage) {
      // 管理员没有回复任何消息，可能是管理员直接给 bot 发消息
      await ctx.reply('请回复一条用户消息以发送回复。');
      return;
    }

    try {
      // 从 D1 中查找原始用户的 chat ID
      const result = await env.DB.prepare(`
        SELECT original_user_chat_id
        FROM message_mappings
        WHERE forwarded_message_id = ?
      `).bind(replyToMessage.message_id).first<{ original_user_chat_id: string }>();

      if (!result) {
        await ctx.reply('无法找到原始用户信息。');
        return;
      }

      // 转发管理员的回复给原始用户
      await ctx.api.sendMessage(
        Number(result.original_user_chat_id),
        `${msg}`
      );

    } catch (error) {
      await ctx.reply('❌ 回复发送失败，请检查用户是否已屏蔽机器人。');
    }

    return;
  }
};
