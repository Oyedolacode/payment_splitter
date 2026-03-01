import { Worker, Job } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { fetchPayment, fetchOpenInvoices, postBatch, deletePayment, QBOBatchItemRequest, createJournalEntry } from '../services/qboClient'
import { calculateSplit, assertSplitInvariant, RuleConfig, Allocation } from '../services/splitCalculator'
import { sendJobCompleteEmail, sendJobFailedEmail } from '../services/email'
import { JobStatus } from '@prisma/client'
import { logActivity } from '../lib/activityLogger'

export const QUEUE_NAME = 'payment-processing'

export interface PaymentJobData {
  jobId: string       // payment_jobs.id (our DB record)
  firmId: string
  realmId: string
  paymentId: string   // QBO Payment.Id
  paymentAmount?: number // Optional: used for manual triggers to skip QBO fetch
  bypassReview?: boolean // If true, skip the REVIEW_REQUIRED check
}

/**
 * Chunk an array into groups of maxSize.
 * Critical for QBO batch API which hard-limits at 30 operations per call.
 */
function chunk<T>(arr: T[], maxSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += maxSize) {
    chunks.push(arr.slice(i, i + maxSize))
  }
  return chunks
}

/**
 * Process a single payment job end-to-end:
 * 1. Fetch payment + invoices from QBO
 * 2. Run split calculator
 * 3. Assert invariant
 * 4. Post split payments via batch API (max 30 per call)
 * 5. On any failure → rollback all posted payments
 * 6. Write audit log
 */
