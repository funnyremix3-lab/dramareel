# Reel Drama — working notes for Claude

Short-drama streaming platform. Monorepo layout and status: [README.md](README.md). Design docs: [docs/](docs/).

## How we work
- **Continuous loop:** use the `build-test-loop` skill (`.claude/skills/build-test-loop/SKILL.md`). It works through [docs/TASKS.md](docs/TASKS.md): implement → `bash scripts/verify.sh` → fix → commit → next. Don't stop between items unless blocked on something only the user can provide.
- To run it unattended across turns: `/loop /build-test-loop`.
- The user communicates in Hinglish. Reply in Hinglish and keep code and docs in English.

## Commands
| What | Command |
|---|---|
| Local services | `docker compose -f infra/docker/docker-compose.yml up -d` (Postgres :54329, Redis :63799, S3 :9000) |
| All checks | `bash scripts/verify.sh` (or `bash scripts/verify.sh api mobile`) |
| API dev server | `cd apps/api && npm run dev` (Swagger `/api/docs`) |
| Dev login token | `cd apps/api && npm run dev:token -- viewer` |
| Sample videos | `cd workers/video-transcoder && npm run seed:media` |
| Mobile | `cd apps/mobile && npx expo start` (needs a dev build; not Expo Go) |

## Credentials (mandatory)
- **Every credential goes into a git-ignored env file — nowhere else.** That includes passwords, API keys, anon/service keys, tokens, service-account JSON paths and signing keys.
  - API and server: `apps/api/.env`.
  - Workers: `workers/*/.env`.
  - Mobile: `apps/mobile/.env.local`.
  - Admin: `apps/admin/.env.local`.
- **If the user pastes a credential in chat, put it in the right env file straight away.**
  - Never echo it back in replies.
  - Never print it in tool output (read values from the env file instead of retyping them).
  - Never put it in code, docs, `.md` files, commit messages, test fixtures or `.env.example`.
  - `.env.example` holds placeholders only.
- Before committing, confirm that `git check-ignore` covers the env file and that the staged diff contains no secret.
- If a secret was exposed (pasted in chat, logged or committed), tell the user to rotate it.
- Public client keys (Supabase anon/publishable, AdMob app id) still live in env files, not in source.
- Server-only secrets (Supabase service_role, DB password, signing keys, Google service accounts) never go into mobile or admin env files. Anything prefixed `EXPO_PUBLIC_` or `NEXT_PUBLIC_` ships to users.

## Rules
- `apps/api/prisma/schema.prisma` is the single schema. The transcoder copies it on install.
- Never run `prisma migrate reset` or other destructive database commands. `apps/api/.env` points at the user's Supabase database.
- Mobile code uses Expo SDK 58 and RN 0.88 (New Architecture only). Check installed type definitions before using any Expo or React Native API.
- Money and entitlements are server-authoritative. All coin changes go through `WalletService.post`.
- Keep `apps/api/src/media/playback-token.ts` byte-identical to `infra/cloudflare/media-worker/src/playback-token.ts`.
