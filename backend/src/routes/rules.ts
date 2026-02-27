import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { z } from 'zod'

const ruleConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('proportional'),
    weights: z.record(z.string(), z.number().positive()),
  }),
  z.object({
    type: z.literal('oldest_first'),
    locationIds: z.array(z.string()).min(1),
  }),
  z.object({
    type: z.literal('location_priority'),
    order: z.array(z.string()).min(1),
  }),
])

const createRuleSchema = z.object({
  firmId: z.string().uuid(),
  parentCustomerId: z.string().min(1),
  ruleConfig: ruleConfigSchema,
})

export async function rulesRoutes(fastify: FastifyInstance) {
  // GET /api/rules?firmId=xxx — list all rules for a firm
  fastify.get<{ Querystring: { firmId: string } }>('/', async (request, reply) => {
    const { firmId } = request.query
    if (!firmId) return reply.status(400).send({ error: 'firmId required' })

    const rules = await prisma.splitRule.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    })
    return rules
  })

  // POST /api/rules — create a new split rule
  fastify.post('/', async (request, reply) => {
    const body = createRuleSchema.parse(request.body)

    const firm = await prisma.firm.findUnique({ where: { id: body.firmId } })
    if (!firm) return reply.status(404).send({ error: 'Firm not found' })

    const plan = firm.plan

    // 1. Enforce Rule Count Limits
    if (plan === 'STANDARD' || plan === 'TRIAL') {
      const count = await prisma.splitRule.count({ where: { firmId: body.firmId } })
      if (count >= 3) {
        return reply.status(403).send({ error: `${plan} plan is limited to 3 rules. Upgrade to Professional for unlimited rules.` })
      }
    }

    // 2. Enforce Rule Type Restrictions
    if ((plan === 'STANDARD' || plan === 'TRIAL') && body.ruleConfig.type !== 'proportional') {
      return reply.status(403).send({ error: `${plan} plan only supports Proportional splitting. Upgrade for Oldest First logic.` })
    }
    if (plan === 'PROFESSIONAL' && body.ruleConfig.type === 'location_priority') {
      return reply.status(403).send({ error: 'Priority-based splitting requires the Practice plan.' })
    }

    // Validate proportional weights sum to 100
    if (body.ruleConfig.type === 'proportional') {
      const total = Object.values(body.ruleConfig.weights).reduce((s, w) => s + w, 0)
      if (Math.abs(total - 100) > 0.01) {
        return reply.status(400).send({ error: `Weights must sum to 100 (got ${total})` })
      }
    }

    const rule = await prisma.splitRule.create({
      data: {
        firmId: body.firmId,
        parentCustomerId: body.parentCustomerId,
        ruleType: body.ruleConfig.type,
        ruleConfig: body.ruleConfig,
      },
    })
    return reply.status(201).send(rule)
  })

  // PATCH /api/rules/:id — toggle active/inactive
  fastify.patch<{ Params: { id: string }; Body: { isActive: boolean } }>(
    '/:id',
    async (request, reply) => {
      const rule = await prisma.splitRule.update({
        where: { id: request.params.id },
        data: { isActive: request.body.isActive },
      })
      return rule
    }
  )

  // DELETE /api/rules/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await prisma.splitRule.delete({ where: { id: request.params.id } })
    return reply.status(204).send()
  })
}
