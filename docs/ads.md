# Advertising, Rewards & Coins

There are two separate ad systems. **Their revenue is never mixed.**

| | AdMob (Google network) | Direct campaigns (first-party) |
|---|---|---|
| Who sells the ad | Google | Us, to directly contracted advertisers |
| Delivery | AdMob SDK in the app (`react-native-google-mobile-ads`) | `GET /ads/serve` → app renders a "Sponsored / प्रायोजित" card |
| Counting | Google reports impressions and earnings | `ad_impressions` / `ad_clicks`, one per signed serve |
| Revenue table | `ad_network_daily_reports` (imported) | Computed from delivery × contracted rate (CPM / CPC / FLAT) |

## Placements (seeded)
| Key | Format | Rules |
|---|---|---|
| `episode_unlock_rewarded` | Rewarded | Optional. Unlocks one locked episode. 20 per day. |
| `earn_coins_rewarded` | Rewarded | Optional. +10 coins. 10 per day. |
| `between_episodes_interstitial` | Interstitial | At most every 4 episode transitions **and** 5 minutes apart, 12 per day. Never on every swipe. |
| `catalog_native` | Native | In catalog lists |
| `home_sponsored_card` | Direct campaign | 20 per day |

`GET /ads/config?platform=ANDROID` returns these rules plus `adFree`. Subscribers to an `adFree` product (VIP) get no interstitial, native or sponsored ads. Rewarded ads stay available because they are opt-in.

## Rewarded ads: why the client is never trusted
```
App  ── POST /rewards/claims {placementKey, purpose, episodeId?, platform} ──► API
         checks: placement active, daily cap, episode really locked
     ◄── { claimId, adUnitId, ssv: { userId, customData: nonce } }
App  ── show rewarded ad with serverSideVerificationOptions = ssv ──► Google
Google ── GET /api/v1/ads/admob/ssv?...&signature=…&key_id=… ──► API
         verify ECDSA signature (Google's published keys) → custom_data → claim
         → same user → ad unit matches → not expired → transaction_id unused
         → one DB transaction: claim GRANTED + coins (ledger) or episode unlock
App  ── GET /rewards/claims/{id} (poll ~10 s) ──► GRANTED / REJECTED / EXPIRED
```
- The SDK's `onEarnedReward` callback only tells the app to start polling. It grants nothing.
- Replays are no-ops: `transaction_id` and the claim nonce are unique, and the ledger key is `reward:{claimId}`.
- Rewards are never given for clicking an ad. Impressions and clicks are never generated artificially.
- **Development:** Google's test ad units do not send SSV callbacks. While `ADMOB_SSV_ENABLED=false` and outside production, the app can call `POST /api/v1/dev/rewards/claims/{id}/complete` to simulate the callback. That endpoint does not exist in production builds of the API, and the API refuses to start in production with SSV disabled.

### AdMob setup (needs your account)
1. Create the app in AdMob and add the Android app ID to `apps/mobile/app.config.ts` (`ADMOB_ANDROID_APP_ID`).
2. Create ad units for rewarded, interstitial and native. Put their IDs in the admin dashboard (Ads → Placements), or update `ad_configurations`.
3. On each rewarded ad unit, enable server-side verification with the callback URL `https://api.<domain>/api/v1/ads/admob/ssv`.
4. Set `ADMOB_SSV_ENABLED=true` on the API.
5. Configure the UMP consent message (GDPR and US states) in AdMob → Privacy & messaging. The app shows it on launch where required.
6. Publish `app-ads.txt` on your developer website.

## Direct campaigns
- Admins create campaigns with:
  - an advertiser, dates and status
  - a pricing model and rate in paise
  - a total budget, a daily impression cap and a per-user daily cap
  - priority, targeting (languages and platforms) and placements
- Creatives (image or video) are uploaded and must be **approved** before they serve. Destination URLs must be `https://`; the database enforces this.
- `GET /ads/serve` picks the highest-priority eligible campaign, rotating randomly within the same priority, and returns a signed `serveToken` that is valid for 1 hour.
- `POST /ads/impressions` and `POST /ads/clicks` take the serve token:
  - **Impressions:** at most one per serve.
  - **Clicks:** at most one per serve, and only after an impression.
  - **Signed-in serves:** only the same user can report them.
- Campaign reports: delivery per day, CTR and spend (`impressions/1000 × CPM` or `clicks × CPC`). Exportable from the admin dashboard.

## Coins & unlocks
- The wallet is server-authoritative. `user_wallets.balance` is a cache of the append-only `wallet_transactions` ledger, and both are updated in the same transaction while the wallet row is locked (`SELECT … FOR UPDATE`).
- Idempotency keys:
  - `unlock:{userId}:{episodeId}`
  - `reward:{claimId}`
  - `purchase:{paymentId}`
  - `refund:{paymentId}`
- A refund takes coins back but never below zero. Any shortfall goes to the audit log for support follow-up.
- Integration tests verify that concurrent unlocks and purchases never double-charge or overspend, and that the ledger always matches the balance.

## Payments (Google Play Billing)
- Kept behind `PAYMENTS_ENABLED=false` until the Play Console products, the service account and RTDN are configured and tested.
- The app sets `obfuscatedAccountIdAndroid = user id` when it launches billing. The API rejects tokens bought for another account.
- `POST /payments/google-play/verify` re-fetches the purchase from Google and fulfils it once. Coin packs are then consumed; subscriptions are acknowledged.
- `POST /payments/google-play/rtdn` (Pub/Sub push with a Google OIDC token) handles renewals, cancellations (access continues until the period ends), expiry, purchases the app never reported, and refunds or voided purchases.
- iOS StoreKit plugs into the same service shape later.
