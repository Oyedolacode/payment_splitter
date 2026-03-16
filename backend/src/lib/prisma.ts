import { PrismaClient, Prisma } from '@prisma/client'

// Prevent multiple instances in development (hot reload)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Global fix for Decimal serialization
if (!(Prisma.Decimal.prototype as any).toJSON_overridden) {
  (Prisma.Decimal.prototype as any).toJSON = function () {
    return this.toNumber()
  };
  (Prisma.Decimal.prototype as any).toJSON_overridden = true
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
