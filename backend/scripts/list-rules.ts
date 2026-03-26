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
  const rules = await prisma.splitRule.findMany({
    where: { firmId: FIRM_ID }
  });
  console.log('Rules for Firm:', FIRM_ID);
  console.log(JSON.stringify(rules, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
