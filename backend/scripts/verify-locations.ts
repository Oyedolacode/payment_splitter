import { PrismaClient } from '@prisma/client'
import { fetchAllLocations } from '../src/workers/paymentWorker'

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require" } }
})

const FIRM_ID = '8e5642b8-6cb5-4d2c-9fec-c2fb2f922597'

async function main() {
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: FIRM_ID } })
  if (!firm.realmId) throw new Error('Firm not connected to QBO')

  console.log(`Fetching locations for Firm ${FIRM_ID} (Realm ${firm.realmId})...`)
  const locations = await fetchAllLocations(FIRM_ID, firm.realmId)
  
  console.log('\n--- ACTIVE QBO LOCATIONS ---')
  locations.forEach(l => {
    console.log(`  ID: ${l.Id} | Name: ${l.FullyQualifiedName || l.DisplayName || l.Name}`)
  })

  const rules = await prisma.splitRule.findMany({ where: { firmId: FIRM_ID } })
  console.log('\n--- RULES USING INACTIVE LOCATIONS ---')
  rules.forEach(r => {
    const config = r.ruleConfig as any
    const weights = config.weights || {}
    const locIds = Object.keys(weights)
    const inactive = locIds.filter(id => !locations.find(l => l.Id === id))
    if (inactive.length > 0) {
      console.log(`  Rule ID: ${r.id} | Customer: ${r.parentCustomerId} | Inactive IDs: ${inactive.join(', ')}`)
    }
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
