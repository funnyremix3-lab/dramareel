# Reel Drama — Architecture

Status: **Phase 2 design** (agreed before implementation). Target: Android first, iOS-compatible, Hindi + English, ~100 DAU at launch, able to grow without a rewrite.

## 1. System overview

```
                         ┌────────────────────────── Cloudflare ─────────────────────────┐
                         │                                                                │
 ┌──────────────┐  HLS   │  media.<domain>  ──►  Worker (token check)  ──►  R2 (private)  │
 │ Mobile app   │◄───────┤                                                  originals/    │
 │ Expo / RN    │        │                                                  processed/    │
 │ react-native-│        └────────────────────────────────────────────────────────▲──────┘
 │ video        │                                                                  │ S3 API
 │ AdMob SDK    │  REST /api/v1 (JWT)    ┌───────────────┐   BullMQ   ┌───────────┴──────┐
 │ Play Billing │───────────────────────►│  API (NestJS) │──────────► │ video-transcoder │
 └──────┬───────┘                        │  Prisma       │   Redis    │ FFmpeg worker    │
        │ sign-in                        │               │◄───────────┤ notifications    │
        ▼                                └──┬─────┬───┬──┘            └──────────────────┘
 ┌──────────────┐  JWKS verify              │     │   │
 │ Supabase Auth│◄──────────────────────────┘     │   │  server-to-server
 └──────────────┘                                 │   ├──► Google Play Developer API (receipts)
                                     PostgreSQL ◄─┘   ├──► AdMob SSV callback (inbound)
 ┌──────────────┐  REST /api/v1/admin             │   └──► FCM HTTP v1 (push)
 │ Admin (Next) │─────────────────────────────────┘
 └──────────────┘
```

| Component | Tech | Responsibility |
|---|---|---|
| `apps/mobile` | Expo SDK 53, React Native 0.79, Expo Router, TypeScript | Viewer app. UI derived from BytePlus VideoOne (Apache-2.0). |
| `apps/admin` | Next.js (App Router), Tailwind, shadcn/ui, TanStack Query | Content, ads, users, moderation, reports. Talks only to the API. |
| `apps/api` | NestJS, Prisma 6, PostgreSQL, Redis, BullMQ, Swagger | Single source of truth for entitlements, wallets, playback tokens. |
| `workers/video-transcoder` | Node + FFmpeg, BullMQ consumer | Source → HLS renditions, thumbnails, metadata. |
| `workers/notifications` | Node, BullMQ consumer, FCM HTTP v1 | Scheduled/broadcast push. |
| `infra/cloudflare/media-worker` | Cloudflare Worker + R2 binding | Validates playback tokens, serves HLS from the private bucket. |
| `packages/shared-types` | TypeScript | API DTO types shared by mobile, admin, api. |
| `packages/validation` | Zod | Request schemas shared by admin forms and API. |

## 2. Key decisions

| # | Decision | Why | Rejected alternative |
|---|---|---|---|
| D1 | **Player: `react-native-video` (ExoPlayer/AVPlayer)** behind a `PlayerAdapter` interface | No licence needed; HLS ABR + manual track selection; works with dev-client builds. | BytePlus VOD SDK — requires a paid licence bound to our package name. `expo-video` — less control over tracks/buffering. |
| D2 | **Keep the BytePlus UI, drop its SDK and demo server** | Feed, selectors, unlock modals and Lottie like button are already built and Apache-2.0. | Rewrite UI from scratch. |
| D3 | **Auth: Supabase Auth**, API verifies JWT via JWKS; roles live in our DB | Mature email/Google/phone-OTP flows, no password storage in our code. | Hand-rolled auth. |
| D4 | **NestJS + Prisma 6 (pinned)** | Spec requirement; Prisma 7 changes config loading — upgrade later deliberately. | — |
| D5 | **Playback: path-scoped HMAC tokens checked by a Cloudflare Worker** | HLS players resolve segment URLs relative to the manifest, so a token in the *path* (`/p/{token}/{assetId}/…`) automatically covers every segment; query-string signed URLs do not. CDN caches by path minus token. | Per-segment presigned URLs (requires manifest rewriting on every request). |
| D6 | **Server-authoritative economy** | Coins, unlocks, subscriptions and ad rewards are only granted by the API inside DB transactions with idempotency keys. Client-reported "ad finished" is never sufficient. | — |
| D7 | **Monorepo with npm workspaces; `apps/mobile` kept standalone** | Admin (Next/React-DOM) and mobile (React Native) must not share a hoisted `react`; native modules stay isolated. Mobile consumes `packages/shared-types` through a TS path alias + Metro `watchFolders`. | One hoisted workspace for everything. |
| D8 | **Push: FCM HTTP v1 direct** (device tokens from `expo-notifications`) | No extra vendor; same path works for iOS via APNs-through-FCM. | Expo Push Service. |

## 3. Core flows

