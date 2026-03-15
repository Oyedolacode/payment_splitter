import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { fetchAllCustomers, fetchAllLocations } from '../services/qboClient'

export async function qboRoutes(fastify: FastifyInstance) {
    // GET /api/qbo/customers?firmId=xxx
    fastify.get<{ Querystring: { firmId: string } }>('/customers', async (request, reply) => {
        const { firmId } = request.query
        if (!firmId) return reply.status(400).send({ error: 'firmId required' })

        try {
            const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })
            if (!firm.qboRealmId) return reply.status(400).send({ error: 'Firm not connected to QBO' })

            const customers = await fetchAllCustomers(firmId, firm.qboRealmId)
            // Normalize PascalCase from QBO to camelCase for frontend
            return customers.map(c => ({
                id: c.Id,
                displayName: c.DisplayName,
                companyName: c.CompanyName,
                parentId: c.ParentRef?.value,
                active: c.Active
            }))
        } catch (err: any) {
            console.error('[QBO Customers Error]:', err)
            const message = err instanceof Error ? err.message : 'Failed to fetch customers'
            return reply.status(500).send({ error: message, details: err.message || err })
        }
    })

    // GET /api/qbo/locations?firmId=xxx
    fastify.get<{ Querystring: { firmId: string } }>('/locations', async (request, reply) => {
        const { firmId } = request.query
        if (!firmId) return reply.status(400).send({ error: 'firmId required' })

        try {
            const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })
            if (!firm.qboRealmId) return reply.status(400).send({ error: 'Firm not connected to QBO' })

            const locations = await fetchAllLocations(firmId, firm.qboRealmId)
            // Normalize PascalCase from QBO to camelCase for frontend
            return locations.map(l => ({
                id: l.Id,
                name: l.Name || l.DisplayName,
                active: l.Active
            }))
        } catch (err: any) {
            console.error('[QBO Locations Error]:', err)
            const message = err instanceof Error ? err.message : 'Failed to fetch locations'
            return reply.status(500).send({ error: message, details: err.message || err })
        }
    })

    // GET /api/qbo/sub-customers?firmId=xxx&parentCustomerId=yyy
    fastify.get<{ Querystring: { firmId: string, parentCustomerId: string } }>('/sub-customers', async (request, reply) => {
        const { firmId, parentCustomerId } = request.query
        if (!firmId || !parentCustomerId) return reply.status(400).send({ error: 'firmId and parentCustomerId required' })

        try {
            const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })
            if (!firm.qboRealmId) return reply.status(400).send({ error: 'Firm not connected to QBO' })

            const { fetchSubCustomers } = await import('../services/qboClient')
            console.log(`[QBO Sub-Customers] Fetching for firm ${firmId}, parent ${parentCustomerId}`)
            
            const subs = await fetchSubCustomers(firmId, firm.qboRealmId, parentCustomerId)
            console.log(`[QBO Sub-Customers] Found ${subs.length} sub-customers`)
            
            return subs.map(c => ({
                id: c.Id,
                name: c.DisplayName,
                active: c.Active
            }))
        } catch (err: any) {
            console.error('[QBO Sub-Customers Error]:', err)
            return reply.status(500).send({ 
                error: 'Failed to fetch sub-customers',
                details: err.message || err 
            })
        }
    })
}
