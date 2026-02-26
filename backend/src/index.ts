import Fastify from 'fastify' // trigger refresh
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import { config } from './lib/config'
import { authRoutes } from './routes/auth'
import { webhookRoutes } from './routes/webhooks'
import { rulesRoutes } from './routes/rules'
import { jobsRoutes } from './routes/jobs'
import { qboRoutes } from './routes/qbo'
import { stripeRoutes } from './routes/stripe'
import { startWorker } from './workers/paymentWorker'

const server = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'info' : 'warn',
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
})

// ── Server Setup ────────────────────────────────────────────────────────

async function bootstrap() {
  // ── Security & middleware ─────────────────────────────────────────────────
  await server.register(helmet, { contentSecurityPolicy: false })
  await server.register(cors, {
    origin: config.FRONTEND_URL,
    credentials: true,
  })
  await server.register(cookie)
  await server.register(jwt, { secret: config.JWT_SECRET })

  // ── Routes ────────────────────────────────────────────────────────────────
  await server.register(authRoutes, { prefix: '/auth' })
  await server.register(webhookRoutes, { prefix: '/webhooks' })
  await server.register(rulesRoutes, { prefix: '/api/rules' })
  await server.register(jobsRoutes, { prefix: '/api/jobs' })
  await server.register(qboRoutes, { prefix: '/api/qbo' })
  await server.register(stripeRoutes, { prefix: '/api/stripe' })

  // ── Health check ──────────────────────────────────────────────────────────
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // ── Start BullMQ worker ───────────────────────────────────────────────────
  await startWorker()
  server.log.info('Payment processing worker started')

  // ── Listen ────────────────────────────────────────────────────────────────
  await server.listen({ port: config.PORT, host: '0.0.0.0' })
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
