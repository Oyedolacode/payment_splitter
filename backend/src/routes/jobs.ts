import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Queue } from 'bullmq'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { QUEUE_NAME, PaymentJobData } from '../workers/paymentWorker'
import { JobStatus } from '@prisma/client'
import { logActivity } from '../lib/activityLogger'

const paymentQueue = new Queue<PaymentJobData>(QUEUE_NAME, { connection: redis })

export async function jobsRoutes(fastify: FastifyInstance) {
  // GET /api/jobs?firmId=xxx — list jobs with audit entries
  fastify.get<{ Querystring: { firmId: string; limit?: string } }>(
    '/',
    async (request, reply) => {
      const { firmId, limit = '50' } = request.query
      if (!firmId) return reply.status(400).send({ error: 'firmId required' })

      try {
        // Auto-detect stalled jobs (Queued or Processing for > 30 minutes)
        const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000)
        await prisma.paymentJob.updateMany({
          where: {
            firmId,
            status: { in: [JobStatus.QUEUED, JobStatus.PROCESSING] },
            updatedAt: { lt: thirtyMinsAgo }
          },
          data: { status: JobStatus.STALLED }
        })

        const jobs = await prisma.paymentJob.findMany({
          where: { firmId },
          include: { auditEntries: true, rule: true },
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit, 10),
        })
        
        // Hardened serialization: explicitly map Decimals to Numbers
        return jobs.map(j => ({
          ...j,
          totalAmount: Number(j.totalAmount),
          auditEntries: j.auditEntries.map(a => ({
            ...a,
            amountApplied: Number(a.amountApplied)
          }))
        }))
      } catch (err: any) {
        console.error('[Jobs List Error]:', err)
        return reply.status(500).send({
          error: 'Failed to fetch jobs',
          details: err.message || 'Unknown database error'
        })
      }
    }
  )

  // GET /api/jobs/health — verify queue health
  fastify.get('/health', async (request, reply) => {
    try {
      const redisStatus = await redis.ping()
      const counts = await paymentQueue.getJobCounts()
      return {
        status: 'UP',
        redis: redisStatus === 'PONG' ? 'Healthy' : 'Error',
        queue: QUEUE_NAME,
        counts
      }
    } catch (err: any) {
      console.error('[Queue Health Error]:', err)
      return reply.status(503).send({ status: 'DOWN', error: err.message })
    }
  })

  // GET /api/jobs/debug?firmId=xxx — fetch queue diagnostic info
  fastify.get<{ Querystring: { firmId: string } }>(
    '/debug',
    async (request, reply) => {
      const { firmId } = request.query
      if (!firmId) return reply.status(400).send({ error: 'firmId required' })

      try {
        const stats = await paymentQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused')
        const waitingJobs = await paymentQueue.getJobs(['waiting'], 0, 10)
        
        return {
          queueName: QUEUE_NAME,
          stats,
          recentWaiting: waitingJobs.map(j => ({
            id: j.id,
            data: j.data,
            timestamp: j.timestamp
          }))
        }
      } catch (err: any) {
        console.error('[Queue Debug Error]:', err)
        return reply.status(500).send({ error: 'Failed to fetch queue stats', details: err.message })
      }
    }
  )

  // POST /api/jobs — manual sync (trigger payment fetch)
  fastify.post<{ Body: { firmId: string } }>(
    '/',
    async (request, reply) => {
      const { firmId } = request.body
      if (!firmId) return reply.status(400).send({ error: 'firmId required' })

      try {
        const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })
        const { fetchRecentPayments } = await import('../services/qboClient')
        
        const payments = await fetchRecentPayments(firmId, firm.qboRealmId!)
        let triggeredCount = 0
        let skippedCount = 0

        for (const payment of payments) {
          // Check if job already exists (idempotency)
          const existing = await prisma.paymentJob.findUnique({
            where: { firmId_paymentId: { firmId, paymentId: payment.Id } }
          })

          if (existing) {
            skippedCount++
            continue
          }

          // Create job record
          const dbJob = await prisma.paymentJob.create({
            data: {
              firmId,
              paymentId: payment.Id,
              status: JobStatus.QUEUED,
              totalAmount: payment.TotalAmt,
            }
          })

          // Enqueue BullMQ job
          await paymentQueue.add(
              'process-payment',
              {
                jobId: dbJob.id,
                firmId,
                realmId: firm.qboRealmId!,
                paymentId: payment.Id,
              },
              {
                jobId: dbJob.id,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
              }
          )

          triggeredCount++
        }

        const failedCount = await prisma.paymentJob.count({
          where: { firmId, status: JobStatus.FAILED }
        })

        return { 
          message: triggeredCount > 0 
            ? `Successfully triggered sync for ${triggeredCount} new payments`
            : 'No new payments found to sync',
          triggeredCount,
          skippedCount,
          failedCount
        }
      } catch (err: any) {
        console.error('[Manual Sync Error]:', err)
        return reply.status(500).send({
          error: 'Failed to trigger manual sync',
          details: err.message || err
        })
      }
    }
  )

  // GET /api/jobs/:id — single job detail
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const job = await prisma.paymentJob.findUnique({
      where: { id: request.params.id },
      include: { auditEntries: true, rule: true },
    })
    if (!job) return reply.status(404).send({ error: 'Job not found' })
    return job
  })

  // POST /api/jobs/:id/retry — manually retry a failed job
  fastify.post<{ Params: { id: string } }>('/:id/retry', async (request, reply) => {
    const job = await prisma.paymentJob.findUnique({ where: { id: request.params.id } })

    if (!job) return reply.status(404).send({ error: 'Job not found' })
    if (job.status !== JobStatus.FAILED && job.status !== JobStatus.ROLLED_BACK) {
      return reply.status(400).send({ error: `Cannot retry job with status ${job.status}` })
    }

    const firm = await prisma.firm.findUniqueOrThrow({ where: { id: job.firmId } })

    // Reset status back to queued
    await prisma.paymentJob.update({
      where: { id: job.id },
      data: { status: JobStatus.QUEUED, errorMessage: null },
    })

    await paymentQueue.add(
      'process-payment',
      {
        jobId: job.id,
        firmId: job.firmId,
        realmId: firm.qboRealmId!,
        paymentId: job.paymentId,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    )

    return { message: 'Job re-queued', jobId: job.id }
  })

  // POST /api/jobs/retry-all — retry all failed or stalled jobs
  fastify.post(
    '/retry-all',
    async (request, reply) => {
      console.log('[RETRY_ALL] Request body:', request.body)
      
      const bodySchema = z.object({
        firmId: z.string().uuid({ message: 'firmId must be a valid UUID' })
      })

      const result = bodySchema.safeParse(request.body)
      if (!result.success) {
        console.warn('[RETRY_ALL] Validation failed:', result.error.format())
        return reply.status(400).send({ 
          error: 'Invalid request body', 
          details: result.error.format() 
        })
      }

      const { firmId } = result.data

      const jobsToRetry = await prisma.paymentJob.findMany({
        where: {
          firmId,
          status: { in: [JobStatus.FAILED, JobStatus.STALLED, JobStatus.ROLLED_BACK] }
        },
        include: { firm: true }
      })

      let failedRequeued = 0
      let stalledRequeued = 0

      for (const job of jobsToRetry) {
        if (job.status === JobStatus.STALLED) stalledRequeued++
        else failedRequeued++

        await prisma.paymentJob.update({
          where: { id: job.id },
          data: { status: JobStatus.QUEUED, errorMessage: null }
        })

        await paymentQueue.add(
          'process-payment',
          {
            jobId: job.id,
            firmId: job.firmId,
            realmId: job.firm.qboRealmId!,
            paymentId: job.paymentId,
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
        )
      }

      return { 
        message: `Re-enqueued ${jobsToRetry.length} jobs`, 
        count: jobsToRetry.length,
        failedCount: failedRequeued,
        stalledCount: stalledRequeued
      }
    }
  )

  // POST /api/jobs/retry-stalled — retry only stalled jobs
  fastify.post(
    '/retry-stalled',
    async (request, reply) => {
      const { firmId } = request.body as any
      if (!firmId) return reply.status(400).send({ error: 'firmId required' })

      const jobsToRetry = await prisma.paymentJob.findMany({
        where: { firmId, status: JobStatus.STALLED },
        include: { firm: true }
      })

      for (const job of jobsToRetry) {
        await prisma.paymentJob.update({
          where: { id: job.id },
          data: { status: JobStatus.QUEUED, errorMessage: null }
        })

        await paymentQueue.add(
          'process-payment',
          {
            jobId: job.id,
            firmId: job.firmId,
            realmId: job.firm.qboRealmId!,
            paymentId: job.paymentId,
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
        )
      }

      return { message: `Re-enqueued ${jobsToRetry.length} stalled jobs`, count: jobsToRetry.length }
    }
  )

  // Test endpoint — runs split calculator against real QBO invoices without writing to ledger
  fastify.post<{ Body: { firmId: string; ruleId: string; paymentAmount: number } }>(
    '/test',
    async (request, reply) => {
      const { firmId, ruleId, paymentAmount } = request.body

      const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })
      const rule = await prisma.splitRule.findUniqueOrThrow({ where: { id: ruleId } })

      const { fetchOpenInvoices } = await import('../services/qboClient')
      const { calculateSplit, assertSplitInvariant } = await import('../services/splitCalculator')

      const ruleConfig = rule.ruleConfig as any
      const ids = ruleConfig.weights
        ? Object.keys(ruleConfig.weights)
        : ruleConfig.locationIds ?? ruleConfig.order

      const openInvoices = await fetchOpenInvoices(firmId, firm.qboRealmId!, ids)
      const splitResult = calculateSplit(paymentAmount, openInvoices, ruleConfig)
      assertSplitInvariant(splitResult, paymentAmount)

      return {
        paymentAmount,
        totalAllocated: splitResult.totalAllocated,
        remainingUnapplied: splitResult.remainingUnapplied,
        allocations: splitResult.allocations,
        invoicesFetched: openInvoices.length,
      }
    }
  )

  // POST /api/jobs/:id/trigger — manually trigger a real job (writes to QBO)
  fastify.post<{ Body: { firmId: string; ruleId: string; paymentAmount: number } }>(
    '/trigger',
    async (request, reply) => {
      const { firmId, ruleId, paymentAmount } = request.body

      if (!firmId || !ruleId || !paymentAmount) {
        return reply.status(400).send({ error: 'Missing required fields: firmId, ruleId, paymentAmount' })
      }

      const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })

      // Generate a unique manual ID for this test trigger
      const paymentId = `MANUAL-${Date.now()}`

      // 1. Create the job record in our DB
      const job = await prisma.paymentJob.create({
        data: {
          firmId,
          ruleId,
          paymentId,
          totalAmount: paymentAmount,
          status: JobStatus.QUEUED,
        },
      })

      // 2. Add to BullMQ queue for processing
      await paymentQueue.add(
        'process-payment',
        {
          jobId: job.id,
          firmId,
          realmId: firm.qboRealmId!,
          paymentId,
          paymentAmount, // Pass total amount to skip QBO fetch
        },
        { attempts: 1 } // For testing, keep it simple
      )

      return {
        message: '✅ Job triggered successfully',
        jobId: job.id,
        paymentId,
        status: 'QUEUED',
      }
    }
  )

  // POST /api/jobs/sync-queue — re-enqueue all jobs stuck in QUEUED in DB
  fastify.post(
    '/sync-queue',
    async (request, reply) => {
      try {
        const stuckJobs = await prisma.paymentJob.findMany({
          where: { status: JobStatus.QUEUED },
          include: { firm: true }
        })

        let enqueuedCount = 0
        for (const job of stuckJobs) {
          if (!job.firm.qboRealmId) continue

          await paymentQueue.add(
            'process-payment',
            {
              jobId: job.id,
              firmId: job.firmId,
              realmId: job.firm.qboRealmId,
              paymentId: job.paymentId,
            },
            {
              jobId: job.id,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            }
          )
          enqueuedCount++
        }

        return { message: `Successfully re-enqueued ${enqueuedCount} jobs`, enqueuedCount }
      } catch (err: any) {
        console.error('[Sync Queue Error]:', err)
        return reply.status(500).send({ error: 'Failed to sync queue', details: err.message })
      }
    }
  )

  // POST /api/jobs/:id/approve — approve a job that is in REVIEW_REQUIRED
  fastify.post<{ Params: { id: string } }>('/:id/approve', async (request, reply) => {
    const job = await prisma.paymentJob.findUnique({
      where: { id: request.params.id },
      include: { firm: true }
    })

    if (!job) return reply.status(404).send({ error: 'Job not found' })
    if (job.status !== JobStatus.REVIEW_REQUIRED) {
      return reply.status(400).send({ error: `Cannot approve job with status ${job.status}` })
    }

    // Reset status back to queued
    await prisma.paymentJob.update({
      where: { id: job.id },
      data: { status: JobStatus.QUEUED },
    })

    await paymentQueue.add(
      'process-payment',
      {
        jobId: job.id,
        firmId: job.firmId,
        realmId: job.firm.qboRealmId!,
        paymentId: job.paymentId,
        bypassReview: true, // Crucial: tell the worker to ignore the REVIEW setting this time
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
    )

    await logActivity(job.firmId, 'RULE_APPLIED', { action: 'MANUAL_APPROVAL' }, job.id, 'USER', 'INFO')

    return { message: 'Job approved and re-queued', jobId: job.id }
  })

  // POST /api/jobs/:id/reject — reject a job that is in REVIEW_REQUIRED
  fastify.post<{ Params: { id: string } }>('/:id/reject', async (request, reply) => {
    const job = await prisma.paymentJob.findUnique({
      where: { id: request.params.id }
    })

    if (!job) return reply.status(404).send({ error: 'Job not found' })
    if (job.status !== JobStatus.REVIEW_REQUIRED) {
      return reply.status(400).send({ error: `Cannot reject job with status ${job.status}` })
    }

    await prisma.paymentJob.update({
      where: { id: job.id },
      data: { status: JobStatus.FAILED, errorMessage: 'Job rejected by user during review' },
    })

    await logActivity(job.firmId, 'FAILED', { action: 'MANUAL_REJECTION' }, job.id, 'USER', 'WARNING')

    return { message: 'Job rejected', jobId: job.id }
  })

  // GET /api/jobs/activity?firmId=xxx — fetch activity logs
  fastify.get<{ Querystring: { firmId: string; limit?: string } }>(
    '/activity',
    async (request, reply) => {
      const { firmId, limit = '100' } = request.query
      if (!firmId) return reply.status(400).send({ error: 'firmId required' })

      const logs = await prisma.activityLog.findMany({
        where: { firmId },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit, 10),
      })
      return logs
    }
  )

  // GET /api/jobs/ledger?firmId=xxx — fetch ledger entries
  fastify.get<{ Querystring: { firmId: string; limit?: string; startDate?: string; endDate?: string; account?: string; jobId?: string; search?: string } }>(
    '/ledger',
    async (request, reply) => {
      const { firmId, limit = '200', startDate, endDate, account, jobId, search } = request.query
      if (!firmId) return reply.status(400).send({ error: 'firmId required' })

      try {
        const where: any = { firmId }
        
        if (startDate || endDate) {
          where.createdAt = {}
          if (startDate) where.createdAt.gte = new Date(startDate)
          if (endDate) where.createdAt.lte = new Date(endDate)
        }
        
        if (account) where.account = account
        if (jobId) where.jobId = jobId
        if (search) {
          where.OR = [
            { account: { contains: search, mode: 'insensitive' } },
            { jobId: { contains: search, mode: 'insensitive' } }
          ]
        }

        const entries = await prisma.ledgerEntry.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit, 10),
        })
        
        // Integrity check: Debits must equal Credits over the full history (or current view)
        const aggregates = await prisma.ledgerEntry.aggregate({
          where: { firmId },
          _sum: { debit: true, credit: true }
        })

        const totalDebit = Number(aggregates._sum.debit || 0)
        const totalCredit = Number(aggregates._sum.credit || 0)
        const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

        // Hardened serialization: explicitly map Decimals to Numbers
        const formattedEntries = entries.map(e => ({
          ...e,
          debit: Number(e.debit),
          credit: Number(e.credit)
        }))

        return {
          entries: formattedEntries,
          metadata: {
            integrity: {
              balanced: isBalanced,
              diff: totalDebit - totalCredit,
              lastCheck: new Date().toISOString()
            },
            totalCount: entries.length
          }
        }
      } catch (err: any) {
        console.error('[Ledger Fetch Error]:', err)
        return reply.status(500).send({
          error: 'Failed to fetch ledger entries',
          details: err.message || 'Unknown database error'
        })
      }
    }
  )
 }
