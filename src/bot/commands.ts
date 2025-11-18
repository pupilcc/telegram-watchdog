import { Bot, Context } from 'grammy';
import { Env } from '@/env';
import { manuallyWhitelistUser, removeFromWhitelist } from '@/db/trust';

/**
 * Register admin commands for managing user trust
 */
export function registerAdminCommands(bot: Bot, env: Env) {
  // /trust command - manually whitelist a user
  bot.command('trust', async (ctx: Context) => {
    await handleTrustCommand(ctx, env);
  });

  // /untrust command - remove user from whitelist
  bot.command('untrust', async (ctx: Context) => {
    await handleUntrustCommand(ctx, env);
  });
}

/**
 * Handle /trust command - manually add user to whitelist
 */
async function handleTrustCommand(ctx: Context, env: Env): Promise<void> {
  try {
    // 1. Verify admin identity
    if (ctx.from?.id !== Number(env.ADMIN_UID)) {
      return; // Ignore non-admin users
    }

    // 2. Check if replying to a message
    const replyTo = ctx.message?.reply_to_message;
    if (!replyTo) {
      await ctx.reply('❌ 请回复要信任的用户消息');
      return;
    }

    // 3. Query original user from message mappings
    const mapping = await env.DB.prepare(
      'SELECT original_user_chat_id FROM message_mappings WHERE forwarded_message_id = ?'
    )
      .bind(replyTo.message_id)
      .first<{ original_user_chat_id: string }>();

    if (!mapping) {
      await ctx.reply('❌ 无法找到原始用户');
      return;
    }

    const originalUserId = mapping.original_user_chat_id;

    // Get username from the forwarded message if available
    const username = replyTo.from?.username;

    // 4. Manually whitelist the user
    await manuallyWhitelistUser(env.DB, originalUserId, username);

    // 5. Reply with confirmation
    await ctx.reply('✅ 用户已手动加入白名单');
  } catch (error) {
    console.error('Error in /trust command:', error);
    await ctx.reply('❌ 处理命令时出错，请稍后重试');
  }
}

/**
 * Handle /untrust command - remove user from whitelist
 */
async function handleUntrustCommand(ctx: Context, env: Env): Promise<void> {
  try {
    // 1. Verify admin identity
    if (ctx.from?.id !== Number(env.ADMIN_UID)) {
      return; // Ignore non-admin users
    }

    // 2. Check if replying to a message
    const replyTo = ctx.message?.reply_to_message;
    if (!replyTo) {
      await ctx.reply('❌ 请回复要取消信任的用户消息');
      return;
    }

    // 3. Query original user from message mappings
    const mapping = await env.DB.prepare(
      'SELECT original_user_chat_id FROM message_mappings WHERE forwarded_message_id = ?'
    )
      .bind(replyTo.message_id)
      .first<{ original_user_chat_id: string }>();

    if (!mapping) {
      await ctx.reply('❌ 无法找到原始用户');
      return;
    }

    const originalUserId = mapping.original_user_chat_id;

    // 4. Remove user from whitelist
    await removeFromWhitelist(env.DB, originalUserId);

    // 5. Reply with confirmation
    await ctx.reply('⚠️ 用户已移除白名单，重新进入监控');
  } catch (error) {
    console.error('Error in /untrust command:', error);
    await ctx.reply('❌ 处理命令时出错，请稍后重试');
  }
}
