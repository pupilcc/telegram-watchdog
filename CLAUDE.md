# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram bot deployed as a Cloudflare Worker that acts as a spam filter and message relay. It uses:
- **Hono** - Web framework for Cloudflare Workers
- **Grammy** - Telegram bot framework
- **OpenAI SDK** - For AI-powered spam detection
- **Cloudflare D1** - SQLite-compatible database for message mapping
- **Wrangler** - Cloudflare Workers CLI tool

## Development Commands

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Deploy to Cloudflare Workers (with minification)
npm run deploy

# Generate TypeScript types for Cloudflare bindings
npm run cf-typegen
```

## Architecture

### Core Functionality
The bot provides two main features:
1. **AI-powered spam detection** - Filters incoming messages using LLM to detect spam/scams
2. **Admin message relay** - Forwards user messages to admin and enables admin replies

### Entry Point (src/index.ts)
- Creates Hono app with Cloudflare Workers `Env` bindings
- Lazily initializes Grammy bot on first request (required for Workers environment)
- Calls `initDatabase()` to ensure D1 tables exist on bot initialization
- Sets up Telegram webhook at `/webhook` path with secret token validation
- Registers middleware chain: spam filter → message handler

### Message Flow

**Incoming User Messages:**
1. Middleware filter (`src/bot/middleware.ts`) intercepts all non-command messages
2. Calls `detectSpam()` with sender name and message text
3. If spam detected:
   - Forwards message to admin group (`ADMIN_GID`) with AI judgment
   - Warns the sender and blocks message propagation
4. If clean, passes to message handler

**Message Handler (`src/bot/message.ts`):**
- Only processes private chat messages (ignores groups)
- Two scenarios:
  - **User → Admin**: Forwards user message to admin UID, stores mapping in D1 (forwarded_message_id → original_user_chat_id)
  - **Admin → User**: When admin replies to a forwarded message, looks up original user in D1 and sends reply

### Database (src/db/init.ts)
- Uses Cloudflare D1 (SQLite) with binding name `DB`
- **message_mappings table**: Maps forwarded message IDs to original sender chat IDs
  - `forwarded_message_id` (PRIMARY KEY): The message ID when forwarded to admin
  - `original_user_chat_id` (TEXT): The user's chat ID to send replies back to
  - `created_at` (INTEGER): Timestamp for record creation

### LLM Integration (src/llm/)
**client.ts:**
- `createOpenAIClient()`: Configures OpenAI SDK with custom base URL and API key
- `callAI()`: Generic LLM caller with system/user prompts
- `detectSpam()`: Specialized function that fills prompt template and calls LLM

**prompt.ts:**
- Defines spam detection system prompt with criteria (ads, scams, harassment, etc.)
- User prompt template with `{{senderName}}` and `{{messageText}}` placeholders
- Expected LLM response format: "SPAM: reason" or "CLEAN"
- `fillPromptTemplate()`: Simple regex-based template variable replacement

### Environment Variables
Required Cloudflare Worker bindings (configure in wrangler.jsonc or Cloudflare dashboard):
- `DOMAIN` - Worker domain for webhook URL
- `BOT_TOKEN` - Telegram bot token from BotFather
- `BOT_SECRET` - Secret token for webhook validation
- `ADMIN_UID` - Telegram user ID of admin (receives forwarded messages)
- `ADMIN_GID` - Telegram group ID for spam alerts
- `LLM_API` - OpenAI-compatible API base URL
- `LLM_MODEL` - Model name (defaults to gpt-3.5-turbo)
- `LLM_KEY` - API key for LLM service
- `DB` - D1 database binding (configured in wrangler.jsonc)

### Key Design Patterns
1. **Lazy Initialization** - Bot and database are initialized on first request, not at module load (required for Cloudflare Workers where bindings are request-scoped)
2. **Webhook-based** - Uses Telegram webhooks instead of polling
3. **Middleware Chain** - Spam filter runs before message handler; can block propagation
4. **Message Mapping** - D1 database maintains bidirectional message relay capability
5. **Template-based Prompts** - LLM prompts use simple `{{variable}}` templating

## Cloudflare Workers Specifics
- Entry point: `src/index.ts` (configured in wrangler.jsonc)
- Exports default Hono instance as Workers fetch handler
- D1 database binding named "DB" with database name "watchdog"
- Observability: logs enabled, traces disabled
- Uses path aliases: `@/` maps to `src/` (configured in tsconfig.json)
