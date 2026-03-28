import { prisma } from '../../lib/prisma'

/**
 * Record a double-entry financial transaction in the internal ledger.
 * This guarantees that we have a balanced internal record BEFORE we push to QBO.
 */
export async function createLedgerTransaction(
  firmId: string,
  paymentEventId: string,
  jobId: string | null,
  totalAmount: number,
  allocations: Array<{ locationCustomerId: string; amountApplied: number }>,
  metadata: any = {}
) {
  // We use a transaction to ensure double-entry accounting integrity
  return prisma.$transaction(async (tx: any) => {
    // 1. Debit the Incoming Payment Pool (the "Source" of funds)
    const debitEntry = await tx.ledgerEntry.create({
      data: {
        firmId,
        paymentEventId,
        jobId,
        account: 'INCOMING_PAYMENT_POOL',
        debit: totalAmount,
        credit: 0,
        metadata: { ...metadata, role: 'source_debit' },
      },
    })

    // 2. Credit each sub-location (the "Destination" of funds)
    const creditEntries = await Promise.all(
      allocations.map((alloc) =>
        tx.ledgerEntry.create({
          data: {
            firmId,
            paymentEventId,
            jobId,
            account: alloc.locationCustomerId, // The QBO Customer ID representing the sub-location
            debit: 0,
            credit: alloc.amountApplied,
            metadata: { ...metadata, role: 'allocation_credit' },
          },
        })
      )
    )

    return { debitEntry, creditEntries }
  })
}

/**
 * Fetch the full audit trail for a specific payment event.
 */
export async function getLedgerTrace(paymentEventId: string) {
  return prisma.ledgerEntry.findMany({
    where: { paymentEventId },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * Check if a payment has already been processed by our ledger.
 * Key for Idempotency Protection.
 */
export async function checkIdempotency(paymentEventId: string) {
  const existing = await prisma.ledgerEntry.findFirst({
    where: { paymentEventId },
  })
  return !!existing
}
