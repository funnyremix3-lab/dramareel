# Test the app on a phone (local network)

This runs the whole stack on your PC and the app on an Android phone on the **same Wi-Fi**.

## 1. Start the backend on the PC
```bash
docker compose -f infra/docker/docker-compose.yml up -d        # Postgres, Redis, S3
cd apps/api && npm run build && node dist/main.js              # API on :3000
```
`apps/api/.env` must contain (local development only):
```
DEV_MEDIA_PROXY=true
MEDIA_BASE_URL=http://<PC-LAN-IP>:3000/dev-media
MEDIA_PUBLIC_BASE_URL=http://<PC-LAN-IP>:3000/dev-media
DEV_JWT_SECRET=<32+ random chars>      # enables the "dev account" sign-in buttons
```
Find the LAN IP with `ipconfig` (Wi-Fi adapter → IPv4 Address). Check from the phone's browser that `http://<PC-LAN-IP>:3000/api/v1/health/live` shows `{"status":"ok"}`. If it doesn't, allow Node.js on **Private** networks in Windows Defender Firewall.

Sample videos must exist in local storage: `cd workers/video-transcoder && npm run seed:media`.

## 2. Build an installable APK (JS bundled inside, no Metro needed)
```bash
cd apps/mobile
# .env.local
#   APP_VARIANT=preview
#   EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:3000/api/v1
#   EXPO_PUBLIC_DEV_LOGIN=true
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a   # debug-key signed, testing only
# → android/app/build/outputs/apk/release/app-release.apk
```
Windows tips:
- Build from a short path without spaces (e.g. `C:\rd\mobile`). Long paths break CMake.
- In `android/local.properties`, write `sdk.dir=C:/Android/Sdk` with forward slashes.
- Expo SDK 58 needs the Android 37 platform (`sdkmanager "platforms/android-37.0"`).
- The SDK's CMake 3.22.1 ships ninja 1.10, which fails on paths over 260 characters. Replace `<sdk>/cmake/3.22.1/bin/ninja.exe` with ninja 1.12+ (long-path aware) and keep Windows LongPathsEnabled=1.
- If Gradle cannot download its distribution, download the zip with a browser or curl and point `distributionUrl` at the local file.
- Set `JAVA_HOME` to JDK 17.

Copy the APK to the phone and install it. You will need to allow "Install unknown apps" for your file manager.

Cleartext `http://` is allowed only in non-production variants (`usesCleartextTraffic`). Production builds must use HTTPS.

## 3. What to try
1. **For You** feed plays episode 1 of each drama without signing in.
2. **Profile → Sign in → dev account `viewer`**: this account has 100 coins.
3. Open a drama and swipe up through the episodes. Episode 6 is locked:
   - **Coins:** unlock it for 30 coins.
   - **Ad:** "Watch an ad" plays a Google test rewarded ad. The dev server confirms the reward because test ads never send SSV.
4. Like an episode, comment on it, then report or block from a long-press on a comment.
5. Switch the language to हिन्दी in Profile.
6. **Settings → Delete account** signs you out. Signing back in within 30 days cancels the deletion.
