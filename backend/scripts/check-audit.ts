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
  const entries = await prisma.auditEntry.findMany({
    where: { subLocationId: '9' },
    take: 10
  });
  console.log('Audit Entries for "9":');
  console.log(JSON.stringify(entries, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
