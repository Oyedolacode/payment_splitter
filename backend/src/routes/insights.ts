import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify'
import { prisma } from '../lib/prisma'
import * as insightsService from '../services/insights/insightsService'

export async function insightsRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  
  // Middleware to mock "currentUser"
  // In a real app, this would be derived from JWT
  const getCurrentUser = (request: FastifyRequest) => {
    // For now, we mock a user that has access to ALL firms in the DB
    // since we don't have a User-to-Firm relationship yet.
    return {
      id: 'mock-user-id',
      firmIds: [] as string[], 
    }
  }

  // GET /api/insights/dashboard
  fastify.get('/dashboard', async (request: any, reply) => {
    try {
      let { firmIds } = getCurrentUser(request)
      
      if (firmIds.length === 0) {
        // Mock fallback: Get all firm IDs currently in DB
        const allFirms = await prisma.firm.findMany({ select: { id: true } })
        firmIds = allFirms.map((f: any) => f.id)
      }

      if (firmIds.length === 0) {
        return { firms: [], global: { totalFirms: 0, totalIncoming: 0, totalAllocated: 0, totalRemaining: 0 } }
      }

      const summary = await insightsService.getMultiClientSummary(firmIds)
      return summary
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Failed to fetch dashboard insights' })
    }
  })

  // GET /api/insights/alerts
  fastify.get('/alerts', async (request: any, reply) => {
    try {
      let { firmIds } = getCurrentUser(request)
      if (firmIds.length === 0) {
        const allFirms = await prisma.firm.findMany({ select: { id: true } })
        firmIds = allFirms.map((f: any) => f.id)
      }

      const alerts = await insightsService.getOperationalAlerts(firmIds)
      return alerts
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Failed to fetch alerts' })
    }
  })

  // GET /api/insights/search
  fastify.get('/search', async (request: any, reply) => {
    const { q } = request.query as { q: string }
    if (!q) return { jobs: [], entries: [] }

    try {
      let { firmIds } = getCurrentUser(request)
      if (firmIds.length === 0) {
        const allFirms = await prisma.firm.findMany({ select: { id: true } })
        firmIds = allFirms.map((f: any) => f.id)
      }

      const results = await insightsService.searchInsights(q, firmIds)
      return results
    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ error: 'Search failed' })
    }
  })
}
