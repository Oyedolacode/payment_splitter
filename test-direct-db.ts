import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://postgres.hawghpeiphwoujcqpqio:PaySplit2026@3.65.151.229:5432/postgres?sslmode=require"
        }
    }
});

async function testConnection() {
    try {
        console.log('Testing DIRECT connection...');
        const result = await prisma.$queryRaw`SELECT 1`;
        console.log('DIRECT Connection successful:', result);
    } catch (error) {
        console.error('DIRECT Connection failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testConnection();
