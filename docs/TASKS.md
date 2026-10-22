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
- [ ] Root layout + providers, tabs (For You, Discover, My List, Profile)
- [ ] Episode pager (vertical swipe, ≤3 mounted players, pause on blur/background, FLAG_SECURE)
- [ ] Player overlay: like (Lottie), comments, episode selector, quality/speed sheets, progress bar
- [ ] Locked slide + unlock sheet (coins / rewarded ad / VIP)
- [ ] Discover: featured carousel, rails, categories, search, sponsored card
- [ ] Drama detail, category list, My List, Profile, wallet, VIP, settings, licences, sign-in
- [ ] Ads: consent (UMP), init, rewarded flow with SSV polling, interstitial frequency policy
- [ ] Payments: react-native-iap purchase flow → server verify
- [ ] Push token registration (expo-notifications, FCM)
- [ ] Sentry init (DSN optional), consent-gated analytics shim
- [ ] Jest tests: logic, api client, i18n parity, key components; Maestro e2e flow file
- [ ] `expo export` bundles for Android; prebuild sanity

## Phase 8 — admin, ops, deployment
- [ ] API admin endpoints: dramas/episodes CRUD+publish, categories, users, moderation, ad placements/campaigns/creatives, reports CSV, roles, audit log, notifications, overview metrics
- [ ] workers/notifications (FCM HTTP v1, scheduled jobs)
- [ ] apps/admin (Next.js + Tailwind + TanStack Query + Zod), RBAC route protection
- [ ] API Dockerfile, compose services for api/workers/admin
- [ ] CI workflow (lint, typecheck, tests)
- [ ] docs/deployment.md (env checklist, migrations, backup/restore, HTTPS, health, monitoring, Android build, store checklist, cost monitoring)
- [ ] Final README pass
