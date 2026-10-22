-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "public"."Platform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "public"."PublishStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."VideoOrientation" AS ENUM ('PORTRAIT', 'LANDSCAPE');

-- CreateEnum
CREATE TYPE "public"."EpisodeAccess" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "public"."VideoAssetStatus" AS ENUM ('AWAITING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."CommentStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."WalletTxnType" AS ENUM ('AD_REWARD', 'PURCHASE', 'EPISODE_UNLOCK', 'REFUND', 'REVERSAL', 'BONUS', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."RewardClaimStatus" AS ENUM ('PENDING', 'VERIFIED', 'GRANTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."RewardPurpose" AS ENUM ('COINS', 'EPISODE_UNLOCK');

-- CreateEnum
CREATE TYPE "public"."UnlockMethod" AS ENUM ('COINS', 'AD_REWARD', 'ADMIN_GRANT', 'PROMO');

-- CreateEnum
CREATE TYPE "public"."StoreProvider" AS ENUM ('GOOGLE_PLAY', 'APP_STORE');

-- CreateEnum
CREATE TYPE "public"."ProductKind" AS ENUM ('COIN_PACK', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'FULFILLED', 'FAILED', 'REFUNDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('ACTIVE', 'IN_GRACE_PERIOD', 'ON_HOLD', 'CANCELED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."AdFormat" AS ENUM ('REWARDED', 'INTERSTITIAL', 'NATIVE', 'SPONSORED_CARD', 'SPONSORED_VIDEO');

-- CreateEnum
CREATE TYPE "public"."AdSource" AS ENUM ('ADMOB', 'DIRECT');

-- CreateEnum
CREATE TYPE "public"."CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."PricingModel" AS ENUM ('CPM', 'CPC', 'FLAT');

-- CreateEnum
CREATE TYPE "public"."CreativeType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "public"."CreativeReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."NotificationJobStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "auth_provider_id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "locale" VARCHAR(8) NOT NULL DEFAULT 'en',
    "last_seen_at" TIMESTAMP(3),
    "deletion_requested_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(60),
    "avatar_key" TEXT,
    "bio" VARCHAR(280),
    "analytics_consent" BOOLEAN NOT NULL DEFAULT false,
    "ads_personalization_consent" BOOLEAN NOT NULL DEFAULT false,
    "marketing_consent" BOOLEAN NOT NULL DEFAULT false,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "consent_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "permissions" TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "public"."device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "public"."Platform" NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."languages" (
    "code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "native_name" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "names" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dramas" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "synopsis" TEXT,
    "primary_language_code" VARCHAR(8) NOT NULL,
    "poster_key" TEXT,
    "cover_key" TEXT,
    "cast" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[],
    "orientation" "public"."VideoOrientation" NOT NULL DEFAULT 'PORTRAIT',
    "maturity_rating" VARCHAR(10),
    "status" "public"."PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "free_episode_count" INTEGER NOT NULL DEFAULT 5,
    "default_unlock_coins" INTEGER NOT NULL DEFAULT 30,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "trending_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "view_count" BIGINT NOT NULL DEFAULT 0,
    "favorite_count" INTEGER NOT NULL DEFAULT 0,
    "episode_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dramas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."drama_translations" (
    "drama_id" UUID NOT NULL,
    "language_code" VARCHAR(8) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "synopsis" TEXT,

    CONSTRAINT "drama_translations_pkey" PRIMARY KEY ("drama_id","language_code")
);

-- CreateTable
CREATE TABLE "public"."drama_categories" (
    "drama_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "drama_categories_pkey" PRIMARY KEY ("drama_id","category_id")
);

-- CreateTable
CREATE TABLE "public"."seasons" (
    "id" UUID NOT NULL,
    "drama_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(160),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."episodes" (
    "id" UUID NOT NULL,
    "drama_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(160),
    "synopsis" TEXT,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "access" "public"."EpisodeAccess" NOT NULL DEFAULT 'PREMIUM',
    "unlock_coins" INTEGER,
    "status" "public"."PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "current_video_asset_id" UUID,
    "thumbnail_key" TEXT,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" BIGINT NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."video_assets" (
    "id" UUID NOT NULL,
    "episode_id" UUID,
    "status" "public"."VideoAssetStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',
    "original_key" TEXT NOT NULL,
    "hls_master_key" TEXT,
    "renditions" JSONB NOT NULL DEFAULT '[]',
    "thumbnail_key" TEXT,
    "preview_key" TEXT,
    "mime_type" VARCHAR(80),
    "size_bytes" BIGINT,
    "duration_ms" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "checksum_sha256" VARCHAR(64),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "uploaded_by" UUID,
    "processing_started_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subtitles" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "language_code" VARCHAR(8) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtitles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."watch_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "drama_id" UUID NOT NULL,
    "position_seconds" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."favorites" (
    "user_id" UUID NOT NULL,
    "drama_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","drama_id")
);

-- CreateTable
CREATE TABLE "public"."likes" (
    "user_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("user_id","episode_id")
);

-- CreateTable
CREATE TABLE "public"."comments" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" VARCHAR(500) NOT NULL,
    "status" "public"."CommentStatus" NOT NULL DEFAULT 'VISIBLE',
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "moderated_by" UUID,
    "moderated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."comment_reports" (
    "id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "details" VARCHAR(500),
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "public"."user_wallets" (
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "public"."wallet_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "public"."WalletTxnType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "actor_id" UUID,
    "note" VARCHAR(280),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reward_claims" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "purpose" "public"."RewardPurpose" NOT NULL,
    "episode_id" UUID,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "nonce" VARCHAR(64) NOT NULL,
    "status" "public"."RewardClaimStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(20) NOT NULL DEFAULT 'ADMOB',
    "provider_transaction_id" VARCHAR(128),
    "ssv_payload" JSONB,
    "rejection_reason" VARCHAR(120),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "granted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."episode_unlocks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "method" "public"."UnlockMethod" NOT NULL,
    "wallet_transaction_id" UUID,
    "reward_claim_id" UUID,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episode_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."products" (
    "id" UUID NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "kind" "public"."ProductKind" NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "coins" INTEGER,
    "bonus_coins" INTEGER NOT NULL DEFAULT 0,
    "period_days" INTEGER,
    "ad_free" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "provider" "public"."StoreProvider" NOT NULL,
    "provider_transaction_id" VARCHAR(200) NOT NULL,
    "purchase_token" TEXT,
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "price_amount_micros" BIGINT,
    "currency" VARCHAR(3),
    "verification_payload" JSONB,
    "verified_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "provider" "public"."StoreProvider" NOT NULL,
    "provider_subscription_id" VARCHAR(200) NOT NULL,
    "status" "public"."SubscriptionStatus" NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ad_placements" (
    "id" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "format" "public"."AdFormat" NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ad_configurations" (
    "id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "source" "public"."AdSource" NOT NULL,
    "platform" "public"."Platform" NOT NULL,
    "ad_unit_id" VARCHAR(120),
    "min_episodes_between" INTEGER,
    "min_seconds_between" INTEGER,
    "max_per_user_per_day" INTEGER,
    "reward_coins" INTEGER,
    "hide_for_subscribers" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ad_campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "advertiser_name" VARCHAR(120) NOT NULL,
    "advertiser_contact" VARCHAR(200),
    "status" "public"."CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "pricing_model" "public"."PricingModel" NOT NULL,
    "rate_paise" BIGINT NOT NULL,
    "total_budget_paise" BIGINT,
    "daily_impression_cap" INTEGER,
    "per_user_daily_cap" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ad_campaign_placements" (
    "campaign_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,

    CONSTRAINT "ad_campaign_placements_pkey" PRIMARY KEY ("campaign_id","placement_id")
);

-- CreateTable
CREATE TABLE "public"."ad_creatives" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "type" "public"."CreativeType" NOT NULL,
    "media_key" TEXT NOT NULL,
    "headline" VARCHAR(90),
    "cta_text" VARCHAR(30),
    "destination_url" TEXT NOT NULL,
    "label" VARCHAR(30) NOT NULL DEFAULT 'Sponsored',
    "review_status" "public"."CreativeReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ad_impressions" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "creative_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "user_id" UUID,
    "serve_id" VARCHAR(64) NOT NULL,
    "platform" "public"."Platform" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ad_clicks" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "creative_id" UUID NOT NULL,
    "placement_id" UUID NOT NULL,
    "user_id" UUID,
    "serve_id" VARCHAR(64) NOT NULL,
    "platform" "public"."Platform" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ad_network_daily_reports" (
    "id" UUID NOT NULL,
    "source" "public"."AdSource" NOT NULL DEFAULT 'ADMOB',
    "report_date" DATE NOT NULL,
    "ad_unit_id" VARCHAR(120) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "estimated_earnings_micros" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_network_daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_jobs" (
    "id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "deep_link" TEXT,
    "audience" JSONB NOT NULL,
    "status" "public"."NotificationJobStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "request_id" VARCHAR(64),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_id_key" ON "public"."users"("auth_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "public"."users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "public"."roles"("key");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "public"."user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "public"."device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "public"."device_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "public"."categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_sort_order_idx" ON "public"."categories"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "dramas_slug_key" ON "public"."dramas"("slug");

-- CreateIndex
CREATE INDEX "dramas_status_published_at_idx" ON "public"."dramas"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "dramas_status_trending_score_idx" ON "public"."dramas"("status", "trending_score" DESC);

-- CreateIndex
CREATE INDEX "dramas_status_is_featured_idx" ON "public"."dramas"("status", "is_featured");

-- CreateIndex
CREATE INDEX "drama_categories_category_id_idx" ON "public"."drama_categories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_drama_id_number_key" ON "public"."seasons"("drama_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_current_video_asset_id_key" ON "public"."episodes"("current_video_asset_id");

-- CreateIndex
CREATE INDEX "episodes_drama_id_status_number_idx" ON "public"."episodes"("drama_id", "status", "number");

-- CreateIndex
CREATE INDEX "episodes_status_published_at_idx" ON "public"."episodes"("status", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "episodes_drama_id_number_key" ON "public"."episodes"("drama_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "video_assets_original_key_key" ON "public"."video_assets"("original_key");

-- CreateIndex
CREATE INDEX "video_assets_episode_id_idx" ON "public"."video_assets"("episode_id");

-- CreateIndex
CREATE INDEX "video_assets_status_updated_at_idx" ON "public"."video_assets"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "subtitles_episode_id_language_code_key" ON "public"."subtitles"("episode_id", "language_code");

-- CreateIndex
CREATE INDEX "watch_history_user_id_updated_at_idx" ON "public"."watch_history"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "watch_history_user_id_drama_id_idx" ON "public"."watch_history"("user_id", "drama_id");

-- CreateIndex
CREATE UNIQUE INDEX "watch_history_user_id_episode_id_key" ON "public"."watch_history"("user_id", "episode_id");

-- CreateIndex
CREATE INDEX "favorites_user_id_created_at_idx" ON "public"."favorites"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "likes_episode_id_idx" ON "public"."likes"("episode_id");

-- CreateIndex
CREATE INDEX "comments_episode_id_status_created_at_idx" ON "public"."comments"("episode_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "comments_user_id_created_at_idx" ON "public"."comments"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "comments_status_report_count_idx" ON "public"."comments"("status", "report_count" DESC);

-- CreateIndex
CREATE INDEX "comment_reports_status_created_at_idx" ON "public"."comment_reports"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "comment_reports_comment_id_reporter_id_key" ON "public"."comment_reports"("comment_id", "reporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "public"."wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_created_at_idx" ON "public"."wallet_transactions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "wallet_transactions_reference_type_reference_id_idx" ON "public"."wallet_transactions"("reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "reward_claims_nonce_key" ON "public"."reward_claims"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "reward_claims_provider_transaction_id_key" ON "public"."reward_claims"("provider_transaction_id");

-- CreateIndex
CREATE INDEX "reward_claims_user_id_created_at_idx" ON "public"."reward_claims"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reward_claims_status_expires_at_idx" ON "public"."reward_claims"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "episode_unlocks_wallet_transaction_id_key" ON "public"."episode_unlocks"("wallet_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "episode_unlocks_reward_claim_id_key" ON "public"."episode_unlocks"("reward_claim_id");

-- CreateIndex
CREATE UNIQUE INDEX "episode_unlocks_user_id_episode_id_key" ON "public"."episode_unlocks"("user_id", "episode_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "public"."products"("sku");

-- CreateIndex
CREATE INDEX "payment_transactions_user_id_created_at_idx" ON "public"."payment_transactions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payment_transactions_status_created_at_idx" ON "public"."payment_transactions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_provider_transaction_id_key" ON "public"."payment_transactions"("provider", "provider_transaction_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_current_period_end_idx" ON "public"."subscriptions"("user_id", "status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_provider_subscription_id_key" ON "public"."subscriptions"("provider", "provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_placements_key_key" ON "public"."ad_placements"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ad_configurations_placement_id_platform_source_key" ON "public"."ad_configurations"("placement_id", "platform", "source");

-- CreateIndex
CREATE INDEX "ad_campaigns_status_start_at_end_at_idx" ON "public"."ad_campaigns"("status", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "ad_campaign_placements_placement_id_idx" ON "public"."ad_campaign_placements"("placement_id");

-- CreateIndex
CREATE INDEX "ad_creatives_campaign_id_review_status_is_active_idx" ON "public"."ad_creatives"("campaign_id", "review_status", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ad_impressions_serve_id_key" ON "public"."ad_impressions"("serve_id");

-- CreateIndex
CREATE INDEX "ad_impressions_campaign_id_occurred_at_idx" ON "public"."ad_impressions"("campaign_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ad_impressions_user_id_campaign_id_occurred_at_idx" ON "public"."ad_impressions"("user_id", "campaign_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "ad_clicks_serve_id_key" ON "public"."ad_clicks"("serve_id");

-- CreateIndex
CREATE INDEX "ad_clicks_campaign_id_occurred_at_idx" ON "public"."ad_clicks"("campaign_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "ad_network_daily_reports_source_report_date_ad_unit_id_key" ON "public"."ad_network_daily_reports"("source", "report_date", "ad_unit_id");

-- CreateIndex
CREATE INDEX "notification_jobs_status_scheduled_at_idx" ON "public"."notification_jobs"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "public"."audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "public"."audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "public"."audit_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "public"."user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dramas" ADD CONSTRAINT "dramas_primary_language_code_fkey" FOREIGN KEY ("primary_language_code") REFERENCES "public"."languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drama_translations" ADD CONSTRAINT "drama_translations_drama_id_fkey" FOREIGN KEY ("drama_id") REFERENCES "public"."dramas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drama_translations" ADD CONSTRAINT "drama_translations_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drama_categories" ADD CONSTRAINT "drama_categories_drama_id_fkey" FOREIGN KEY ("drama_id") REFERENCES "public"."dramas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drama_categories" ADD CONSTRAINT "drama_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."seasons" ADD CONSTRAINT "seasons_drama_id_fkey" FOREIGN KEY ("drama_id") REFERENCES "public"."dramas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."episodes" ADD CONSTRAINT "episodes_drama_id_fkey" FOREIGN KEY ("drama_id") REFERENCES "public"."dramas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."episodes" ADD CONSTRAINT "episodes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."episodes" ADD CONSTRAINT "episodes_current_video_asset_id_fkey" FOREIGN KEY ("current_video_asset_id") REFERENCES "public"."video_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."video_assets" ADD CONSTRAINT "video_assets_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subtitles" ADD CONSTRAINT "subtitles_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subtitles" ADD CONSTRAINT "subtitles_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "public"."languages"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."watch_history" ADD CONSTRAINT "watch_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."watch_history" ADD CONSTRAINT "watch_history_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_drama_id_fkey" FOREIGN KEY ("drama_id") REFERENCES "public"."dramas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."likes" ADD CONSTRAINT "likes_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comment_reports" ADD CONSTRAINT "comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."comment_reports" ADD CONSTRAINT "comment_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_wallets" ADD CONSTRAINT "user_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_wallets"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reward_claims" ADD CONSTRAINT "reward_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reward_claims" ADD CONSTRAINT "reward_claims_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "public"."ad_placements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reward_claims" ADD CONSTRAINT "reward_claims_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."episode_unlocks" ADD CONSTRAINT "episode_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."episode_unlocks" ADD CONSTRAINT "episode_unlocks_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_transactions" ADD CONSTRAINT "payment_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_transactions" ADD CONSTRAINT "payment_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_configurations" ADD CONSTRAINT "ad_configurations_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "public"."ad_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_campaign_placements" ADD CONSTRAINT "ad_campaign_placements_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_campaign_placements" ADD CONSTRAINT "ad_campaign_placements_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "public"."ad_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_creatives" ADD CONSTRAINT "ad_creatives_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_impressions" ADD CONSTRAINT "ad_impressions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_impressions" ADD CONSTRAINT "ad_impressions_creative_id_fkey" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_impressions" ADD CONSTRAINT "ad_impressions_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "public"."ad_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_clicks" ADD CONSTRAINT "ad_clicks_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_clicks" ADD CONSTRAINT "ad_clicks_creative_id_fkey" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ad_clicks" ADD CONSTRAINT "ad_clicks_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "public"."ad_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ───────────── Integrity rules not expressible in Prisma (see docs/database.md) ─────────────

ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_balance_nonneg" CHECK ("balance" >= 0);
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_txn_amount_nonzero" CHECK ("amount" <> 0);
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_number_positive" CHECK ("number" > 0);
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_window" CHECK ("end_at" > "start_at");
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_https" CHECK ("destination_url" LIKE 'https://%');

CREATE OR REPLACE FUNCTION "forbid_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "wallet_transactions_immutable"
  BEFORE UPDATE OR DELETE ON "wallet_transactions"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();

CREATE TRIGGER "audit_logs_immutable"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();

-- ───────────── Row Level Security ─────────────
-- All access goes through our API (table owner, bypasses RLS). Enabling RLS with no
-- policies blocks the Supabase Data API (anon/authenticated keys) from every table.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