### 3.1 Playback authorization
1. App calls `GET /api/v1/episodes/{id}/playback`.
2. API loads episode + current `video_assets` row (must be `READY`), then runs the **entitlement check** (§3.5).
3. If allowed, API mints `token = base64url(assetId | exp | userIdHash) + "." + HMAC_SHA256(PLAYBACK_SIGNING_KEY, …)`, TTL 6 h (shorter for premium if needed).
4. Response: `{ manifestUrl: "https://media.<domain>/p/{token}/{assetId}/master.m3u8", renditions, subtitles[], expiresAt, resumePositionSeconds }`.
5. Worker verifies HMAC + expiry + that `assetId` in the token matches the path, then reads `processed/{assetId}/…` from R2. Originals (`originals/…`) are never routable.
6. If locked, API returns `403 EPISODE_LOCKED` with unlock options (coins price, rewarded-ad eligibility, subscription offer).

Signed URLs are **access control, not DRM**: they stop link sharing and hot-linking after expiry but do not prevent screen recording or a determined user downloading what they are entitled to watch. `FLAG_SECURE` on Android blocks casual screenshots/recording and will be enabled on the player screen.

Local development uses MinIO instead of R2 and an API-hosted dev media proxy that performs the same token check.

### 3.2 Upload & processing
1. Admin → `POST /admin/episodes/{id}/video-assets` → API validates declared size/MIME, creates `video_assets(AWAITING_UPLOAD)`, returns a presigned `PUT` URL (15 min) for `originals/{assetId}/source.{ext}`.
2. Browser uploads directly to R2. Admin calls `POST /admin/video-assets/{id}/complete`.
3. API `HEAD`s the object (size/type), sets `UPLOADED`, enqueues `transcode` job (jobId = assetId → no duplicate jobs).
4. Worker: `ffprobe` validation (container, codecs, duration, resolution) → renditions 480p/720p/1080p **only up to source height** → HLS (6 s segments, fMP4 or TS) → `master.m3u8` → thumbnail + preview → upload to `processed/{assetId}/` → `READY`.
5. Failure: error stored in `last_error`, BullMQ retries with exponential backoff (3 attempts), then `FAILED`; admin can retry. Output paths are deterministic so retries overwrite rather than duplicate.
6. Publishing an episode requires its current asset to be `READY`.

### 3.3 Rewarded ad → reward (AdMob SSV)
1. App: `POST /api/v1/rewards/claims { placementKey, purpose, episodeId? }`.
2. API checks eligibility (placement active, daily cap, user not suspended, episode actually locked) and creates `reward_claims(PENDING, nonce, expires_at = now + 30 min)`.
3. App loads the rewarded ad with `serverSideVerificationOptions = { userId, customData: nonce }` and shows it.
4. Google calls `GET /api/v1/ads/admob/ssv?…&signature=…&key_id=…`. API verifies the ECDSA signature against Google's published keys (cached), checks `ad_unit` matches configuration, `custom_data` → claim, `user_id` matches the claim owner, claim not expired, `transaction_id` unused.
5. In one DB transaction: claim → `VERIFIED` → grant (`wallet_transactions` with key `reward:{claimId}` **or** `episode_unlocks` with `reward_claim_id`) → `GRANTED`. Unique constraints make replays no-ops.
6. App polls `GET /rewards/claims/{id}` (short backoff, ~10 s max) and refreshes wallet/entitlements.

Rewards are never granted for clicks, and the client's `onEarnedReward` event alone is never trusted.

### 3.4 Purchases (Google Play Billing first)
1. App buys via `react-native-iap`, sends `{ productSku, purchaseToken }` to `POST /api/v1/payments/google-play/verify`.
2. API verifies with the Google Play Developer API (service account), checks package name, SKU, purchase state, not already consumed/acknowledged by another user.
3. One transaction: `payment_transactions` (unique `(provider, provider_transaction_id)`) → credit coins with key `purchase:{paymentId}` or upsert `subscriptions` → `FULFILLED`. Then acknowledge/consume with Google.
4. Real-Time Developer Notifications (Pub/Sub push → `POST /api/v1/payments/google-play/rtdn`) drive renewals, grace period, cancellation, refunds, revocations. Refund of a coin pack posts a `REVERSAL` ledger entry (balance may not go negative — excess is recorded and the account flagged).
5. StoreKit 2 (iOS) plugs into the same `PaymentProvider` interface later.

Real-money flows stay disabled (`PAYMENTS_ENABLED=false`) until verification, store compliance and security tests pass.

### 3.5 Entitlement rule (single function, unit-tested)
A user may play episode *E* of drama *D* if **any** holds:
- `E.access = FREE`, or `E.number ≤ D.freeEpisodeCount`;
- user has an `ACTIVE` / `IN_GRACE_PERIOD` subscription with `current_period_end > now`;
- an `episode_unlocks` row exists for (user, E) and is not expired.

Otherwise the episode is locked. Unlocking with coins = one transaction: lock wallet row (`SELECT … FOR UPDATE`), check balance, insert ledger (`unlock:{userId}:{episodeId}`), update balance, insert `episode_unlocks`.

