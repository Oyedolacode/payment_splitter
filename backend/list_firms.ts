import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
    const firms = await prisma.firm.findMany()
    console.log(JSON.stringify(firms, null, 2))
}
main().catch(console.error).finally(() => prisma.$disconnect())
