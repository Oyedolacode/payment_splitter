import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require" } }
})

const FIRM_ID = '8e5642b8-6cb5-4d2c-9fec-c2fb2f922597'
const CUSTOMER_ID = '58'

async function main() {
  console.log(`Setting rule for customer ${CUSTOMER_ID} as DEFAULT for firm ${FIRM_ID}...`)
  
  // Clear others
  await prisma.splitRule.updateMany({
    where: { firmId: FIRM_ID, isDefault: true },
    data: { isDefault: false }
  })

  // Set this one
  const updated = await prisma.splitRule.updateMany({
    where: { firmId: FIRM_ID, parentCustomerId: CUSTOMER_ID },
    data: { isDefault: true }
  })

  console.log(`Updated ${updated.count} rule(s).`)
  
  const rules = await prisma.splitRule.findMany({ where: { firmId: FIRM_ID } })
  console.log('\nCurrent status of rules:')
  rules.forEach(r => {
    console.log(`  - ID: ${r.id} | Customer: ${r.parentCustomerId} | isDefault: ${r.isDefault}`)
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
