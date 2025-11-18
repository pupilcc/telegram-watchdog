/**
 * Whitelist configuration constants
 */
export const WHITELIST_CONFIG = {
  /** Number of consecutive clean messages required for automatic whitelisting */
  REQUIRED_CLEAN_COUNT: 3,

  /** Maximum allowed spam count for automatic whitelisting (0 = never marked as spam) */
  MAX_ALLOWED_SPAM_COUNT: 0,

  /** Whether to notify admin when a user is automatically whitelisted */
  NOTIFY_ADMIN_ON_AUTO_WHITELIST: true,
} as const;

/**
 * User trust status types
 */
export type TrustStatus = 'new' | 'trusted' | 'monitoring';

/**
 * Whitelist source types
 */
export type WhitelistSource = 'auto' | 'admin';
