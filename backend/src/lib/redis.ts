import Redis from 'ioredis'
import { config } from './config'

// Shared Redis connection for BullMQ and rate limiting
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
})

redis.on('connect', () => console.log('✅ Redis connected'))
redis.on('error', (err) => console.error('Redis error:', err))
