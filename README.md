# Reel Drama

Short-drama streaming platform: vertical episodes, free and premium unlocks, rewarded ads, coins, VIP subscriptions, and direct advertiser campaigns. Android first, iOS-compatible, Hindi and English.

| Path | What | Tech |
|---|---|---|
| [`apps/api`](apps/api) | REST API `/api/v1` and Swagger | NestJS 11, Prisma 6, PostgreSQL, Redis/BullMQ |
| [`apps/mobile`](apps/mobile) | Viewer app (UI derived from BytePlus VideoOne, Apache-2.0) | Expo SDK 58, React Native 0.88, react-native-video |
| [`apps/admin`](apps/admin) | Admin dashboard (content, ads, users, moderation, reports) | Next.js, Tailwind, TanStack Query |
| [`workers/video-transcoder`](workers/video-transcoder) | Upload → HLS 480/720/1080p, thumbnails | Node + FFmpeg, BullMQ |
| [`workers/notifications`](workers/notifications) | Scheduled push notifications | FCM HTTP v1 |
| [`infra/cloudflare/media-worker`](infra/cloudflare/media-worker) | Token-checked HLS delivery from private R2 | Cloudflare Workers |
| [`infra/docker`](infra/docker) | Local Postgres, Redis, S3 (SeaweedFS); opt-in app profile | Docker Compose |
| [`docs`](docs) | Architecture, database, API, video pipeline, ads, deployment, task queue | |

## Quick start (local)
```bash
docker compose -f infra/docker/docker-compose.yml up -d          # Postgres :54329, Redis :63799, S3 :9000

cd apps/api && cp .env.example .env    # point DATABASE_URL at local or Supabase; set secrets
npm install && npm run db:migrate:deploy && npm run db:seed && npm run dev   # http://localhost:3000/api/docs

cd workers/video-transcoder && cp .env.example .env && npm install
npm run seed:media                     # synthetic sample videos for every seeded episode (dev only)
npm run dev                            # processes admin uploads

cd apps/admin && cp .env.example .env.local && npm install && npm run dev    # http://localhost:3001
cd apps/mobile && cp .env.example .env.local && npm install && npx expo run:android
```
Dev sign-in without Supabase: seeded accounts `owner`, `content`, `ads`, `support` and `viewer` (`npm run dev:token -- viewer` in `apps/api`, or the dev buttons in the app and admin). These are disabled in production.

## Quality gates
`bash scripts/verify.sh` runs typecheck, lint and the unit and integration tests for every package. CI (`.github/workflows/ci.yml`) runs the same checks plus Docker image builds.
Test counts at the last full run:
- API: 115 unit and 106 integration tests (including a migration drift check)
- Admin: 62
- Mobile: 28
- Transcoder: 19
- Notifications: 12 (including retention against a real database)
- Media worker: 8

GitHub Actions runs the same checks on every push: https://github.com/funnyremix3-lab/dramareel/actions

To try the app on a phone over your Wi-Fi, see [docs/phone-testing.md](docs/phone-testing.md).

## Key design points
- **Server-authoritative economy.** Coins go through an append-only ledger with row locks and idempotency keys. Rewarded ads are granted only after AdMob server-side verification. Play purchases are verified with Google before fulfilment.
- **Private video.** Originals are never served. HLS goes through path-scoped HMAC tokens checked at the edge. This is access control, not DRM.
- **Ads.** AdMob uses test units in development; interstitials are frequency-capped; direct campaigns carry signed serve tokens and are always labelled "Sponsored". Network and direct revenue are never mixed.
- **Privacy.** Analytics are allow-listed and consent-gated. Account deletion has a 30-day grace period, after which a job purges personal data; old analytics and ad events are pruned after about 13 months. Secrets live only in git-ignored `.env` files.
- **Admin.** Every route is permission-checked on the server. Writes are audit-logged. Ad creatives need a second person to approve them.

See [docs/architecture.md](docs/architecture.md) and [docs/deployment.md](docs/deployment.md).

## Git
- `main`: development.
- `backup/byteplus-original` and tag `byteplus-import`: the untouched BytePlus import.
- `VideoOneSolutions/`: the upstream clone, kept for reference only and git-ignored.

## What still needs your accounts
| Needed for | What to provide |
|---|---|
| Real sign-in | Supabase anon key (and enable email OTP) |
| Production video | Cloudflare R2 bucket + API token, Worker deployment |
| Ads revenue | AdMob app and ad unit IDs, SSV callback URL, `app-ads.txt` |
| Purchases | Play Console products, service account, RTDN Pub/Sub |
| Push | Firebase project: `google-services.json` and a service account |
| Store release | Play Console developer account, upload keystore or EAS |

## Licence
Code derived from BytePlus VideoOne is Apache-2.0 (© 2023 BytePlus Pte. Ltd.). Attribution is kept in the source headers and on the in-app licences screen. The BytePlus player SDK is not used.
