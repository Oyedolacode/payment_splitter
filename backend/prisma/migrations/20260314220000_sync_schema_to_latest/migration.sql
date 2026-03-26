-- AlterEnum
DO $$ BEGIN ALTER TYPE "JobStatus" ADD VALUE 'ANOMALY_PAUSED'; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
DO $$ BEGIN
  ALTER TABLE "firms" ADD COLUMN "plan_locked_at" TIMESTAMP(3);
EXCEPTION
  WHEN duplicate_column THEN RAISE NOTICE 'column plan_locked_at already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE "firms" ADD COLUMN "current_period_end" TIMESTAMP(3);
EXCEPTION
  WHEN duplicate_column THEN RAISE NOTICE 'column current_period_end already exists, skipping';
END $$;

-- AlterTable
DO $$ BEGIN
  ALTER TABLE "activity_logs" ADD COLUMN "actor_type" TEXT NOT NULL DEFAULT 'SYSTEM';
EXCEPTION
  WHEN duplicate_column THEN RAISE NOTICE 'column actor_type already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE "activity_logs" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'INFO';
EXCEPTION
  WHEN duplicate_column THEN RAISE NOTICE 'column severity already exists, skipping';
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "remittance_mappings" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "column_map" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remittance_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "remittance_uploads" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remittance_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ledger_entries" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "payment_event_id" TEXT NOT NULL,
    "job_id" TEXT,
    "account" TEXT NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "remittance_mappings_firm_id_key" ON "remittance_mappings"("firm_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "remittance_mappings" ADD CONSTRAINT "remittance_mappings_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN RAISE NOTICE 'constraint remittance_mappings_firm_id_fkey already exists, skipping';
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "remittance_uploads" ADD CONSTRAINT "remittance_uploads_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN RAISE NOTICE 'constraint remittance_uploads_firm_id_fkey already exists, skipping';
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN RAISE NOTICE 'constraint ledger_entries_firm_id_fkey already exists, skipping';
END $$;
