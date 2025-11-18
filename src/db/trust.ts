import type { D1Database } from '@cloudflare/workers-types';
import type { TrustStatus, WhitelistSource } from '@/config';
import { WHITELIST_CONFIG } from '@/config';

/**
 * User trust information from database
 */
export interface UserTrust {
  user_id: string;
  username: string | null;
  trust_status: TrustStatus;
  consecutive_clean_count: number;
  total_spam_count: number;
  whitelisted_at: number | null;
  whitelisted_by: WhitelistSource | null;
  last_message_at: number | null;
  created_at: number;
}

/**
 * Get user trust information from database
 */
export async function getUserTrust(
  db: D1Database,
  userId: string
): Promise<UserTrust | null> {
  const result = await db
    .prepare('SELECT * FROM user_trust WHERE user_id = ?')
    .bind(userId)
    .first<UserTrust>();

  return result || null;
}

/**
 * Create a new user trust record
 */
export async function createUserTrust(
  db: D1Database,
  userId: string,
  username?: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_trust (user_id, username, trust_status, consecutive_clean_count, total_spam_count, created_at, last_message_at)
       VALUES (?, ?, 'new', 0, 0, ?, ?)`
    )
    .bind(userId, username || null, Date.now(), Date.now())
    .run();
}

/**
 * Update user's trust status
 */
export async function updateTrustStatus(
  db: D1Database,
  userId: string,
  status: TrustStatus,
  whitelistedBy?: WhitelistSource
): Promise<void> {
  const now = Date.now();

  if (status === 'trusted' && whitelistedBy) {
    // When promoting to trusted, record whitelist information
    await db
      .prepare(
        `UPDATE user_trust
         SET trust_status = ?,
             whitelisted_at = ?,
             whitelisted_by = ?
         WHERE user_id = ?`
      )
      .bind(status, now, whitelistedBy, userId)
      .run();
  } else {
    // For other status changes
    await db
      .prepare('UPDATE user_trust SET trust_status = ? WHERE user_id = ?')
      .bind(status, userId)
      .run();
  }
}

/**
 * Increment consecutive clean count after a message passes AI check
 */
export async function incrementCleanCount(
  db: D1Database,
  userId: string
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE user_trust
       SET consecutive_clean_count = consecutive_clean_count + 1,
           last_message_at = ?
       WHERE user_id = ?`
    )
    .bind(now, userId)
    .run();
}

/**
 * Record a spam message (reset consecutive count, increment total spam count)
 */
export async function recordSpam(db: D1Database, userId: string): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE user_trust
       SET consecutive_clean_count = 0,
           total_spam_count = total_spam_count + 1,
           trust_status = 'monitoring',
           last_message_at = ?
       WHERE user_id = ?`
    )
    .bind(now, userId)
    .run();
}

/**
 * Check if user qualifies for automatic whitelisting and promote if so
 * Returns true if user was promoted to whitelist
 */
export async function checkAndPromoteToWhitelist(
  db: D1Database,
  userId: string
): Promise<boolean> {
  const user = await getUserTrust(db, userId);

  if (!user) {
    return false;
  }

  // Check if user meets whitelist criteria
  const meetsRequirements =
    user.consecutive_clean_count >= WHITELIST_CONFIG.REQUIRED_CLEAN_COUNT &&
    user.total_spam_count <= WHITELIST_CONFIG.MAX_ALLOWED_SPAM_COUNT;

  if (meetsRequirements && user.trust_status !== 'trusted') {
    // Promote user to whitelist
    await updateTrustStatus(db, userId, 'trusted', 'auto');
    return true;
  }

  return false;
}

/**
 * Manually whitelist a user (by admin command)
 */
export async function manuallyWhitelistUser(
  db: D1Database,
  userId: string,
  username?: string
): Promise<void> {
  const now = Date.now();

  // Use INSERT ... ON CONFLICT to handle both new and existing users
  await db
    .prepare(
      `INSERT INTO user_trust (user_id, username, trust_status, whitelisted_at, whitelisted_by, created_at, consecutive_clean_count, total_spam_count, last_message_at)
       VALUES (?, ?, 'trusted', ?, 'admin', ?, 0, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         trust_status = 'trusted',
         whitelisted_at = excluded.whitelisted_at,
         whitelisted_by = 'admin',
         username = excluded.username`
    )
    .bind(userId, username || null, now, now, now)
    .run();
}

/**
 * Remove user from whitelist (demote to new user status)
 */
export async function removeFromWhitelist(
  db: D1Database,
  userId: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE user_trust
       SET trust_status = 'new',
           consecutive_clean_count = 0,
           total_spam_count = total_spam_count + 1,
           whitelisted_at = NULL,
           whitelisted_by = NULL
       WHERE user_id = ?`
    )
    .bind(userId)
    .run();
}

/**
 * Update last message timestamp
 */
export async function updateLastMessageTime(
  db: D1Database,
  userId: string
): Promise<void> {
  await db
    .prepare('UPDATE user_trust SET last_message_at = ? WHERE user_id = ?')
    .bind(Date.now(), userId)
    .run();
}
