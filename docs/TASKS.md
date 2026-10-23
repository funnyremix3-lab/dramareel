# Build queue

The build-test loop (`.claude/skills/build-test-loop`) works through this list top to bottom.
Mark items `[x]` only after `bash scripts/verify.sh` passes and the work is committed.
Add newly discovered work at the right place instead of doing it silently.

## Done
- [x] Phase 1 — inspect BytePlus VideoOne
- [x] Phase 2 — architecture, schema, API contract
- [x] Phase 3 — API: auth, users, catalog, entitlements, seed
- [x] Phase 5 — storage, transcoder, playback tokens, media worker, engagement APIs
- [x] Phases 6–7 backend — wallet, unlocks, rewarded SSV, direct campaigns, Play Billing

## Phase 4 — mobile app (Expo SDK 58, apps/mobile)
- [x] Scaffold SDK 58 app, config, deps, BytePlus assets
- [x] API client, types, i18n (en/hi), Supabase + dev auth, query client, UI primitives
- [x] Player core: VideoSurface adapter (react-native-video), logic, prefs, hooks
- [x] Root layout + providers, tabs (For You, Discover, My List, Profile)
- [x] Episode pager (vertical swipe, ≤3 mounted players, pause on blur/background, FLAG_SECURE)
- [x] Player overlay: like (Lottie), comments, episode selector, quality/speed sheets, progress bar
- [x] Locked slide + unlock sheet (coins / rewarded ad / VIP)
- [x] Discover: featured carousel, rails, categories, search, sponsored card
- [x] Drama detail, category list, My List, Profile, wallet, VIP, settings, licences, sign-in
- [x] Ads: consent (UMP), init, rewarded flow with SSV polling, interstitial frequency policy
- [x] Payments: react-native-iap purchase flow → server verify
- [x] Push token registration (expo-notifications, FCM)
- [x] Sentry init (DSN optional)
- [x] Consent-gated product analytics (client events → API → admin reports)
- [x] Jest tests: logic, api client, i18n parity, key components; Maestro e2e flow file
- [x] `expo export` bundles for Android; expo-doctor 20/20
- [x] Native Android build: release APK (arm64, JS bundled) builds locally — see docs/phone-testing.md
- [ ] On-device run on the user's phone (install builds/reel-drama-dev-arm64.apk) — needs the user

## Phase 8 — admin, ops, deployment
- [x] API admin endpoints: dramas/episodes CRUD+publish, categories, users, moderation, ad placements/campaigns/creatives, reports CSV, roles, audit log, notifications, overview metrics
- [x] workers/notifications (FCM HTTP v1, scheduled jobs)
- [x] apps/admin (Next.js + Tailwind + TanStack Query + Zod), RBAC route protection
- [x] Admin follow-ups: /me returns permissions (custom roles), dev-media CORP cross-origin, expose Content-Disposition, creative self-approval guard, subtitles admin API, docs/api.md routes match controllers
- [x] Mobile: render subtitles (WebVTT text tracks) when available
- [x] API Dockerfile, compose services for api/workers/admin
- [x] CI workflow (lint, typecheck, tests)
- [x] docs/deployment.md (env checklist, migrations, backup/restore, HTTPS, health, monitoring, Android build, store checklist, cost monitoring)
- [x] Data retention: account-deletion purge after 30 days, cancel on sign-in, prune analytics/ad events > 13 months
- [x] Final README pass
