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
            return customers
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
            return locations
        } catch (err: any) {
            console.error('[QBO Locations Error]:', err)
            const message = err instanceof Error ? err.message : 'Failed to fetch locations'
            return reply.status(500).send({ error: message, details: err.message || err })
        }
    })
}
