/*
  Warnings:

  - A unique constraint covering the columns `[stripe_customer_id]` on the table `firms` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[subscription_id]` on the table `firms` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "firms" ADD COLUMN     "is_subscribed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "stripe_customer_id" TEXT,
ADD COLUMN     "subscription_id" TEXT,
ADD COLUMN     "subscription_status" TEXT,
ADD COLUMN     "trial_ends_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "firms_stripe_customer_id_key" ON "firms"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "firms_subscription_id_key" ON "firms"("subscription_id");
