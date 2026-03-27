import { PrismaClient } from '@prisma/client'
import { config } from '../src/lib/config'
import { decrypt } from '../src/lib/encryption'

// We need to bypass the config validation because we don't have all env vars
// but we CAN reconstruct enough to call the QBO API if we have the tokens from the DB.
// Wait, I DON'T have the ENCRYPTION_KEY, so I can't decrypt the tokens.
// This is the Catch-22.

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require" } }
})

const FIRM_ID = '8e5642b8-6cb5-4d2c-9fec-c2fb2f922597'

async function main() {
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: FIRM_ID } })
  console.log(`Firm: ${firm.name} (ID: ${firm.id})`)
  console.log(`Has Access Token (encrypted): ${!!firm.accessToken}`)

  // Since I can't decrypt QBO tokens without ENCRYPTION_KEY, 
  // I'll try to find if there are ANY recent successful AuditEntries or something 
  // that shows what locations WERE used successfully.
  
  const recentSuccessfulPayments = await prisma.auditEntry.findMany({
    take: 50,
    orderBy: { createdAt: 'desc' }
  })
  
  if (recentSuccessfulPayments.length > 0) {
    const activeIds = new Set(recentSuccessfulPayments.map(a => a.subLocationId))
    console.log('\n--- LOCATIONS SUCCESSFULLY USED RECENTLY ---')
    console.log(Array.from(activeIds).join(', '))
  } else {
    console.log('\nNo successful audit entries found.')
  }
  
  // Also check all existing rules to see what other IDs are being used
  const allRules = await prisma.splitRule.findMany({ where: { firmId: FIRM_ID } })
  const usedInRules = new Set<string>()
  allRules.forEach(r => {
    const cfg = r.ruleConfig as any
    if (cfg.weights) Object.keys(cfg.weights).forEach(id => usedInRules.add(id))
    if (cfg.locationIds) cfg.locationIds.forEach((id: string) => usedInRules.add(id))
    if (cfg.order) cfg.order.forEach((id: string) => usedInRules.add(id))
  })
  
  console.log('\n--- LOCATION IDs PRESENT IN ALL RULES ---')
  console.log(Array.from(usedInRules).join(', '))
}

main().catch(console.error).finally(() => prisma.$disconnect())
