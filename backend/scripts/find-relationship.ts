import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require"
    }
  }
});
const FIRM_ID = '8e5642b8-6cb5-4d2c-9fec-c2fb2f922597';
async function main() {
  const logs = await prisma.activityLog.findMany({
    where: { 
      firmId: FIRM_ID,
      OR: [
        { metadata: { path: ['customerName'], equals: '9' } }, // hypothetical path
        { metadata: { path: ['parentId'], equals: '58' } },
        { details: { contains: '9' } },
        { details: { contains: '58' } }
      ]
    },
    take: 50
  });
  console.log('Logs involving 9 or 58:');
  console.log(JSON.stringify(logs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
