-- CreateTable
CREATE TABLE "public"."analytics_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(60) NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "platform" "public"."Platform",
    "app_version" VARCHAR(20),
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_name_occurred_at_idx" ON "public"."analytics_events"("name", "occurred_at");

-- CreateIndex
CREATE INDEX "analytics_events_occurred_at_idx" ON "public"."analytics_events"("occurred_at");


-- Same policy as every table: no access via the Supabase Data API.
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;
