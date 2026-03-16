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
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        cb(null, true);
        return;
      }
      
      const allowedOrigins = [config.FRONTEND_URL];
      // Also allow the specific production origin reported by the user just in case
      const userOrigin = 'https://frontend-production-fa86.up.railway.app';
      if (!allowedOrigins.includes(userOrigin)) {
        allowedOrigins.push(userOrigin);
      }

      if (allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error('Not allowed by CORS'), false);
    },
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

  // ── Health check ──────────────────────────────────────────────────────────
  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ── Start BullMQ worker ───────────────────────────────────────────────────
  try {
    const worker = await startWorker();
    Object.assign(server, { worker });
    console.log('🚀 Payment processing worker initialized and listening');
  } catch (err) {
    console.error('❌ Failed to start worker:', err);
    // Continue starting the server so we can at least provide health checks
  }

  // ── Listen ────────────────────────────────────────────────────────────────
  try {
    await server.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`✅ Server listening on port ${config.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
