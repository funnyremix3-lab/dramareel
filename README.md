# Reel Drama

Short-drama streaming platform: vertical episodes, free plus premium unlocks, rewarded ads, coins and subscriptions. Android first, iOS-compatible, Hindi and English.

| Path | What | Status |
|---|---|---|
| `apps/mobile` | Expo / React Native app, imported from BytePlus VideoOne (Apache-2.0) | Imported unmodified; migration in Phase 4 |
| `apps/api` | NestJS + Prisma + PostgreSQL API | Schema designed (`prisma/schema.prisma`); code in Phase 3 |
| `apps/admin` | Next.js admin dashboard | Phase 8 |
| `workers/video-transcoder` | FFmpeg → HLS worker | Phase 5 |
| `workers/notifications` | FCM push worker | Phase 8 |
| `packages/*` | Shared types, Zod schemas, config | Phase 3 |
| `infra/` | Docker Compose, Cloudflare media worker, deployment | Phases 3, 5, 8 |
| `docs/` | Architecture, database, API contract | Phase 2 ✅ |
| `VideoOneSolutions/` | Upstream BytePlus clone, read-only reference, git-ignored | — |

Start here: [docs/architecture.md](docs/architecture.md), then [docs/database.md](docs/database.md) and [docs/api.md](docs/api.md).

## Git
- `main`: active development.
- `backup/byteplus-original` and tag `byteplus-import`: the untouched BytePlus import, to restore from if needed.

## Prerequisites
- Node.js 20+ (tested with 24) and npm.
- Docker Desktop, for Postgres, Redis and MinIO in local development.
- Android Studio with JDK 17 and the Android SDK, for building the mobile app. Not installed yet on the dev machine.
- FFmpeg, for the transcoder worker in local runs.

## Known issues inherited from upstream
- `apps/mobile/package-lock.json` points to an internal ByteDance registry (`bnpm.byted.org`), so `npm ci` fails. It is regenerated in Phase 4.
- `apps/mobile` has 2 TypeScript errors upstream, in `VideoPlayer.tsx:367` and `dramaUtils.ts:119`. Both files are replaced in Phase 4.

## Licence
Code derived from BytePlus VideoOne is Apache-2.0 (© 2023 BytePlus Pte. Ltd.). See `apps/mobile/LICENSE`. Its copyright headers are kept, and modified files are marked. The BytePlus player SDK is **not** used.
