# Reel Drama — mobile app

Expo SDK 58 · React Native 0.88 (New Architecture) · Expo Router · TanStack Query · Zustand · i18next (English/Hindi).
Player: `react-native-video` (ExoPlayer/AVPlayer, HLS ABR + manual quality on Android) behind `src/features/player/VideoSurface.tsx`.
UI derived from BytePlus VideoOne (Apache-2.0) — see the in-app *Open-source licences* screen.

## Run (needs a development build — not Expo Go, because of native video/ads/billing modules)
```bash
cp .env.example .env.local        # set EXPO_PUBLIC_API_URL (emulator: http://10.0.2.2:3000/api/v1)
npm install
npx expo run:android              # builds and installs a dev client (Android Studio + JDK 17)
# or cloud build without Android Studio:
npx eas build --profile development --platform android
```
The API must run with `DEV_MEDIA_PROXY=true` and `MEDIA_BASE_URL`/`MEDIA_PUBLIC_BASE_URL` pointing at an address the phone can reach (your PC's LAN IP or a tunnel).

## Structure
| Path | What |
|---|---|
| `src/app/` | Routes: tabs (For You, Discover, My List, Profile), `watch/[dramaId]`, `drama/[id]`, search, category, sign-in, wallet, vip, settings, licences |
| `src/features/player/` | `VideoSurface` (provider adapter), `EpisodePager` (≤3 mounted players), `EpisodeSlide`, sheets, pure `logic.ts` |
| `src/features/ads/` | UMP consent + AdMob init, rewarded flow with server-side verification polling, interstitial policy, sponsored card |
| `src/features/wallet/`, `payments/` | Unlock sheet (coins / rewarded ad / VIP), Google Play Billing → server verification |
| `src/features/auth/` | Supabase email OTP (+ dev accounts in dev builds), session in SecureStore |
| `src/lib/` | API client & types, i18n, query client, config |

## Checks
`npm run typecheck` · `npm run lint` · `npm test` · `npx expo export --platform android` · `npx expo-doctor` · Maestro: `maestro test e2e/watch-flow.yaml`

## Production build checklist
`APP_VARIANT=production`, real `ADMOB_ANDROID_APP_ID`, Supabase URL/anon key, `EXPO_PUBLIC_API_URL` (https), `google-services.json` for push, no `EXPO_PUBLIC_DEV_LOGIN`. The config throws if a production build is misconfigured.
