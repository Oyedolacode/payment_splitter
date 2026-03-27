import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require" } }
})

const FIRM_ID = '8e5642b8-6cb5-4d2c-9fec-c2fb2f922597'

async function main() {
  const completeJobs = await prisma.paymentJob.findMany({
    where: { firmId: FIRM_ID, status: 'COMPLETE' },
    take: 10,
    orderBy: { createdAt: 'desc' }
  })
  
  if (completeJobs.length > 0) {
    console.log(`Found ${completeJobs.length} complete jobs.`)
    const activeLocs = new Set<string>()
    completeJobs.forEach(j => {
      const res = j.splitResult as any
      if (res && res.allocations) {
        res.allocations.forEach((a: any) => activeLocs.add(a.locationId))
      }
    })
    console.log('Confirmed Active Location IDs (from past jobs):', Array.from(activeLocs).join(', '))
  } else {
    console.log('No complete jobs found for this firm.')
  }

  const defaultRule = await prisma.splitRule.findFirst({
    where: { firmId: FIRM_ID, isDefault: true }
  })
  
  if (defaultRule) {
    console.log('\nCurrent Default Rule breakdown:')
    console.log(JSON.stringify(defaultRule.ruleConfig, null, 2))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
