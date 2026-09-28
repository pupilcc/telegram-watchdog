# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript Telegram bot with two runtimes. `src/index.ts` is the Cloudflare Workers entry point, `src/server.ts` is the Node/Docker entry point, and `src/app.ts` assembles the shared bot. Keep runtime-specific imports out of `src/app.ts`. Bot commands, middleware, message handling, and forum topics live in `src/bot/`; spam detection lives in `src/llm/`; database access and the SQLite adapter live in `src/db/`. Configuration examples are in `.env.example`, Workers settings in `wrangler.jsonc`, and container settings in `Dockerfile` and `docker-compose.yml`. There is no test directory or asset directory.

## Build, Test, and Development Commands

Use Node.js 24 or newer and `npm install` to install dependencies. `npm run typecheck` runs TypeScript without emitting files. `npm run dev` starts Wrangler locally; `npm run dev:node` watches the Node entry point, while `npm start` runs it once. `npm run cf-typegen` refreshes Worker binding types, and `npm run docker:build` builds the Docker image. No dedicated build, lint, or test script is configured.

## Coding Style & Naming Conventions

Follow the existing two-space indentation, single-quoted strings, semicolons, and strict TypeScript settings in `tsconfig.json`. Use `@/` for imports from `src/`. Name files by responsibility in lowercase, using kebab case for multiword names such as `sqlite-adapter.ts`; use camelCase for functions and variables and PascalCase for types. Keep shared bot and database logic usable by both runtimes.

## Testing Guidelines

There is no automated test framework or coverage requirement. Run `npm run typecheck` and manually inspect affected bot flows, including webhook handling, spam filtering, and database behavior where relevant. Do not claim a passing test suite that does not exist. Agents should not start local services for verification or add unit tests after code changes.

## Commit & Pull Request Guidelines

Recent commits use Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `chore:`, and `refactor:`; scopes are used when helpful, for example `feat(whitelist):`. Keep commits focused. In pull requests, describe the behavior change, affected runtime, configuration changes, and verification performed. Link related issues when available.

## Security & Configuration

Use `.env.example` as the variable reference. Keep real bot tokens, webhook secrets, and API keys out of commits; `.env` and `.dev.vars` are ignored. Update the example and README when adding required configuration.
