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
  const firm = await prisma.firm.findUnique({ where: { id: FIRM_ID } });
  if (!firm || !firm.accessToken || !firm.qboRealmId) throw new Error('Firm data missing');

  const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${firm.qboRealmId}/query?query=${encodeURIComponent("SELECT * FROM Customer WHERE Id = '9'")}`;
  
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${firm.accessToken}`,
      'Accept': 'application/json'
    }
  });

  const data = await res.json();
  console.log('Customer 9 QBO Data:');
  console.log(JSON.stringify(data, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
