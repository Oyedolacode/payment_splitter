import { PrismaClient } from '@prisma/client';
import { fetchAllCustomers } from '../src/services/qboClient';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require"
    }
  }
});
const FIRM_ID = '8e5642b8-6cb5-4d2c-9fec-c2fb2f922597';

async function main() {
  const firm = await prisma.firm.findUnique({ where: { id: FIRM_ID } });
  if (!firm || !firm.qboRealmId) throw new Error('Firm not found or not connected');

  const customers = await fetchAllCustomers(FIRM_ID, firm.qboRealmId);
  const target = customers.find(c => c.Id === '9');
  
  console.log('Customer 9 Details:');
  console.log(JSON.stringify(target, null, 2));
  
  if (target && target.ParentRef) {
    console.log('Customer 9 is a CHILD of:', target.ParentRef.value);
  } else {
    console.log('Customer 9 is a PARENT (or top-level)');
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
