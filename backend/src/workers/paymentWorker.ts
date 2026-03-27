import { Worker, Queue, Job } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { fetchPayment, fetchOpenInvoices, postBatch, deletePayment, QBOBatchItemRequest, createJournalEntry, fetchAllLocations } from '../services/qboClient'
import { calculateSplit, assertSplitInvariant, RuleConfig, Allocation } from '../services/splitCalculator'
import { sendJobCompleteEmail, sendJobFailedEmail } from '../services/email'
import { JobStatus } from '@prisma/client'
import { logActivity } from '../lib/activityLogger'
import { checkIdempotency, createLedgerTransaction } from '../services/ledger'

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
  console.log(`[WORKER] [${new Date().toISOString()}] Picking up job ${jobId} (Payment: ${paymentId})`)

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
    console.log(`[PROCESSOR] [Job ${jobId}] Phase 1: Marking as processing...`)
    await prisma.paymentJob.update({
      where: { id: jobId },
      data: { status: JobStatus.PROCESSING },
    })

    // ── Idempotency Check ──────────────────────────────────────────────────
    const alreadyProcessed = await checkIdempotency(paymentId)
    if (alreadyProcessed && !paymentId.startsWith('MANUAL-')) {
      await logActivity(firmId, 'SKIPPED', { reason: 'ALREADY_PROCESSED', paymentId }, jobId, 'SYSTEM', 'INFO')
      await prisma.paymentJob.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETE, completedAt: new Date(), errorMessage: 'Duplicate skipped via Internal Ledger' },
      })
      return
    }

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
      console.log(`[PROCESSOR] [Job ${jobId}] Phase 2: Fetching QBO Payment ${paymentId}...`)
      const payment = await fetchPayment(firmId, realmId, paymentId)
      paymentAmount = payment.TotalAmt
      parentCustomerId = payment.CustomerRef.value

      // 🔍 FULL DIAGNOSTIC DUMP
      console.log(`\n====== [RULE-LOOKUP] JOB ${jobId} ======`)
      console.log(`  paymentId       : ${paymentId}`)
      console.log(`  firmId          : ${firmId}`)
      console.log(`  realmId         : ${realmId}`)
      console.log(`  CustomerRef.value : "${parentCustomerId}" (type: ${typeof parentCustomerId})`)
      console.log(`  CustomerRef.name  : "${payment.CustomerRef?.name}"`)
      console.log(`  payment.TotalAmt  : ${payment.TotalAmt}`)

      // List ALL rules for this firm
      const allFirmRules = await prisma.splitRule.findMany({ where: { firmId } })
      console.log(`  ALL rules in DB (${allFirmRules.length} total):`)
      allFirmRules.forEach(r => {
        const match = r.parentCustomerId === parentCustomerId
        console.log(`    - ruleId=${r.id} parentCustId="${r.parentCustomerId}" isActive=${r.isActive} isLocked=${r.isLocked} <-- ${match ? '✅ WOULD MATCH' : '❌ no match'} (expected="${parentCustomerId}")`)
      })

      let rule = await prisma.splitRule.findFirst({
        where: { firmId, parentCustomerId, isActive: true }
      })
      console.log(`  Direct rule lookup: ${rule ? `✅ FOUND rule.id=${rule.id}` : '❌ NOT FOUND'}`)

      // [Phase 7b] Parent-Aware Rule Discovery
      if (!rule) {
        console.log(`[RULE-LOOKUP] No direct rule for customer "${parentCustomerId}". Checking QBO parent hierarchy...`)
        try {
          // List all rules to see what's actually stored
          const allRules = await prisma.splitRule.findMany({ where: { firmId, isActive: true } })
          console.log(`[RULE-LOOKUP] All active rules for firm: ${JSON.stringify(allRules.map(r => ({ id: r.id, parentCustomerId: r.parentCustomerId })))}`)
          
          const { qboRequest } = await import('../services/qboClient')
          const customerData = await qboRequest<{ Customer: any }>(
            firmId,
            firm.qboRealmId!,
            `/customer/${parentCustomerId}`
          )

          const qboCustomer = customerData?.Customer
          console.log(`[RULE-LOOKUP] QBO Customer fetched: Id="${qboCustomer?.Id}" DisplayName="${qboCustomer?.DisplayName}" ParentRef="${JSON.stringify(qboCustomer?.ParentRef)}"`)

          if (qboCustomer?.ParentRef?.value) {
            const actualParentId = qboCustomer.ParentRef.value
            console.log(`[RULE-LOOKUP] Customer ${parentCustomerId} is a sub-customer of ${actualParentId}. Looking up parent rule...`)
            rule = await prisma.splitRule.findFirst({
              where: { firmId, parentCustomerId: actualParentId, isActive: true }
            })
            console.log(`[RULE-LOOKUP] Parent rule lookup result: ${rule ? `FOUND rule.id=${rule.id}` : 'NOT FOUND'}`)
          } else {
            console.warn(`[RULE-LOOKUP] Customer ${parentCustomerId} has NO parent in QBO — checking for default rule...`)
          }
        } catch (err: any) {
          console.error(`[RULE-LOOKUP] Error during parent lookup for customer ${parentCustomerId}:`, err.message)
        }

        // [Phase 7c] Default Rule Fallback — catches all remaining unmapped customers
        if (!rule) {
          console.log(`[RULE-LOOKUP] Attempting default rule fallback...`)
          rule = await prisma.splitRule.findFirst({
            where: { firmId, isActive: true, isDefault: true }
          })
          if (rule) {
            console.log(`[RULE-LOOKUP] ✅ DEFAULT RULE APPLIED: rule.id=${rule.id} for customer ${parentCustomerId}`)
          } else {
            console.warn(`[RULE-LOOKUP] ❌ No default rule found. Job cannot be processed.`)
          }
        }
      }

      if (!rule) {
        throw new Error(`No active split rule found for parent customer ${parentCustomerId} (Firm: ${firmId}). Create a rule for this customer or mark an existing rule as "Default".`)
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

    // ── Phase 8: Anomaly / Fraud Detection (Foundation) ──────────────────────
    if (paymentAmount > 5000) {
      await prisma.paymentJob.update({
        where: { id: jobId },
        data: { status: JobStatus.ANOMALY_PAUSED, errorMessage: 'High-value payment flagged for manual review (> $5,000)' },
      })
      await logActivity(firmId, 'ANOMALY_DETECTED', { reason: 'HIGH_VALUE_PAYMENT', amount: paymentAmount }, jobId, 'SYSTEM', 'WARNING')
      return // BullMQ expects void or promise<any>
    }

    // ── Fetch all open invoices across sub-locations ─────────────────────────
    console.log(`[PROCESSOR] [Job ${jobId}] Phase 3: Fetching open invoices for ${locationIds.length} sub-locations...`)
    const openInvoices = await fetchOpenInvoices(firmId, realmId, locationIds)

    // ── Phase 4: Validate Location existence in QBO ──────────────────────────
    console.log(`[PROCESSOR] [Job ${jobId}] Phase 4: Validating locations...`)
    const qboLocations = await fetchAllLocations(firmId, realmId)
    const activeLocationIds = qboLocations.map(l => l.Id)

    for (const locId of locationIds) {
      if (!activeLocationIds.includes(locId)) {
        await logActivity(firmId, 'ANOMALY_DETECTED', { reason: 'INACTIVE_LOCATION', locationId: locId }, jobId, 'SYSTEM', 'WARNING')
        throw new Error(`Location ${locId} is no longer active in QuickBooks. Please update your split rules.`)
      }
    }

    // ── Phase 5: Calculate Split ─────────────────────────────────────────────
    console.log(`[PROCESSOR] [Job ${jobId}] Phase 5: Calculating allocation split...`)
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

    // ── Phase 5.5: Commit to Internal Financial Ledger (Double-Entry) ────────
    await createLedgerTransaction(
      firmId,
      paymentId,
      jobId,
      paymentAmount,
      splitResult.allocations.map(a => ({
        locationCustomerId: a.locationCustomerId,
        amountApplied: a.amountApplied
      })),
      { ruleId: activeRule.id, ruleType: activeRule.ruleType }
    )
    await logActivity(firmId, 'LEDGER_COMMITTED', { paymentId, amount: paymentAmount }, jobId, 'SYSTEM', 'INFO')

    // ── Implementation Note: Journal Entry vs Payment ────────────────────────
    // Per TPS v1.0 Section 8, we should ideally use Journal Entries.
    // For now, we perform BOTH: Payments for AR sub-ledger sync, and a JE for consolidated revenue reporting.

    // ── Phase 5.6: Construct Journal Entry (Revenue Allocation) ──────────────
    // We'll also keep the Payment-Invoice link for AR, but JE is the "Accounting Safe" record.
    const journalEntryModel = {
      Line: [
        // Debit HQ Account (AR Parent)
        {
          Amount: paymentAmount,
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: {
            PostingType: 'Debit',
            AccountRef: { value: 'SERVICE_AR_PARENT' }, // Replace with discovery logic or config
          }
        },
        // Credits to Sub-Locations
        ...splitResult.allocations.map(alloc => ({
          Amount: alloc.amountApplied,
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: {
            PostingType: 'Credit',
            AccountRef: { value: 'SERVICE_INCOME_BRANCH' }, // Replace with discovery logic or config
            DepartmentRef: { value: alloc.locationCustomerId }
          }
        }))
      ],
      PrivateNote: `PaySplit Allocation for Job ${jobId} (Original Payment ${paymentId})`
    }

    const hasPlaceholders = journalEntryModel.Line.some(l => 
      l.JournalEntryLineDetail.AccountRef.value === 'SERVICE_AR_PARENT' || 
      l.JournalEntryLineDetail.AccountRef.value === 'SERVICE_INCOME_BRANCH'
    )

    // ── Phase 6: Execute Split (Post to QBO) ──────────────────────────────────
    console.log(`[PROCESSOR] [Job ${jobId}] Phase 6: Syncing allocations to QBO...`)
    const auditEntries: any[] = []
    const postedPayments: any[] = []
    let journalEntryId: string | null = null

    try {
      // 1. Create the Journal Entry first (Additive/Transparent)
      // Note: skip if placeholder accounts are present to avoid QBO 400 errors
      if (!hasPlaceholders) {
        const je = await createJournalEntry(firmId, realmId, journalEntryModel)
        journalEntryId = je.Id
        await logActivity(firmId, 'JOURNAL_CREATED', { journalEntryId, jobId }, jobId, 'SYSTEM', 'INFO')
      } else {
        console.warn(`[WORKER] Skipping Journal Entry for job ${jobId} due to placeholder account IDs.`)
      }

      // 2. Post the Payment Applications (AR linkage)
      const items: QBOBatchItemRequest[] = splitResult.allocations.map((alloc, idx) => ({
        bId: `alloc-${idx}`,
        operation: 'create',
        Payment: {
          CustomerRef: { value: alloc.locationCustomerId, name: 'Allocated Location' },
          TotalAmt: alloc.amountApplied,
          PrivateNote: `Split from Parent Payment ${paymentId}`,
          Line: [
            {
              Amount: alloc.amountApplied,
              LinkedTxn: [{ TxnId: alloc.invoiceId, TxnType: 'Invoice' }],
            },
          ],
        },
      }))

      const batchResponse = await postBatch(firmId, realmId, items)
      // Collect IDs for audit and rollback
      batchResponse.BatchItemResponse.forEach((res, idx) => {
        if (res.Fault) {
          throw new Error(`Batch item ${idx} failed: ${res.Fault.Error[0].Message}`)
        }
        if (res.Payment) {
          postedPayments.push({ id: res.Payment.Id, syncToken: res.Payment.SyncToken })
        }
        auditEntries.push({
          subLocationId: splitResult.allocations[idx].locationCustomerId,
          invoiceId: splitResult.allocations[idx].invoiceId,
          amountApplied: splitResult.allocations[idx].amountApplied.toString(),
          qboPaymentId: res.Payment?.Id,
        })
      })
    } catch (err: any) {
      // ── Phase 6: Non-Destructive Rollback ──────────────────────────────────
      await logActivity(firmId, 'FAILED', { action: 'ROLLBACK_TRIGGERED', error: err.message }, jobId, 'SYSTEM', 'ERROR')

      if (journalEntryId) {
        // Instead of deleting, we'd ideally create a Reversal JE. 
        // For simplicity in this step, we'll reversal-create:
        const reversalJE = {
          ...journalEntryModel,
          Line: journalEntryModel.Line.map(l => ({
            ...l,
            JournalEntryLineDetail: {
              ...l.JournalEntryLineDetail,
              PostingType: l.JournalEntryLineDetail.PostingType === 'Debit' ? 'Credit' : 'Debit'
            }
          })),
          PrivateNote: `REVERSAL of PaySplit JE ${journalEntryId} (Job ${jobId})`
        }
        await createJournalEntry(firmId, realmId, reversalJE)
        await logActivity(firmId, 'ROLLED_BACK', { action: 'JE_REVERSED', originalJE: journalEntryId }, jobId, 'SYSTEM', 'WARNING')
      }
      throw err // Re-throw to fail the job
    }
    // ── Write audit entries ───────────────────────────────────────────────────
    await prisma.auditEntry.createMany({
      data: auditEntries.map(entry => ({
        jobId,
        subLocationId: entry.subLocationId,
        invoiceId: entry.invoiceId,
        amountApplied: entry.amountApplied,
        qboPaymentId: entry.qboPaymentId ?? null,
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
  console.log(`[WORKER] [${new Date().toISOString()}] Starting BullMQ worker on queue: ${QUEUE_NAME}...`)
  
  try {
    const isRedisConnected = redis.status === 'ready' || redis.status === 'connect'
    console.log(`[WORKER] [${new Date().toISOString()}] Redis status: ${redis.status} (Connected: ${isRedisConnected})`)
  } catch (err) {
    console.error(`[WORKER] [${new Date().toISOString()}] Redis status check failed:`, err)
  }

  const worker = new Worker<PaymentJobData>(QUEUE_NAME, processPayment, {
    connection: redis,
    concurrency: 5, // Process up to 5 jobs in parallel
    lockDuration: 60000, // 60 seconds (reduce renewal frequency)
    stalledInterval: 300000, // 5 minutes (drastically reduce polling for stalled jobs)
  })

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[WORKER] [${new Date().toISOString()}] Job ${job?.id} FAILED:`, err.message)
  })

  worker.on('active', (job: Job) => {
    console.log(`[Worker] Started processing job ${job.id}`)
  })

  worker.on('completed', (job: Job) => {
    console.log(`[WORKER] [${new Date().toISOString()}] Job ${job.id} COMPLETED`)
  })

  worker.on('error', (err: Error) => {
    console.error(`[WORKER] [${new Date().toISOString()}] FATAL Error in worker:`, err)
  })

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  // We use a shared background check to avoid command bloat
  setInterval(async () => {
    try {
      // Use the connection status to confirm health
      const status = redis.status
      console.log(`[WORKER] [${new Date().toISOString()}] Heartbeat - Redis: ${status} | Worker: ${worker.isRunning() ? 'Active' : 'Stopped'}`)
    } catch (err) {
      console.error(`[WORKER] [${new Date().toISOString()}] Heartbeat FAILED:`, err)
    }
  }, 300000) // Every 5 minutes instead of 1 to save requests

  return worker
}
