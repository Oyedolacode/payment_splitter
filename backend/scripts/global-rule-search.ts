import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require"
    }
  }
});
async function main() {
  const rules = await prisma.splitRule.findMany({
    where: { parentCustomerId: '9' }
  });
  console.log('Global search for Customer 9 rules:');
  console.log(JSON.stringify(rules, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
