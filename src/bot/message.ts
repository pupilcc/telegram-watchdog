import { Context } from "grammy";
import { Env } from '@/env';
import { getOrCreateUserTopic, unpinTopicStarterMessage } from '@/bot/forum';
import { getUserIdByTopicId } from '@/db/topics';

/**
 * 消息处理器：实现用户与管理员之间的消息转发
 * 支持两种模式：
 * 1. 私聊模式：用户私聊 Bot，消息转发到管理员私聊或管理群组的用户专属 Topic
 * 2. 群组模式：管理员在群组 Topic 内回复，Bot 转发给用户
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
  const adminGid = env.ADMIN_GID ? String(env.ADMIN_GID) : null;

  // 检查聊天类型
  const chatType = ctx.chat?.type;
  const isPrivateChat = chatType === 'private';
  const isGroupChat = chatType === 'supergroup' || chatType === 'group';

  // 情况1：普通用户私聊 Bot，转发到管理群组的用户专属 Topic
  if (isPrivateChat && senderId !== adminUid) {
    try {
      // 获取发送者姓名
      const senderName = `${senderUser.first_name || ''}${senderUser.last_name ? ' ' + senderUser.last_name : ''}`.trim();
      const displayName = senderName || `User ${senderId}`;

      // 如果配置了管理群组，使用 Topic 模式
      if (adminGid) {
        // 获取或创建用户专属 Topic
        const userTopic = await getOrCreateUserTopic(ctx.api, env, String(senderId), displayName);

        // 转发到管理群组（如果有 Topic 则发送到 Topic）
        const forwardedMessage = await ctx.api.forwardMessage(
          adminGid,
          senderId,
          ctx.message.message_id,
          userTopic ? { message_thread_id: userTopic.topicId } : undefined
        );

        // Telegram 会自动置顶新 Topic 的首条消息，须在转发后取消。
        if (userTopic?.created) {
          await unpinTopicStarterMessage(ctx.api, adminGid, forwardedMessage.message_id);
        }

        // 存储消息映射关系
        await env.DB.prepare(`
          INSERT INTO message_mappings (forwarded_message_id, original_user_chat_id, created_at)
          VALUES (?, ?, ?)
        `).bind(
          forwardedMessage.message_id,
          String(senderId),
          Date.now()
        ).run();
      } else {
        // 回退：转发到管理员私聊
        const forwardedMessage = await ctx.api.forwardMessage(
          adminUid,
          senderId,
          ctx.message.message_id
        );

        await env.DB.prepare(`
          INSERT INTO message_mappings (forwarded_message_id, original_user_chat_id, created_at)
          VALUES (?, ?, ?)
        `).bind(
          forwardedMessage.message_id,
          String(senderId),
          Date.now()
        ).run();
      }
    } catch (error) {
      console.error('Failed to relay user message to admin:', {
        senderId,
        chatId,
      }, error);
      await ctx.reply('抱歉，消息发送失败，请稍后重试。');
    }

    return;
  }

  // 情况2：管理员私聊 Bot 回复消息
  if (isPrivateChat && senderId === adminUid) {
    const replyToMessage = ctx.message?.reply_to_message;

    if (!replyToMessage) {
      console.warn('Admin private reply rejected: no replied-to message', {
        senderId,
        chatId,
      });
      await ctx.reply('请回复一条用户消息以发送回复。');
      return;
    }

    try {
      const result = await env.DB.prepare(`
        SELECT original_user_chat_id
        FROM message_mappings
        WHERE forwarded_message_id = ?
      `).bind(replyToMessage.message_id).first<{ original_user_chat_id: string }>();

      if (!result) {
        console.warn('Admin private reply rejected: original user not found', {
          senderId,
          chatId,
          replyToMessageId: replyToMessage.message_id,
        });
        await ctx.reply('无法找到原始用户信息。');
        return;
      }

      await ctx.api.sendMessage(
        Number(result.original_user_chat_id),
        `${msg}`
      );
    } catch (error) {
      console.error('Failed to relay admin private reply to user:', {
        senderId,
        chatId,
        replyToMessageId: replyToMessage.message_id,
      }, error);
      await ctx.reply('❌ 回复发送失败，请检查用户是否已屏蔽机器人。');
    }

    return;
  }

  // 情况3：在管理群组 Topic 内发消息
  if (isGroupChat && adminGid && String(chatId) === adminGid) {
    const replyToMessage = ctx.message?.reply_to_message;
    const messageThreadId = ctx.message?.message_thread_id;

    // 必须在某个 Topic 内
    if (!messageThreadId) {
      return;
    }

    try {
      let targetUserId: string | null = null;

      // 优先：如果回复了某条消息，尝试从消息映射中查找用户
      if (replyToMessage) {
        const mappingResult = await env.DB.prepare(`
          SELECT original_user_chat_id
          FROM message_mappings
          WHERE forwarded_message_id = ?
        `).bind(replyToMessage.message_id).first<{ original_user_chat_id: string }>();

        if (mappingResult) {
          targetUserId = mappingResult.original_user_chat_id;
        }
      }

      // 回退：通过 Topic ID 查找用户（在用户 Topic 内直接发消息）
      if (!targetUserId) {
        targetUserId = await getUserIdByTopicId(env.DB, messageThreadId);
      }

      if (!targetUserId) {
        // 无法确定目标用户，静默返回（可能是 Spam Topic 或其他系统 Topic）
        return;
      }

      // 发送消息给用户
      await ctx.api.sendMessage(
        Number(targetUserId),
        `${msg}`
      );
    } catch (error) {
      console.error('Failed to relay admin topic message to user:', {
        senderId,
        chatId,
        messageThreadId,
        replyToMessageId: replyToMessage?.message_id,
      }, error);
      await ctx.reply('❌ 回复发送失败，请检查用户是否已屏蔽机器人。');
    }

    return;
  }
};
