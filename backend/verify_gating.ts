import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function verifyGating() {
    console.log('--- STARTING GATING VERIFICATION ---')

    try {
        // 1. Create a TRIAL firm
        const trialFirm = await prisma.firm.create({
            data: {
                name: 'Trial Firm Test',
                plan: 'TRIAL',
            }
        })
        console.log(`Created TRIAL firm: ${trialFirm.id}`)

        // 2. Create a PROFESSIONAL firm
        const proFirm = await prisma.firm.create({
            data: {
                name: 'Pro Firm Test',
                plan: 'PROFESSIONAL',
                isSubscribed: true,
                subscriptionStatus: 'active'
            }
        })
        console.log(`Created PROFESSIONAL firm: ${proFirm.id}`)

        const API = 'http://localhost:3001/api/rules'

        // Helper to test rule creation
        async function testCreate(firmId: string, ruleType: string, ruleConfig: any) {
            const res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firmId, parentCustomerId: '123', ruleConfig })
            })
            const data: any = await res.json()
            console.log(`POST ${ruleType} for ${firmId}: Status ${res.status}`, data.error || 'SUCCESS')
            return { ok: res.ok, status: res.status, id: data.id }
        }

        // Helper to test rule patching
        async function testPatch(ruleId: string, ruleConfig: any) {
            const res = await fetch(`${API}/${ruleId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ruleConfig })
            })
            const data: any = await res.json()
            console.log(`PATCH rule ${ruleId}: Status ${res.status}`, data.error || 'SUCCESS')
            return res.ok
        }

        // --- TESTS ---

        // A. Trial firm should succeed with proportional
        await testCreate(trialFirm.id, 'proportional', { type: 'proportional', weights: { 'loc1': 100 } })

        // B. Trial firm should fail with waterfall
        await testCreate(trialFirm.id, 'oldest_first', { type: 'oldest_first', locationIds: ['loc1'] })

        // C. Trial firm should fail with location_priority
        await testCreate(trialFirm.id, 'location_priority', { type: 'location_priority', order: ['loc1'] })

        // D. Pro firm should succeed with all
        const proRule = await testCreate(proFirm.id, 'location_priority', { type: 'location_priority', order: ['loc1'] })

        // E. Simulate downgrade and block edit
        console.log('Simulating downgrade for Pro firm...')
        await prisma.firm.update({ where: { id: proFirm.id }, data: { plan: 'STANDARD' } })

        if (proRule.ok && proRule.id) {
            await testPatch(proRule.id, { type: 'location_priority', order: ['loc2'] })
        }

        // Cleanup
        console.log('Cleaning up...')
        await prisma.splitRule.deleteMany({ where: { firmId: { in: [trialFirm.id, proFirm.id] } } })
        await prisma.firm.deleteMany({ where: { id: { in: [trialFirm.id, proFirm.id] } } })

        console.log('--- VERIFICATION COMPLETE ---')
    } catch (err) {
        console.error('Verification error:', err)
    } finally {
        await prisma.$disconnect()
    }
}

verifyGating()
