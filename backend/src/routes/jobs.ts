import { FastifyInstance } from 'fastify'
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
        const jobs = await prisma.paymentJob.findMany({
          where: { firmId },
          include: { auditEntries: true, rule: true },
          orderBy: { createdAt: 'desc' },
          take: parseInt(limit, 10),
        })
        return jobs
      } catch (err: any) {
        console.error('[Jobs List Error]:', err)
        return reply.status(500).send({
          error: err.message || 'Failed to fetch jobs',
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
  fastify.get<{ Querystring: { firmId: string; limit?: string } }>(
    '/ledger',
    async (request, reply) => {
      const { firmId, limit = '200' } = request.query
      if (!firmId) return reply.status(400).send({ error: 'firmId required' })

      const entries = await prisma.ledgerEntry.findMany({
        where: { firmId },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit, 10),
      })
      return entries
    }
  )
}
