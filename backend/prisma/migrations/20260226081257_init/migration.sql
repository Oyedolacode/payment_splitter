-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETE', 'FAILED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "firms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qbo_realm_id" TEXT,
    "xero_tenant_id" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_rules" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "parent_customer_id" TEXT NOT NULL,
    "rule_type" TEXT NOT NULL,
    "rule_config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "split_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_jobs" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "payment_id" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "total_amount" DECIMAL(15,2) NOT NULL,
    "split_result" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "payment_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "sub_location_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_applied" DECIMAL(15,2) NOT NULL,
    "qbo_payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "firms_qbo_realm_id_key" ON "firms"("qbo_realm_id");

-- CreateIndex
CREATE UNIQUE INDEX "firms_xero_tenant_id_key" ON "firms"("xero_tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_jobs_firm_id_payment_id_key" ON "payment_jobs"("firm_id", "payment_id");

-- AddForeignKey
ALTER TABLE "split_rules" ADD CONSTRAINT "split_rules_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_jobs" ADD CONSTRAINT "payment_jobs_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_jobs" ADD CONSTRAINT "payment_jobs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "split_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "payment_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
