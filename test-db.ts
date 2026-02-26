import { prisma } from './backend/src/lib/prisma';

async function testConnection() {
    try {
        console.log('Testing connection...');
        const result = await prisma.$queryRaw`SELECT 1`;
        console.log('Connection successful:', result);
    } catch (error) {
        console.error('Connection failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testConnection();
