import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require" } }
})

async function main() {
  const firm = await prisma.firm.findFirst({
    where: { accessToken: { not: null } }
  })
  
  if (firm) {
    console.log('--- ENCRYPTED DATA FOUND ---')
    console.log(`Firm ID: ${firm.id}`)
    console.log(`Has Access Token: ${!!firm.accessToken}`)
    console.log(`Has Refresh Token: ${!!firm.refreshToken}`)
    console.log('\nCRITICAL: Original ENCRYPTION_KEY is REQUIRED to decrypt these tokens.')
  } else {
    console.log('--- NO ENCRYPTED DATA FOUND ---')
    console.log('We can potentially use new random keys if needed, but original QBO keys are still required for new connections.')
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
