-- CreateEnum
CREATE TYPE "public"."ImportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'READY', 'DONE', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "public"."import_jobs" (
    "id" UUID NOT NULL,
    "drama_id" UUID,
    "status" "public"."ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "source_key" TEXT NOT NULL,
    "source_size_bytes" BIGINT,
    "title" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "synopsis" TEXT,
    "primary_language_code" VARCHAR(8) NOT NULL DEFAULT 'en',
    "category_slugs" TEXT[],
    "free_episode_count" INTEGER NOT NULL DEFAULT 10,
    "default_unlock_coins" INTEGER NOT NULL DEFAULT 30,
    "target_seconds" INTEGER NOT NULL DEFAULT 90,
    "tolerance_seconds" INTEGER NOT NULL DEFAULT 20,
    "auto_publish" BOOLEAN NOT NULL DEFAULT true,
    "total_episodes" INTEGER,
    "uploaded_episodes" INTEGER NOT NULL DEFAULT 0,
    "published_episodes" INTEGER NOT NULL DEFAULT 0,
    "step" VARCHAR(200),
    "last_error" TEXT,
    "claimed_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_jobs_status_created_at_idx" ON "public"."import_jobs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "public"."import_jobs" ADD CONSTRAINT "import_jobs_drama_id_fkey" FOREIGN KEY ("drama_id") REFERENCES "public"."dramas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
