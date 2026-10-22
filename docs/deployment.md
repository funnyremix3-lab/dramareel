# Deployment & Operations

The local Docker Compose setup is **for development only** (default passwords, no TLS). Production uses managed services:

| Piece | Recommended host | Notes |
|---|---|---|
| PostgreSQL | Supabase (Pro for PITR) or any managed Postgres 15+ | Use the **pooler** URL for the API if the host lacks IPv6; `DIRECT_DATABASE_URL` for migrations |
| Auth | Supabase Auth | Email OTP enabled, site URL set, JWT signing keys (JWKS) |
| Object storage | Cloudflare R2 (private bucket) | No public access; the media Worker is the only reader |
| Media edge | Cloudflare Worker `infra/cloudflare/media-worker` | Custom domain `media.<domain>` |
| API | Container host (Fly.io, Render, Railway, ECS, a VM with Docker) | `apps/api/Dockerfile`, 1 instance is plenty for ~100 DAU |
| Redis | Upstash / managed Redis | BullMQ queue; enable TLS (`rediss://`) |
| Transcoder | Same container host, 2 vCPU / 2–4 GB | `workers/video-transcoder/Dockerfile`, concurrency 1 |
| Notifications | Same host, tiny | `workers/notifications/Dockerfile` |
| Admin | Vercel or container | `apps/admin/Dockerfile` |

## 1. Production environment checklist

**API (`apps/api/.env`, set as platform secrets — never committed)**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | Pooled / direct Postgres URLs (`sslmode=require`) |
| `REDIS_URL` | `rediss://…` |
| `SUPABASE_URL`, `SUPABASE_JWKS_URL` | Your Supabase project |
| `DEV_JWT_SECRET` | **empty** (the API refuses to start otherwise) |
| `CORS_ORIGINS` | `https://admin.<domain>` |
| `S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | An R2 API token scoped to this bucket |
| `MEDIA_BASE_URL`, `MEDIA_PUBLIC_BASE_URL` | `https://media.<domain>` |
| `PLAYBACK_SIGNING_KEY` | 32 random bytes, base64. **Same value as the Worker secret.** |
| `DEV_MEDIA_PROXY` | `false` |
| `ADMOB_SSV_ENABLED` | `true` |
| `ADS_SERVE_SIGNING_KEY` | 32 random bytes, base64 |
| `PAYMENTS_ENABLED` | `false` until Play Billing is verified end to end |
| `GOOGLE_PLAY_*`, `GOOGLE_RTDN_*` | When payments are enabled |
| `SWAGGER_ENABLED` | `false` (or protect it at the proxy) |
| `LOG_LEVEL` | `info` |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Production config is validated at boot. Misconfigurations stop the process instead of running insecurely. The checks cover a dev secret, the dev media proxy, SSV being disabled, a missing playback key, and payments enabled without credentials.

**Transcoder:** `DATABASE_URL`, `REDIS_URL`, `S3_*` (with read/write access), `X264_PRESET=veryfast`, `TRANSCODER_CONCURRENCY=1`.
**Notifications:** `DATABASE_URL`, `FCM_SERVICE_ACCOUNT_JSON_PATH` (mount the Firebase service-account file as a secret).
**Media Worker:** set `PLAYBACK_SIGNING_KEY` with `wrangler secret put`, the R2 binding in `wrangler.toml`, and `ALLOWED_ORIGINS`.
**Mobile build:** `APP_VARIANT=production`, `EXPO_PUBLIC_API_URL=https://api.<domain>/api/v1`, Supabase URL and anon key, the real `ADMOB_ANDROID_APP_ID`, and `google-services.json`.

## 2. Database migrations
```bash
cd apps/api
DATABASE_URL=… DIRECT_DATABASE_URL=… npx prisma migrate deploy     # forward-only, safe to re-run
# or with the image:
docker run --rm --env-file api.env reel-drama-api npx prisma migrate deploy
```
- Run migrations **before** rolling out a new API version. Every migration must stay backward compatible with the running version: add columns as nullable, backfill them, then tighten constraints in a later release.
- **Never** run `prisma migrate dev` or `migrate reset` against production.
- Seed data (`npm run db:seed`) is development-only. It refuses `NODE_ENV=production`. For production, create the system roles, placements and products through the admin dashboard, or with a one-off reviewed SQL script.

## 3. Backups & restore
- Turn on daily backups **and** point-in-time recovery (Supabase Pro: 7 days or more).
- Run a monthly restore drill:
  1. Restore to a new project or instance.
  2. Point a staging API at it with `DATABASE_URL`.
  3. Run `npx prisma migrate status`, which should report "up to date".
  4. Run the wallet reconciliation: `SELECT … HAVING balance <> SUM(amount)` (see `WalletService.findMismatches`). It must return no rows.
  5. Spot-check a few users' unlocks and subscriptions.
  6. Record the date and result in the ops log.
