import { FastifyInstance } from 'fastify'
import { randomBytes } from 'crypto'
import { getAuthorizationUrl, exchangeCodeForTokens } from '../services/qboAuth'
import { encrypt } from '../lib/encryption'
import { prisma } from '../lib/prisma'
import { config } from '../lib/config'
import { z } from 'zod'

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * GET /auth/qbo/connect
   * Initiates the QBO OAuth flow. Redirects user to Intuit's authorization page.
   * The firmId must be passed as a query param — the firm must exist in the DB first.
   */
  fastify.get<{ Querystring: { firmId: string } }>(
    '/qbo/connect',
    async (request, reply) => {
      const { firmId } = request.query

      if (!firmId) {
        return reply.status(400).send({ error: 'firmId is required' })
      }

      // Store firmId in state so we can retrieve it in the callback
      const state = `${firmId}:${randomBytes(16).toString('hex')}`

      // Set state in a short-lived cookie for CSRF protection
      reply.setCookie('oauth_state', state, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/',
      })

      const authUrl = getAuthorizationUrl(state)
      return reply.redirect(302, authUrl)
    }
  )

  /**
   * GET /auth/qbo/callback
   * QBO redirects here after the user authorizes the app.
   * Exchanges the code for tokens and stores them encrypted in the DB.
   */
  fastify.get<{
    Querystring: { code: string; state: string; realmId: string; error?: string }
  }>('/qbo/callback', async (request, reply) => {
    const { code, state, realmId, error } = request.query

    if (error) {
      return reply.redirect(302, `${config.FRONTEND_URL}/connect?error=${encodeURIComponent(error)}`)
    }

    // Validate state to prevent CSRF
    const cookieState = request.cookies.oauth_state
    if (!cookieState || cookieState !== state) {
      return reply.status(400).send({ error: 'Invalid OAuth state — possible CSRF attack' })
    }

    // Extract firmId from state
    const firmId = state.split(':')[0]

    try {
      const { accessToken, refreshToken, expiresAt } = await exchangeCodeForTokens(code, realmId)

      // ── SMART MERGE SYSTEM ────────────────────────────────────────────────
      // We look for any OTHER firm already registered to this QBO Realm.
      // If we find one, we "adopt" their record and throw away the placeholder firmId.
      const existing = await prisma.firm.findUnique({
        where: { qboRealmId: realmId }
      })

      if (existing && existing.id !== firmId) {
        console.log(`[AUTH] Merging connection for realm ${realmId} from firm ${firmId} into existing ${existing.id}`)

        // Update the existing firm with the new fresh tokens
        await prisma.firm.update({
          where: { id: existing.id },
          data: {
            accessToken: encrypt(accessToken),
            refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
            tokenExpiresAt: expiresAt,
          },
        })

        // Clean up the placeholder firm we just created in step 1
        try {
          await prisma.firm.delete({ where: { id: firmId } })
        } catch (e) {
          console.warn(`[AUTH] Cleanup of placeholder firm ${firmId} failed (non-fatal):`, e)
        }

        reply.clearCookie('oauth_state')
        return reply.redirect(302, `${config.FRONTEND_URL}/dashboard?connected=true&id=${existing.id}&reentry=true`)
      }

      // Normal flow: The user is connecting a new realm, or reconnecting their own.
      await prisma.firm.update({
        where: { id: firmId },
        data: {
          qboRealmId: realmId,
          accessToken: encrypt(accessToken),
          refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
          tokenExpiresAt: expiresAt,
        },
      })

      reply.clearCookie('oauth_state')
      return reply.redirect(302, `${config.FRONTEND_URL}/dashboard?connected=true`)
    } catch (err) {
      console.error('QBO OAuth callback error:', err)
      const message = err instanceof Error ? err.stack || err.message : 'Token exchange failed'
      return reply.redirect(302, `${config.FRONTEND_URL}/connect?error=${encodeURIComponent(message)}`)
    }
  })

  /**
   * POST /auth/firms
   * Create a new firm record before initiating OAuth.
   */
  const createFirmSchema = z.object({ name: z.string().min(1) })

  fastify.post('/firms', async (request, reply) => {
    try {
      const body = createFirmSchema.parse(request.body)
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + 30)

      const firm = await (prisma.firm as any).create({
        data: {
          name: body.name,
          plan: 'TRIAL',
          trialEndsAt,
        },
      })
      return reply.status(201).send({ id: firm.id, name: firm.name })
    } catch (err) {
      console.error('Firm creation error:', err)
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: err.errors })
      }
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : 'Unknown database error'
      })
    }
  })

  /**
   * GET /auth/firms/:id/status
   * Check if a firm is connected to QBO.
   */
  fastify.get<{ Params: { id: string } }>('/firms/:id/status', async (request, reply) => {
    try {
      const firm = await (prisma.firm as any).findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          name: true,
          qboRealmId: true,
          tokenExpiresAt: true,
          isSubscribed: true,
          plan: true,
          trialEndsAt: true,
        },
      })

      if (!firm) return reply.status(404).send({ error: 'Firm not found' })

      return {
        id: firm.id,
        name: firm.name,
        connected: !!firm.qboRealmId,
        tokenExpiresAt: firm.tokenExpiresAt,
        isSubscribed: (firm as any).isSubscribed,
        plan: (firm as any).plan,
        trialEndsAt: (firm as any).trialEndsAt,
      }
    } catch (err) {
      console.error('Error fetching firm status:', err)
      return reply.status(500).send({ error: 'Internal Server Error' })
    }
  })

  // Temporary debug route — fetch customers from QBO sandbox
  fastify.get<{ Querystring: { firmId: string } }>('/qbo/customers', async (request, reply) => {
    const { firmId } = request.query
    const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })
    const { fetchAllCustomers } = await import('../services/qboClient')
    const customers = await fetchAllCustomers(firmId, firm.qboRealmId!)
    return customers
  })
}