### 3.6 Ads policy
- AdMob formats: rewarded (unlock / earn coins), interstitial (between episodes, capped by `min_episodes_between` and `min_seconds_between` — never every transition), native (catalog lists).
- Direct campaigns: API `GET /ads/serve?placement=…` picks an eligible creative (status, schedule, caps, targeting), returns a one-time `serveId`; impression/click beacons are deduplicated by `serveId`. Always labelled "Sponsored / प्रायोजित".
- Subscribers with an `adFree` product see no interstitial/native/sponsored ads; rewarded ads remain optional.
- AdMob revenue is imported into `ad_network_daily_reports`; direct-campaign billing is computed from `ad_impressions`/`ad_clicks` × contracted rate. The two are never summed into one "revenue" figure without labelling.
- Development uses Google's official test ad unit IDs only. UMP consent form shown where required.

## 4. Security baseline
- JWT verification on every protected route; `@Roles()`/`@Permissions()` guards for admin; ownership checks in services (never trust `userId` from the body — it comes from the token).
- Zod/class-validator DTOs, global exception filter with a stable error shape, request IDs (`x-request-id`) in every log line (pino, JSON).
- Rate limits (Redis-backed): auth-adjacent endpoints, comments, reward claims, SSV, purchase verification, reports.
- Strict CORS allow-list (admin origin only; mobile is not a browser). Helmet headers.
- Secrets only in server env / secret manager. Mobile config contains only public values (API URL, AdMob app id, Supabase anon key).
- Audit log for every admin write and every manual wallet adjustment.
- Account deletion endpoint + retention job; privacy policy & terms URLs in app settings.

## 5. Mobile app migration plan (from BytePlus VideoOne)

| BytePlus piece | Plan |
|---|---|
| `@byteplus/react-native-vod-player`, `utils/playerConfig.ts`, `ttsdk.lic`, `plugins/withLicense.js`, `withPodfileSources.js`, BytePlus Maven repos | **Remove.** Replace with `features/player/` (`PlayerAdapter` + `react-native-video` implementation). |
| `components/player/VideoPlayer.tsx` (pre-render engine) | Rewrite on the adapter. Keep controls, speed, quality UI. Preload = keep at most **3** mounted players (prev/current/next), only current plays. |
| `services/api.ts` → BytePlus demo host | Replace with typed API client (TanStack Query) to our API. |
| `services/userService.ts` (random local user id) | Replace with Supabase session + secure token storage (`expo-secure-store`). |
| `services/unlockService.ts` | Replace with entitlement/unlock/reward endpoints. |
| `components/ui/AdComponent.tsx` (10 s fake countdown) | Replace with real AdMob rewarded flow (`react-native-google-mobile-ads`). |
| Feed, carousel, lists, episode selector, unlock modals, speed/quality selectors, Lottie like | **Keep**, adapt props to our types, add i18n. |
| App identity `com.byteplus.videoone.rn`, `videoonern` scheme | Change to our own package id / scheme. |
| `package-lock.json` resolved to internal `bnpm.byted.org` | Regenerate against the public npm registry. |

Apache-2.0 obligations: keep `LICENSE`, keep BytePlus copyright headers in derived files, add a "Modified by Reel Drama" notice to changed files, include a `NOTICE`/attribution screen.

## 6. Repository layout

```
Short Drama app/                  (git root)
  apps/
    mobile/          Expo app (imported from BytePlus, migrated in Phase 4)
    admin/           Next.js admin            (Phase 8)
    api/             NestJS API + prisma/     (Phase 3)
  workers/
    video-transcoder/                         (Phase 5)
    notifications/                            (Phase 8)
  packages/
    shared-types/  validation/  config/
  infra/
    docker/          docker-compose for local dev
    cloudflare/      media worker
    deployment/
  docs/
    architecture.md  database.md  api.md  (video-pipeline.md, ads.md, deployment.md follow in their phases)
  VideoOneSolutions/ upstream clone — reference only, git-ignored
```

## 7. Environments
| Env | DB | Storage | Auth | Ads |
|---|---|---|---|---|
| local | Postgres 16 (Docker) | MinIO (Docker) | Supabase project (dev) or local HS256 test issuer | Google test units |
| staging | Managed Postgres / Supabase | R2 `reel-drama-staging` | Supabase staging | Google test units |
| production | Managed Postgres / Supabase (PITR on) | R2 `reel-drama-prod` | Supabase prod | Real units, SSV on |

## 8. Phase roadmap
1. ✅ Inspect BytePlus repo.
2. ✅ Architecture, schema, API contract, layout (this document).
3. API: auth, users, catalog, episodes, migrations, seed, tests.
4. Mobile: remove BytePlus SDK/demo services, adapter player, auth, API client, i18n.
5. Storage, upload, transcoder worker, playback tokens, media worker.
6. AdMob (rewarded SSV, interstitial, native) + direct campaign manager.
7. Wallet, unlocks, subscriptions, Play Billing verification.
8. Admin dashboard, notifications, monitoring, deployment, CI.
