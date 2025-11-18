import { Env } from '@/env';

/**
 * 初始化数据库表结构
 * @param env - 环境变量
 */
export async function initDatabase(env: Env): Promise<void> {
  // 创建消息映射表
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS message_mappings (
      forwarded_message_id INTEGER PRIMARY KEY,
      original_user_chat_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();

  // 创建索引用于清理过期数据
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_created_at
    ON message_mappings(created_at)
  `).run();

  // 创建用户信任度表
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_trust (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      trust_status TEXT NOT NULL,
      consecutive_clean_count INTEGER DEFAULT 0,
      total_spam_count INTEGER DEFAULT 0,
      whitelisted_at INTEGER,
      whitelisted_by TEXT,
      last_message_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `).run();

  // 创建信任状态索引
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_trust_status
    ON user_trust(trust_status)
  `).run();
}

/**
 * 清理过期的消息映射（超过24小时）
 * @param env - 环境变量
 */
export async function cleanupExpiredMappings(env: Env): Promise<void> {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  await env.DB.prepare(`
    DELETE FROM message_mappings
    WHERE created_at < ?
  `).bind(oneDayAgo).run();
}
