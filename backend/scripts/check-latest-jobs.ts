import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require" } }
})

const FIRM_ID = '8e5642b8-6cb5-4d2c-9fec-c2fb2f922597'

async function main() {
  console.log(`\n--- LATEST 10 JOBS FOR FIRM ${FIRM_ID} ---`)
  const jobs = await prisma.paymentJob.findMany({
    where: { firmId: FIRM_ID },
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  jobs.forEach(j => {
    console.log(`[${j.createdAt.toISOString()}] ID: ${j.id} | Status: ${j.status}`)
    if (j.errorMessage) {
      console.log(`   ERROR: ${j.errorMessage}`)
    }
    if (j.status === 'QUEUED') {
        console.log(`   (Waiting in queue since ${j.createdAt.toISOString()})`)
    }
  })

  // Check for any jobs in STALLED or PROCESSING status
  const stuck = await prisma.paymentJob.findMany({
    where: { firmId: FIRM_ID, status: { in: ['PROCESSING', 'STALLED', 'ANOMALY_PAUSED'] as any } }
  })
  
  if (stuck.length > 0) {
    console.log(`\n--- STUCK JOBS (${stuck.length}) ---`)
    stuck.forEach(j => console.log(`  ID: ${j.id} | Status: ${j.status} | Error: ${j.errorMessage || 'NONE'}`))
  } else {
    console.log('\nNo stuck jobs found.')
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
