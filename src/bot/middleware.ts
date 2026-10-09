import { Context, NextFunction } from "grammy"; // 导入 NextFunction 类型
import { Env } from '@/env';
import { detectSpam } from '@/llm/client';
import {
  getUserTrust,
  createUserTrust,
  incrementCleanCount,
  recordSpam,
  checkAndPromoteToWhitelist,
} from '@/db/trust';
import { WHITELIST_CONFIG } from '@/config';
import { getOrCreateSpamTopic, unpinTopicStarterMessage } from '@/bot/forum';


export const messageFilterMiddleware = (env: Env) => async (ctx: Context, next: NextFunction) => {
  // 只处理普通消息，忽略命令
  if (!ctx.message?.text || ctx.message.text.startsWith('/')) {
    await next();
    return;
  }

  const messageText = ctx.message.text;
  const senderUser = ctx.from;

  if (!senderUser) {
    console.warn('Message filter skipped: sender information missing', {
      updateId: ctx.update.update_id,
      chatId: ctx.chat?.id,
    });
    await ctx.reply('222');
    await next();
    return;
  }

  // 管理员消息直接放行，不参与白名单统计或 AI 检测
  if (senderUser.id === Number(env.ADMIN_UID)) {
    await next();
    return;
  }

  // 获取发送者的姓名
  const senderName = `${senderUser.first_name || ''}${senderUser.last_name ? ' ' + senderUser.last_name : ''}`.trim();

  const senderId = senderUser.id;
  const chatId = ctx.chat?.id;

  try {
    // 查询用户信任状态
    let trustInfo = await getUserTrust(env.DB, senderId.toString());

    // 如果是首次发消息的用户，创建记录
    if (!trustInfo) {
      await createUserTrust(env.DB, senderId.toString(), senderUser.username);
      trustInfo = {
        user_id: senderId.toString(),
        username: senderUser.username || null,
        trust_status: 'new',
        consecutive_clean_count: 0,
        total_spam_count: 0,
        whitelisted_at: null,
        whitelisted_by: null,
        last_message_at: Date.now(),
        created_at: Date.now(),
      };
    }

    // 如果是白名单用户，直接放行
    if (trustInfo.trust_status === 'trusted') {
      await next();
      return;
    }

    // 非白名单用户需要进行 AI 检测
    // 调用 AI API 判断是否为垃圾信息
    let judgment: string;
    try {
      judgment = await detectSpam(env, senderName, messageText);
    } catch (error) {
      console.error('Spam detection failed:', { senderId, chatId }, error);
      await next();
      return;
    }

    // 如果判定为垃圾信息
    if (judgment.startsWith('SPAM')) {
      // 记录垃圾消息（重置连续通过次数，增加垃圾消息计数）
      await recordSpam(env.DB, senderId.toString());

      // 发送到管理群组（如果配置了管理群组 ID）
      if (env.ADMIN_GID && chatId) {
        // 获取或创建 Spam Topic
        const spamTopic = await getOrCreateSpamTopic(ctx.api, env);

        // 先转发原消息到管理群组（如果有 Topic 则发送到 Topic）
        const forwardedMessage = await ctx.api.forwardMessage(
          env.ADMIN_GID,
          chatId,
          ctx.message.message_id,
          spamTopic ? { message_thread_id: spamTopic.topicId } : undefined
        );

        // Telegram 会自动置顶新 Topic 的首条消息，须在转发后取消。
        if (spamTopic?.created) {
          await unpinTopicStarterMessage(ctx.api, env.ADMIN_GID, forwardedMessage.message_id);
        }

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

        // 回复转发的消息，发送警告信息（同一 Topic）
        await ctx.api.sendMessage(
          env.ADMIN_GID,
          `🚨 垃圾信息警告\n\n` +
          `发送者: ${senderName}${senderUser.username ? ` (@${senderUser.username})` : ''} (ID: ${senderId})\n` +
          `AI 判定: ${judgment}\n` +
          `时间: ${utcPlus8Time}`,
          {
            reply_to_message_id: forwardedMessage.message_id,
            ...(spamTopic ? { message_thread_id: spamTopic.topicId } : {})
          }
        );
      }

      // 警告发送者
      console.warn('Message blocked as spam', {
        senderId,
        chatId,
        judgment,
      });
      await ctx.reply(
        "您的消息因包含垃圾信息已被过滤。如有疑问，请联系管理员。",
        { reply_to_message_id: ctx.message.message_id }
      );

      return; // 阻止消息传递到后续处理函数
    }

    // 消息通过 AI 检测，增加连续通过次数
    await incrementCleanCount(env.DB, senderId.toString());

    // 检查是否达到自动加白条件
    const wasPromoted = await checkAndPromoteToWhitelist(env.DB, senderId.toString());

    // 如果用户被自动加白，可选通知管理员
    if (wasPromoted && WHITELIST_CONFIG.NOTIFY_ADMIN_ON_AUTO_WHITELIST && env.ADMIN_UID) {
      await ctx.api.sendMessage(
        env.ADMIN_UID,
        `✅ 用户 ${senderName}${senderUser.username ? ` (@${senderUser.username})` : ''} 已自动加入白名单（连续通过 ${WHITELIST_CONFIG.REQUIRED_CLEAN_COUNT} 次检测）`
      );
    }

    // 消息通过过滤，继续处理
    await next();
  } catch (error) {
    console.error('Message filter middleware failed:', {
      senderId,
      chatId,
    }, error);
    await ctx.reply('抱歉，中间件处理失败');
    // await next();
  }
};
