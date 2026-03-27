-- Add is_default column to split_rules table
ALTER TABLE "split_rules" ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT FALSE;