async function processPayment(job: Job<PaymentJobData>): Promise<void> {
  const { jobId, firmId, realmId, paymentId, paymentAmount: manualAmount } = job.data

  // Track posted QBO payment IDs for rollback
  const postedPayments: Array<{ id: string; syncToken: string }> = []
  let firm: any = null

  try {
    // ── Check subscription status ──────────────────────────────────────────
    firm = (await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })) as any
    const isTrialing = firm.trialEndsAt && firm.trialEndsAt > new Date()

    if (!firm.isSubscribed && !isTrialing) {
      throw new Error('Firm subscription is required to process automated payment splits.')
    }

    // ── Mark job as processing ──────────────────────────────────────────────
    await prisma.paymentJob.update({
      where: { id: jobId },
      data: { status: JobStatus.PROCESSING },
    })

    // ── Determine payment amount and parent customer ─────────────────────────
    let paymentAmount: number
    let parentCustomerId: string
    let activeRule: any

    if (paymentId.startsWith('MANUAL-') && manualAmount !== undefined) {
      paymentAmount = manualAmount
      const dbJob = await prisma.paymentJob.findUniqueOrThrow({
        where: { id: jobId },
        include: { rule: true }
      })
      if (!dbJob.rule) throw new Error(`No split rule attached to manual job ${jobId}`)
      parentCustomerId = dbJob.rule.parentCustomerId
      activeRule = dbJob.rule
    } else {
      const payment = await fetchPayment(firmId, realmId, paymentId)
      paymentAmount = payment.TotalAmt
      parentCustomerId = payment.CustomerRef.value

      const rule = await prisma.splitRule.findFirst({
        where: { firmId, parentCustomerId, isActive: true }
      })

      if (!rule) {
        throw new Error(`No active split rule found for parent customer ${parentCustomerId}`)
      }

      await prisma.paymentJob.update({
        where: { id: jobId },
        data: { ruleId: rule.id }
      })
      activeRule = rule
    }

    // ── Log Rule Application ──────────────────────────────────────────────────
    await logActivity(firmId, 'RULE_APPLIED', { ruleId: activeRule.id, paymentId }, jobId, 'SYSTEM', 'INFO')

    // ── Check Allocation Mode (AUTO vs REVIEW) ────────────────────────────────
    if (firm.allocationMode === 'REVIEW' && !job.data.bypassReview) {
      await prisma.paymentJob.update({
        where: { id: jobId },
        data: { status: JobStatus.REVIEW_REQUIRED },
      })
      console.log(`[PROCESSOR] Job ${jobId} paused for MANUAL REVIEW.`)
      return // Stop here, user must approve via dashboard
    }

    const ruleConfig = activeRule.ruleConfig as unknown as RuleConfig

    // ── Determine which sub-customer IDs to query ────────────────────────────
    const locationIds = extractLocationIds(ruleConfig)

    // ── Fetch all open invoices across sub-locations ─────────────────────────
    const openInvoices = await fetchOpenInvoices(firmId, realmId, locationIds)

    // ── Calculate split ──────────────────────────────────────────────────────
    const splitResult = calculateSplit(paymentAmount, openInvoices, ruleConfig)

    // ── Assert invariant BEFORE writing anything to QBO ──────────────────────
    assertSplitInvariant(splitResult, paymentAmount)

    // ── Rounding Safety: Adjust last location for perfect balance ────────────
    const sumApplied = splitResult.allocations.reduce((s, a) => s + Number(a.amountApplied), 0)
    const roundedSum = Math.round(sumApplied * 100) / 100
    const roundedPayment = Math.round(paymentAmount * 100) / 100

    if (roundedSum !== roundedPayment && splitResult.allocations.length > 0) {
      const diff = Math.round((roundedPayment - roundedSum) * 100) / 100
      const lastIndex = splitResult.allocations.length - 1
      splitResult.allocations[lastIndex].amountApplied = Math.round((Number(splitResult.allocations[lastIndex].amountApplied) + diff) * 100) / 100
      splitResult.totalAllocated = roundedPayment
    }

    // ── Save split result snapshot to DB ─────────────────────────────────────
    await prisma.paymentJob.update({
      where: { id: jobId },
      data: { splitResult: splitResult as any },
    })

    // ── Implementation Note: Journal Entry vs Payment ────────────────────────
    // Per TPS v1.0 Section 8, we should ideally use Journal Entries.
    // For now, we continue with individual Payments to maintain invoice balance sync,
    // but we will add the journalEntryId record and Activity Log.

    // ── Build batch items ─────────────────────────────────────────────────────
    const batchItems: QBOBatchItemRequest[] = splitResult.allocations.map((alloc, idx) => ({
      bId: `alloc-${idx}`,
      operation: 'create',
      Payment: {
        CustomerRef: { value: alloc.locationCustomerId, name: 'Allocated Location' },
        TotalAmt: alloc.amountApplied,
        Line: [
          {
            Amount: alloc.amountApplied,
            LinkedTxn: [{ TxnId: alloc.invoiceId, TxnType: 'Invoice' }],
          },
        ],
      },
    }))

    // ── Dispatch in chunks of 30 (QBO hard limit) ─────────────────────────────
    const chunks = chunk(batchItems, 30)

    for (const batchChunk of chunks) {
      const response = await postBatch(firmId, realmId, batchChunk)
      for (const item of response.BatchItemResponse) {
        if (item.Fault) {
          throw new Error(`QBO batch error on bId ${item.bId}: ${item.Fault.Error[0]?.Message}`)
        }
        if (item.Payment) {
          postedPayments.push({ id: item.Payment.Id, syncToken: item.Payment.SyncToken })
        }
      }
      await sleep(500)
    }

    // ── Write audit entries ───────────────────────────────────────────────────
    await prisma.auditEntry.createMany({
      data: splitResult.allocations.map((alloc, idx) => ({
        jobId,
        subLocationId: alloc.locationCustomerId,
        invoiceId: alloc.invoiceId,
        amountApplied: alloc.amountApplied,
        qboPaymentId: postedPayments[idx]?.id ?? null,
      })),
    })

    // ── Log Journal/Allocation Creation ───────────────────────────────────────
    await logActivity(firmId, 'JOURNAL_CREATED', { paymentCount: postedPayments.length, totalAmount: paymentAmount }, jobId, 'SYSTEM', 'INFO')

    // ── Mark job complete ─────────────────────────────────────────────────────
    await prisma.paymentJob.update({
      where: { id: jobId },
      data: { status: JobStatus.COMPLETE, completedAt: new Date() },
    })

    console.log(`✅ Job ${jobId} complete — split $${paymentAmount} across ${splitResult.allocations.length} invoices`)

    // ── Send completion email ─────────────────────────────────────────────────
    if (firm.notificationEmail) {
      await sendJobCompleteEmail({
        to: firm.notificationEmail,
        firmName: firm.name,
        jobId,
        totalAmount: paymentAmount,
        splitCount: splitResult.allocations.length,
        completedAt: new Date(),
        ruleType: activeRule.ruleType,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ Job ${jobId} failed: ${message}`)

    // ── Rollback: delete all payments posted in this run ──────────────────────
    if (postedPayments.length > 0) {
      console.log(`🔄 Rolling back ${postedPayments.length} posted payments...`)
      await rollback(firmId, realmId, jobId, postedPayments)
    } else {
      await prisma.paymentJob.update({
        where: { id: jobId },
        data: { status: JobStatus.FAILED, errorMessage: message },
      })
    }

    await logActivity(firmId, 'FAILED', { error: message }, jobId, 'SYSTEM', 'ERROR')

    // ── Send failure email ────────────────────────────────────────────────────
    if (firm?.notificationEmail) {
      await sendJobFailedEmail({
        to: firm.notificationEmail,
        firmName: firm.name,
        jobId,
        errorMessage: message,
        failedAt: new Date(),
      })
    }

    throw error // Re-throw so BullMQ marks the job as failed
  }
}

/**
 * Rollback: attempt to delete all QBO payments created in a failed job.
 * Updates job status to ROLLED_BACK or FAILED if rollback itself fails.
 */
async function rollback(
  firmId: string,
  realmId: string,
  jobId: string,
  postedPayments: Array<{ id: string; syncToken: string }>
): Promise<void> {
  const errors: string[] = []

  for (const payment of postedPayments) {
    try {
      await deletePayment(firmId, realmId, payment.id, payment.syncToken)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown'
      errors.push(`Failed to delete QBO payment ${payment.id}: ${msg}`)
    }
  }

  if (errors.length > 0) {
    // Rollback failed — this needs human intervention
    await prisma.paymentJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.FAILED,
        errorMessage: `ROLLBACK INCOMPLETE — manual cleanup required: ${errors.join('; ')}`,
      },
    })
    console.error(`🚨 ROLLBACK FAILED for job ${jobId}. Manual intervention required.`)
  } else {
    await prisma.paymentJob.update({
      where: { id: jobId },
      data: { status: JobStatus.ROLLED_BACK, errorMessage: 'Job failed and was successfully rolled back' },
    })
    console.log(`✅ Rollback complete for job ${jobId}`)
  }
}

/**
 * Extract the list of QBO Customer IDs that a rule operates on.
 */
function extractLocationIds(rule: RuleConfig): string[] {
  switch (rule.type) {
    case 'proportional':
      return Object.keys(rule.weights)
    case 'oldest_first':
      return rule.locationIds
    case 'location_priority':
      return rule.order
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Start the BullMQ worker. Call this once at server startup.
 */
export async function startWorker(): Promise<Worker<PaymentJobData>> {
  const worker = new Worker<PaymentJobData>(QUEUE_NAME, processPayment, {
    connection: redis,
    concurrency: 5, // Process up to 5 jobs in parallel
  })

  worker.on('failed', (job, err) => {
    console.error(`Worker job ${job?.id} failed:`, err.message)
  })

  worker.on('completed', (job) => {
    console.log(`Worker job ${job.id} completed`)
  })

  return worker
}