- R2 has no automatic backup. Originals are the source of truth for video, so enable bucket versioning or nightly copy `originals/` to a second bucket. Processed HLS can always be regenerated with the transcoder.

## 4. HTTPS & domains
| Host | Points to |
|---|---|
| `api.<domain>` | API container (TLS from the platform or Cloudflare proxy) |
| `media.<domain>` | Cloudflare Worker custom domain |
| `admin.<domain>` | Admin app |

- Enforce HTTPS everywhere and enable HSTS at the proxy.
- The API sets security headers with helmet.
- The CORS allow-list contains only the admin origin. Mobile apps don't need CORS.
- AdMob SSV callback URL: `https://api.<domain>/api/v1/ads/admob/ssv`.
- Play RTDN push endpoint: `https://api.<domain>/api/v1/payments/google-play/rtdn`, with an OIDC token whose audience is `GOOGLE_RTDN_AUDIENCE`.

## 5. Health checks & monitoring
| Check | Use |
|---|---|
| `GET /api/v1/health/live` | Liveness probe (the Docker `HEALTHCHECK` uses it) |
| `GET /api/v1/health/ready` | Readiness probe; checks the DB |

- **Logs:** JSON lines from pino (API) and the workers. Each request carries `x-request-id`, which is also returned to clients in error bodies, so support can trace a complaint. Ship logs to the platform's log store or to Better Stack or Datadog.
- **Errors:** set `SENTRY_DSN` for the API and `EXPO_PUBLIC_SENTRY_DSN` for the app.
- **Alerts to configure:**
  - API 5xx rate above 1% for 5 minutes; `/health/ready` failing.
  - BullMQ `video-transcode` failed jobs above 0; video assets stuck in `PROCESSING` for more than 30 minutes (`SELECT count(*) FROM video_assets WHERE status='PROCESSING' AND processing_started_at < now()-interval '30 min'`).
  - Wallet reconciliation mismatches above 0 (run nightly).
  - Notification jobs with `FAILED` status.
  - Open comment reports above 20 (moderation backlog).

## 6. Android build & release
1. Create the app in the Play Console with package `com.reeldrama.app`. Enrol in Play App Signing.
2. Build:
   - **EAS (no Android Studio needed):** `npm i -g eas-cli && eas login && eas build --platform android --profile production`
   - **Local:** install Android Studio and JDK 17, then `APP_VARIANT=production npx expo prebuild --clean && cd android && ./gradlew bundleRelease` (with your upload keystore configured in `android/gradle.properties`, never committed).
3. Upload the `.aab` to Internal testing. Test with license testers, using real AdMob units in test mode for your devices.
4. Store release checklist:
   - Privacy policy URL and terms URL are live and set in the app (`EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL`).
   - Data safety form: email, user ID, purchase history, app interactions (when analytics consent is given), crash logs, device ID for ads. Data is encrypted in transit, and deletion can be requested in the app (Settings → Delete account).
   - Ads declaration "Contains ads". Content rating questionnaire. Target audience must not include children under 13.
   - AdMob account linked to the app, `app-ads.txt` published, UMP consent message configured.
   - In-app products `coins_100`, `coins_500`, `vip_weekly` and `vip_monthly` created in Play with the same SKUs as the `products` table. RTDN topic configured. Payments enabled only after testing purchase, refund and cancel with license testers.
   - Target API 36 is set in `app.config.ts` (`expo-build-properties`).
   - App icon, feature graphic, screenshots in English and Hindi, short and full description.

## 7. Cost monitoring (≈100 DAU)
| Item | What drives cost | Watch |
|---|---|---|
| R2 storage | ~25 MB per minute of 1080p across all renditions; originals extra | R2 dashboard → storage |
| R2 operations | Class B reads per segment (cached ones are free at the edge) | Cache hit ratio for `media.<domain>` |
| Egress | R2 has no egress fees; Workers requests are billed above the free tier | Workers analytics |
| Transcoding | CPU minutes: about 1–2 minutes per 90 s episode on `veryfast` | Scale the worker to zero when the queue is idle (platform autoscaling) |
| Postgres | Plan tier; analytics_events growth | Prune events older than 13 months |
| Redis | Tiny | — |

Set budget alerts in Cloudflare, the database host and the container host. Review the admin **Overview** weekly (DAU, plays, coins issued vs spent, rewards).
