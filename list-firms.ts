import { prisma } from './backend/src/lib/prisma';

async function listFirms() {
    try {
        const firms = await prisma.firm.findMany({
            select: {
                id: true,
                name: true,
                qboRealmId: true,
            }
        });
        console.log('Firms in database:');
        firms.forEach(f => {
            console.log(`- ID: ${f.id}, Name: ${f.name}, Realm: ${f.qboRealmId}`);
        });
    } catch (error) {
        console.error('Failed to list firms:', error);
    } finally {
        await prisma.$disconnect();
    }
}

listFirms();
