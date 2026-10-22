# Reel Drama — Database

Source of truth: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) (Prisma 6, PostgreSQL 15+). 37 tables, validated with `prisma validate`; `prisma migrate diff` from empty produces 37 tables, 64 indexes and 51 foreign keys.

## Conventions
- UUID primary keys, `snake_case` table and column names (`@@map` / `@map`).
- `created_at` everywhere; `updated_at` on mutable rows. Append-only tables (`wallet_transactions`, `audit_logs`, `ad_impressions`, `ad_clicks`) have no `updated_at`.
- Money as integers: store prices in `*_micros` (Google Play format), contract rates in `*_paise`. Coins are integers.
- Localised text: drama title/synopsis in `drama_translations`; short labels (category names, notification text) as JSON `{ "en": …, "hi": … }`.
- Media: only object keys (`originals/…`, `processed/…`) and metadata. Never binaries.

## Domains

| Domain | Tables |
|---|---|
| Identity | `users`, `user_profiles`, `roles`, `user_roles`, `device_tokens` |
| Catalog | `languages`, `categories`, `dramas`, `drama_translations`, `drama_categories`, `seasons`, `episodes` |
| Media | `video_assets`, `subtitles` |
| Engagement | `watch_history`, `favorites`, `likes`, `comments`, `comment_reports`, `user_blocks` |
| Economy | `user_wallets`, `wallet_transactions`, `reward_claims`, `episode_unlocks` |
| Store | `products`, `payment_transactions`, `subscriptions` |
| Ads | `ad_placements`, `ad_configurations`, `ad_campaigns`, `ad_campaign_placements`, `ad_creatives`, `ad_impressions`, `ad_clicks`, `ad_network_daily_reports` |
| Ops | `notification_jobs`, `audit_logs` |

Tables added beyond the original list, and why:
- `drama_translations`: Hindi/English titles.
- `user_blocks`: lets a user block an abusive commenter.
- `device_tokens`: needed for push notifications.
- `products`: coin packs and subscription plans, mapped to store SKUs.
- `ad_campaign_placements`: lets one campaign target several placements.
- `ad_network_daily_reports`: keeps AdMob revenue separate from direct billing.

## Key relationships
- `dramas 1─* seasons 1─* episodes`; `episodes.drama_id` is denormalised so the swipe feed is a single indexed range scan `(drama_id, status, number)`.
- `episodes.current_video_asset_id → video_assets` (1:1, unique). Old assets stay for rollback.
- `user_wallets.user_id` is both PK and FK to `users` (one wallet per user). `wallet_transactions.user_id → user_wallets.user_id`.
- `episode_unlocks (user_id, episode_id)` is unique. An unlock references either the wallet transaction that paid for it or the reward claim that earned it, and each reference is unique.

## Integrity rules that Prisma cannot express
These go into the first migration as raw SQL (`migration.sql` is edited before applying):

```sql
-- Wallet balance can never go negative
ALTER TABLE user_wallets ADD CONSTRAINT user_wallets_balance_nonneg CHECK (balance >= 0);

-- Ledger and audit log are append-only
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_transactions_immutable
  BEFORE UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Sanity checks
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_txn_amount_nonzero CHECK (amount <> 0);
ALTER TABLE episodes ADD CONSTRAINT episodes_number_positive CHECK (number > 0);
ALTER TABLE ad_campaigns ADD CONSTRAINT ad_campaigns_window CHECK (end_at > start_at);
ALTER TABLE ad_creatives ADD CONSTRAINT ad_creatives_https CHECK (destination_url LIKE 'https://%');
```

Because wallet rows cascade-restrict (`onDelete: Restrict`), deleting a user is a soft delete (`status = DELETED`, PII purged) rather than a row delete.

## Wallet write algorithm (all coin movements)
```
BEGIN;
  SELECT balance FROM user_wallets WHERE user_id = $1 FOR UPDATE;
  -- if a row with this idempotency_key exists → return it (replay, no-op)
  new_balance := balance + amount;            -- amount < 0 for spends
  IF new_balance < 0 THEN ROLLBACK → 409 INSUFFICIENT_COINS;
  INSERT INTO wallet_transactions(…, amount, balance_after = new_balance, idempotency_key);
  UPDATE user_wallets SET balance = new_balance, version = version + 1;
  -- side effect in the same tx: episode_unlocks / reward_claims.status / payment status
COMMIT;
```
Idempotency keys: `reward:{claimId}`, `purchase:{paymentId}`, `unlock:{userId}:{episodeId}`, `refund:{paymentId}`, `admin:{auditLogId}`.
A nightly reconciliation job asserts `user_wallets.balance = SUM(wallet_transactions.amount)` per user and alerts on any mismatch.

## Index rationale
| Query | Index |
|---|---|
| Home "new" / "trending" rails | `dramas(status, published_at DESC)`, `dramas(status, trending_score DESC)`, `dramas(status, is_featured)` |
| Episode list & swipe-next | `episodes(drama_id, status, number)`, unique `(drama_id, number)` |
| Continue watching | `watch_history(user_id, updated_at DESC)`, unique `(user_id, episode_id)` |
| Comments under an episode | `comments(episode_id, status, created_at DESC)` |
| Moderation queue | `comments(status, report_count DESC)`, `comment_reports(status, created_at)` |
| Wallet history | `wallet_transactions(user_id, created_at DESC)` |
| Active campaign selection | `ad_campaigns(status, start_at, end_at)` |
| Per-user frequency caps | `ad_impressions(user_id, campaign_id, occurred_at)` |
| Transcoder sweeps | `video_assets(status, updated_at)` |
| Expiring reward claims | `reward_claims(status, expires_at)` |

Search starts with `ILIKE` on title over published dramas. That is fine at launch scale. A `pg_trgm` GIN index on `dramas.title` and `drama_translations.title` is added in Phase 3 if needed.

## Seed data (Phase 3)
- Languages `en`, `hi`. Six categories (Romance, Revenge, Family, Thriller, Comedy, Fantasy) with Hindi names.
- About six fictional dramas with 8–20 episodes each. The first five episodes of each are free.
- Videos come from public-domain or self-generated test clips, so no BytePlus content is used.
- System roles OWNER, CONTENT_MANAGER, ADS_MANAGER and SUPPORT_AGENT with their permission strings.
- Ad placements (`episode_unlock_rewarded`, `earn_coins_rewarded`, `between_episodes_interstitial`, `catalog_native`, `home_sponsored_card`) configured with Google **test** ad unit IDs.
- Products `coins_100`, `coins_500`, `vip_weekly` and `vip_monthly`, kept inactive until payments are enabled.
- **Development-only** accounts `owner@dev.local`, `content@dev.local`, `ads@dev.local`, `support@dev.local` and `viewer@dev.local`. The seed refuses to run when `NODE_ENV=production`.

## Backups & retention
- Production: managed Postgres with daily snapshots and PITR (7 days minimum). A monthly restore drill goes to a scratch instance and is documented in `docs/deployment.md`.
- Account deletion: the user is marked `deletionRequestedAt`. Signing in again (a token issued after the request) cancels it. After 30 days the hourly retention job in `workers/notifications` purges email, phone, profile, device tokens, watch history and blocks, blanks comments, detaches analytics, and keeps ledger, payment and unlock rows because financial records must be retained.
- `analytics_events`, `ad_impressions` and `ad_clicks` older than ~13 months are deleted by the same job (export reports first if long-term aggregates are needed).
