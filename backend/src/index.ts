import Fastify from 'fastify' 
import dns from 'node:dns'
dns.setDefaultResultOrder('ipv4first')

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
import { insightsRoutes } from './routes/insights'
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
  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, {
    origin: true, // Temporarily allow all origins to isolate the underlying crash
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  });
  await server.register(cookie);
  await server.register(jwt, { secret: config.JWT_SECRET });

  // ── Routes ────────────────────────────────────────────────────────────────
  await server.register(authRoutes, { prefix: '/auth' });
  await server.register(webhookRoutes, { prefix: '/webhooks' });
  await server.register(rulesRoutes, { prefix: '/api/rules' });
  await server.register(jobsRoutes, { prefix: '/api/jobs' });
  await server.register(qboRoutes, { prefix: '/api/qbo' });
  await server.register(stripeRoutes, { prefix: '/api/stripe' });
  await server.register(insightsRoutes, { prefix: '/api/insights' });

  // ── Health check ──────────────────────────────────────────────────────────
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  console.log('🏁 Starting bootstrap process...')
  
  // ── Config verification ──
  try {
    console.log(`📡 Environment: ${config.NODE_ENV}, Port: ${config.PORT}`)
  } catch (e) {
    console.error('❌ Config validation failed at runtime!')
    throw e
  }

  // ── Listen ────────────────────────────────────────────────────────────────
  try {
    const address = await server.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`✅ Server listening on ${address}`);
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }

  // ── Start BullMQ worker (Background) ───────────────────────────────────────
  // We start this AFTER listening so Railway health checks pass immediately.
  try {
    const worker = await startWorker();
    Object.assign(server, { worker });
    console.log('🚀 Payment processing worker initialized and listening');
  } catch (err) {
    console.error('❌ Failed to start worker:', err);
    // Non-fatal for the web server, but worker logic won't run.
  }
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
