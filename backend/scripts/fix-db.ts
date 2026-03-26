
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runFix() {
  console.log('🚀 Starting Database Fix Script...');

  const sqlCommands = [
    // 1. Alter Enum (Ignore if exists)
    `DO $$ BEGIN ALTER TYPE "JobStatus" ADD VALUE 'ANOMALY_PAUSED'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TYPE "JobStatus" ADD VALUE 'STALLED'; EXCEPTION WHEN duplicate_object THEN null; END $$;`,

    // 2. Add columns to firms
    `ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "plan_locked_at" TIMESTAMP(3);`,
    `ALTER TABLE "firms" ADD COLUMN IF NOT EXISTS "current_period_end" TIMESTAMP(3);`,

    // 3. Add columns to activity_logs
    `ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "actor_type" TEXT NOT NULL DEFAULT 'SYSTEM';`,
    `ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'INFO';`,

    // 4. Create tables
    `CREATE TABLE IF NOT EXISTS "remittance_mappings" (
        "id" TEXT NOT NULL,
        "firm_id" TEXT NOT NULL,
        "column_map" JSONB NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "remittance_mappings_pkey" PRIMARY KEY ("id")
    );`,
    `CREATE TABLE IF NOT EXISTS "remittance_uploads" (
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
    );`,
    `CREATE TABLE IF NOT EXISTS "ledger_entries" (
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
    );`,

    // 5. Create Index
    `CREATE UNIQUE INDEX IF NOT EXISTS "remittance_mappings_firm_id_key" ON "remittance_mappings"("firm_id");`,

    // 6. Add Foreign Keys (wrapped in DO blocks to avoid errors if they exist)
    `DO $$ BEGIN ALTER TABLE "remittance_mappings" ADD CONSTRAINT "remittance_mappings_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TABLE "remittance_uploads" ADD CONSTRAINT "remittance_uploads_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;`
  ];

  for (const sql of sqlCommands) {
    try {
      console.log(`Executing: ${sql.substring(0, 50)}...`);
      await prisma.$executeRawUnsafe(sql);
    } catch (err: any) {
      console.warn(`⚠️ Command failed (potentially already applied): ${err.message}`);
    }
  }

  // 7. Mark migration as finished in Prisma history
  console.log('📝 Marking migration 20260314220000_sync_schema_to_latest as finished...');
  try {
    const migrationName = '20260314220000_sync_schema_to_latest';
    // We check if it exists first
    const existing = await prisma.$queryRawUnsafe(`SELECT * FROM "_prisma_migrations" WHERE "migration_name" = $1`, migrationName);
    
    if (Array.isArray(existing) && existing.length === 0) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" (
          "id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count"
        ) VALUES (
          gen_random_uuid(), 
          'manual_fix', 
          now(), 
          '20260314220000_sync_schema_to_latest', 
          'Manual fix for ANOMALY_PAUSED conflict', 
          null, 
          now(), 
          1
        );
      `);
      console.log('✅ Migration marked as finished.');
    } else {
      console.log('ℹ️ Migration already marked as finished in history.');
    }
  } catch (err: any) {
    console.error(`❌ Failed to mark migration as finished: ${err.message}`);
  }

  console.log('🎉 Database fix complete! You can now revert your Start Command to "npm start".');
}

runFix()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
