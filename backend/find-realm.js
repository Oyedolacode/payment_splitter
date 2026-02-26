
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const firmId = '62c916d8-7b0e-478a-adcd-a6d5f9dff6a5';
    const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { qboRealmId: true }
    });
    console.log(JSON.stringify(firm));
}

main().catch(console.error).finally(() => prisma.$disconnect());
