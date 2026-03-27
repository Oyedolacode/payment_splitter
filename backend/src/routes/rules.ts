import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { z } from 'zod'

const ruleConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('proportional'),
    weights: z.record(z.string(), z.number().nonnegative()),
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

const allowedStrategiesByPlan: Record<string, string[]> = {
  TRIAL: ['proportional'],
  PRACTICE: ['proportional', 'oldest_first'],
  SCALE: ['proportional', 'oldest_first', 'location_priority'],
  ELITE: ['proportional', 'oldest_first', 'location_priority'],
}

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

    const isTrialing = firm.trialEndsAt && firm.trialEndsAt > new Date()
    if (!firm.isSubscribed && !isTrialing) {
      return reply.status(403).send({ error: 'Subscription or trial has expired. Please subscribe to continue.' })
    }

    const plan = firm.plan

    // 1. Enforce Rule Count Limits (3 for TRIAL/STANDARD)
    if (plan === 'STANDARD' || plan === 'TRIAL') {
      const count = await prisma.splitRule.count({ where: { firmId: body.firmId } })
      if (count >= 3) {
        return reply.status(403).send({ error: `${plan} plan is limited to 3 rules. Upgrade to Professional for unlimited rules.` })
      }
    }

    // 2. Enforce Rule Type Restrictions
    const allowed = allowedStrategiesByPlan[plan] || ['proportional']
    if (!allowed.includes(body.ruleConfig.type)) {
      return reply.status(403).send({
        error: `Strategy '${body.ruleConfig.type}' is not available on the ${plan} plan. Upgrade to Professional to unlock.`
      })
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

  // PATCH /api/rules/:id — update status or config
  fastify.patch<{ Params: { id: string }; Body: { isActive?: boolean; ruleConfig?: any } }>(
    '/:id',
    async (request, reply) => {
      const rule = await prisma.splitRule.findUnique({ where: { id: request.params.id }, include: { firm: true } })
      if (!rule) return reply.status(404).send({ error: 'Rule not found' })

      const firm = rule.firm
      const isTrialing = firm.trialEndsAt && firm.trialEndsAt > new Date()
      if (!firm.isSubscribed && !isTrialing) {
        return reply.status(403).send({ error: 'Subscription or trial has expired. Please subscribe to continue.' })
      }

      const plan = firm.plan
      const allowed = allowedStrategiesByPlan[plan] || ['proportional']
      const currentType = rule.ruleType
      const isCurrentlyLocked = !allowed.includes(currentType)

      // If already violates plan, allow activation/deactivation but block config changes
      if (isCurrentlyLocked && request.body.ruleConfig) {
        // Automatically sync locked state to DB if not already set
        if (!rule.isLocked) {
          await prisma.splitRule.update({
            where: { id: rule.id },
            data: { isLocked: true, lockedReason: 'PLAN_DOWNGRADE' }
          })
        }
        return reply.status(403).send({
          error: `Strategy '${currentType}' is locked on the ${plan} plan due to a downgrade. Upgrade to Professional to edit.`
        })
      }

      const data: any = {}
      if (request.body.isActive !== undefined) data.isActive = request.body.isActive

      if (request.body.ruleConfig) {
        const newType = request.body.ruleConfig.type || rule.ruleType
        if (!allowed.includes(newType)) {
          return reply.status(403).send({
            error: `Strategy '${newType}' is not available on the ${plan} plan.`
          })
        }
        data.ruleConfig = request.body.ruleConfig
        data.ruleType = newType
        // If they updated to an allowed type, unlock
        data.isLocked = false
        data.lockedReason = null
      }

      const updated = await prisma.splitRule.update({
        where: { id: request.params.id },
        data
      })
      return updated
    }
  )

  // DELETE /api/rules/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await prisma.splitRule.delete({ where: { id: request.params.id } })
    return reply.status(204).send()
  })

  // POST /api/rules/:id/set-default — mark rule as the catch-all default
  fastify.post<{ Params: { id: string }; Body: { firmId: string } }>('/:id/set-default', async (request, reply) => {
    const { id } = request.params
    const { firmId } = request.body
    if (!firmId) return reply.status(400).send({ error: 'firmId required' })

    // Clear default from all other rules for this firm first
    await prisma.splitRule.updateMany({
      where: { firmId, isDefault: true },
      data: { isDefault: false }
    })

    // Mark this rule as default
    const updated = await prisma.splitRule.update({
      where: { id },
      data: { isDefault: true }
    })

    console.log(`[RULES] Rule ${id} set as DEFAULT FALLBACK for firm ${firmId}`)
    return updated
  })
}
