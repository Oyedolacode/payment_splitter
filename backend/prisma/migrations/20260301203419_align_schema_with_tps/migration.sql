-- AlterEnum
ALTER TYPE "JobStatus" ADD VALUE 'REVIEW_REQUIRED';

-- AlterTable
ALTER TABLE "firms" ADD COLUMN     "allocation_mode" TEXT NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "payment_jobs" ADD COLUMN     "journal_entry_id" TEXT;

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
