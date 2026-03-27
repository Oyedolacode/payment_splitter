import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require" } }
})
const FIRM_ID = '8e5642b8-6cb5-4d2c-9fec-c2fb2f922597'

async function main() {
  const rules = await prisma.splitRule.findMany({ where: { firmId: FIRM_ID } })
  console.log(`\n=== CURRENT SPLIT RULES (${rules.length} total) ===`)
  rules.forEach(r => {
    console.log(`  parentCustomerId="${r.parentCustomerId}" | isActive=${r.isActive} | ruleType=${r.ruleType} | id=${r.id}`)
  })

  const failedJobs = await prisma.paymentJob.findMany({
    where: { firmId: FIRM_ID, status: { in: ['FAILED', 'STALLED'] as any } },
    orderBy: { createdAt: 'desc' },
    take: 30
  })
  const uniqueFailingCustomers = [...new Set(
    failedJobs
      .filter(j => (j.errorMessage as string)?.includes('No active split rule'))
      .map(j => {
        const m = (j.errorMessage as string)?.match(/customer\s+(\S+)/)
        return m ? m[1] : null
      })
      .filter(Boolean)
  )]

  console.log(`\n=== FAILING JOB CUSTOMER IDs (unique) ===`)
  uniqueFailingCustomers.forEach(cid => {
    const hasRule = rules.find(r => r.parentCustomerId === cid)
    console.log(`  customerID="${cid}" --> ${hasRule ? `✅ Rule exists (isActive=${hasRule.isActive})` : '❌ NO RULE EXISTS'}`)
  })

  console.log(`\n=== SUMMARY ===`)
  console.log(`  Rules that exist: ${rules.map(r => `"${r.parentCustomerId}"`).join(', ') || 'NONE'}`)
  console.log(`  Rules NEEDED:     ${uniqueFailingCustomers.map(c => `"${c}"`).join(', ') || 'NONE'}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
