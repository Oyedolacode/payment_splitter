import { prisma } from './src/lib/prisma'
import { logActivity } from './src/lib/activityLogger'

async function verify() {
    console.log('--- STARTING AUDIT & MODE VERIFICATION ---')

    const firm = await prisma.firm.create({
        data: {
            name: 'Audit Test Firm',
            qboRealmId: `audit-test-${Date.now()}`,
            plan: 'PROFESSIONAL',
            allocationMode: 'REVIEW'
        }
    })
    console.log(`Created test firm: ${firm.id} in REVIEW mode.`)

    // 1. Test Activity Logging
    await logActivity(firm.id, 'PAYMENT_DETECTED', { test: true })
    const logs = await prisma.activityLog.findMany({ where: { firmId: firm.id } })

    if (logs.length === 1 && logs[0].type === 'PAYMENT_DETECTED') {
        console.log('✅ Activity Logging: SUCCESS')
    } else {
        console.error('❌ Activity Logging: FAILED', logs)
    }

    // 2. Verify Allocation Mode Update
    const updatedFirm = await prisma.firm.update({
        where: { id: firm.id },
        data: { allocationMode: 'AUTO' }
    })
    if (updatedFirm.allocationMode === 'AUTO') {
        console.log('✅ Allocation Mode Update: SUCCESS')
    } else {
        console.error('❌ Allocation Mode Update: FAILED')
    }

    console.log('Cleaning up...')
    await prisma.activityLog.deleteMany({ where: { firmId: firm.id } })
    await prisma.firm.delete({ where: { id: firm.id } })

    console.log('--- VERIFICATION COMPLETE ---')
}

verify().catch(console.error).finally(() => prisma.$disconnect())
