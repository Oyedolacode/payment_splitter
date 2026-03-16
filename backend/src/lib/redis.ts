import Redis from 'ioredis'
import { config } from './config'

// Shared Redis connection for BullMQ and rate limiting
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  reconnectOnError: (err) => {
    const targetError = 'READONLY'
    if (err.message.includes(targetError)) {
      return true
    }
    return false
  },
  // If Redis is down/limited, don't spam attempts
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
})

redis.on('connect', () => console.log('✅ Redis connected'))
redis.on('error', (err) => {
  if (err.message.includes('Limit: 500000')) {
    console.error('❌ Redis Quota Exhausted (Upstash)')
  } else {
    console.error('Redis error:', err)
  }
})
