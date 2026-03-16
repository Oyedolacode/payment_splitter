
import { prisma } from './src/lib/prisma'
import { redis } from './src/lib/redis'
import { Queue } from 'bullmq'
import { QUEUE_NAME, PaymentJobData } from './src/workers/paymentWorker'
import { JobStatus } from '@prisma/client'

const paymentQueue = new Queue<PaymentJobData>(QUEUE_NAME, { connection: redis })

async function reEnqueue() {
  console.log('🔍 Searching for jobs stuck in QUEUED status...')
  
  const stuckJobs = await prisma.paymentJob.findMany({
    where: { 
      status: JobStatus.QUEUED 
    },
    include: { firm: true }
  })

  console.log(`Found ${stuckJobs.length} jobs to re-enqueue.`)

  for (const job of stuckJobs) {
    if (!job.firm.qboRealmId) {
      console.warn(`⚠️ Skipping job ${job.id} - Firm ${job.firmId} has no realmId.`)
      continue
    }

    console.log(`🚀 Enqueuing job ${job.id} (Payment: ${job.paymentId})...`)
    
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
  }

  console.log('✅ All jobs re-enqueued successfully!')
  await paymentQueue.close()
  process.exit(0)
}

reEnqueue().catch(err => {
  console.error('❌ Re-enqueue failed:', err)
  process.exit(1)
})
