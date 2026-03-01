import { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { createHmac } from 'crypto'
import { redis } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { config } from '../lib/config'
import { QUEUE_NAME, PaymentJobData } from '../workers/paymentWorker'
import { JobStatus } from '@prisma/client'
import { logActivity } from '../lib/activityLogger'

const paymentQueue = new Queue<PaymentJobData>(QUEUE_NAME, { connection: redis })

// QBO webhook payload types
interface QBOWebhookEvent {
  realmId: string
  dataChangeEvent: {
    entities: Array<{
      name: string   // e.g. "Payment"
      id: string
      operation: string // "Create" | "Update" | "Delete"
      lastUpdated: string
    }>
  }
}

interface QBOWebhookPayload {
  eventNotifications: QBOWebhookEvent[]
}

export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * POST /webhooks/qbo
   * QBO sends payment event notifications here.
   * We validate the HMAC signature, then enqueue a processing job.
   *
   * QBO retries up to 5 times on non-200 responses — idempotency keys prevent
   * duplicate processing of the same payment.
   */
  fastify.post('/qbo', async (request, reply) => {
    // ── Validate HMAC signature ─────────────────────────────────────────────
    // QBO signs the payload with your verifier token using HMAC-SHA256
    const signature = request.headers['intuit-signature'] as string
    const verifierToken = process.env.QBO_WEBHOOK_VERIFIER_TOKEN ?? ''

    if (verifierToken && signature) {
      const rawBody = JSON.stringify(request.body)
      const expectedSig = createHmac('sha256', verifierToken)
        .update(rawBody)
        .digest('base64')

      if (signature !== expectedSig) {
        fastify.log.warn('QBO webhook HMAC validation failed — ignoring')
        return reply.status(401).send({ error: 'Invalid signature' })
      }
    }

    const payload = request.body as QBOWebhookPayload

    // ── Process each notification ───────────────────────────────────────────
    for (const notification of payload.eventNotifications ?? []) {
      const { realmId, dataChangeEvent } = notification

      // Find the firm for this realmId
      const firm = await prisma.firm.findUnique({ where: { qboRealmId: realmId } })
      if (!firm) {
        fastify.log.warn(`Webhook received for unknown realmId: ${realmId}`)
        continue
      }

      for (const entity of dataChangeEvent.entities) {
        // We only care about newly created payments
        if (entity.name !== 'Payment' || entity.operation !== 'Create') continue

        const paymentId = entity.id

        // ── Idempotency check: skip if already processed or in-flight ────────
        const existing = await prisma.paymentJob.findUnique({
          where: { firmId_paymentId: { firmId: firm.id, paymentId } },
        })

        if (existing) {
          fastify.log.info(`Duplicate webhook for payment ${paymentId} — already ${existing.status}`)
          continue
        }

        // ── Create job record ─────────────────────────────────────────────────
        const dbJob = await prisma.paymentJob.create({
          data: {
            firmId: firm.id,
            paymentId,
            status: JobStatus.QUEUED,
            totalAmount: 0, // Will be updated when worker fetches the actual payment
          },
        })

        // ── Log Activity ──────────────────────────────────────────────────────
        await logActivity(firm.id, 'PAYMENT_DETECTED', { paymentId, qboRealmId: realmId }, dbJob.id)

        // ── Enqueue BullMQ job ────────────────────────────────────────────────
        await paymentQueue.add(
          'process-payment',
          {
            jobId: dbJob.id,
            firmId: firm.id,
            realmId,
            paymentId,
          },
          {
            jobId: dbJob.id, // Use our DB ID as BullMQ job ID for traceability
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          }
        )

        fastify.log.info(`Enqueued payment job ${dbJob.id} for QBO payment ${paymentId}`)
      }
    }

    // Always return 200 quickly — processing happens async in the worker
    return reply.status(200).send({ received: true })
  })
}
