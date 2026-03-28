import { prisma } from '../../lib/prisma'
import { JobStatus } from '@prisma/client'

export interface FirmStats {
  id: string
  name: string
  totalIncoming: number
  totalAllocated: number
  remaining: number
  failedJobs: number
  totalJobs: number
  successRate: number
  lastSync: Date | null
  health: 'HEALTHY' | 'ATTENTION' | 'CRITICAL'
}

export interface OperationalAlert {
  id: string
  firmId: string
  firmName: string
  type: 'FAILED_JOB' | 'MISSING_RULE' | 'HIGH_VALUE' | 'STALLED'
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  message: string
  createdAt: Date
}

// Simple in-memory cache
const cache: Record<string, { data: any; timestamp: number }> = {}
const CACHE_TTL = 30000 // 30 seconds

/**
 * Get aggregated insights for a set of firms.
 * READ-ONLY: Only performs SELECT queries.
 */
export async function getMultiClientSummary(firmIds: string[]): Promise<{ firms: FirmStats[]; global: any }> {
  const cacheKey = `summary:${firmIds.sort().join(',')}`
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return cache[cacheKey].data
  }

  const firms = await prisma.firm.findMany({
    where: { id: { in: firmIds } },
    include: {
      paymentJobs: {
        orderBy: { updatedAt: 'desc' },
        take: 100 // Limit for performance, but usually enough for recent health
      },
      ledgerEntries: true
    }
  })

  const results: FirmStats[] = firms.map((firm) => {
    // 1. Calculate Ledger Totals
    const incoming = firm.ledgerEntries
      .filter(e => e.account === 'INCOMING_PAYMENT_POOL')
      .reduce((sum, e) => sum + Number(e.debit), 0)
    
    const allocated = firm.ledgerEntries
      .filter(e => e.account !== 'INCOMING_PAYMENT_POOL')
      .reduce((sum, e) => sum + Number(e.credit), 0)
    
    const remaining = incoming - allocated

    // 2. Job Stats
    const totalJobs = firm.paymentJobs.length
    const failedJobs = firm.paymentJobs.filter(j => j.status === JobStatus.FAILED).length
    const completeJobs = firm.paymentJobs.filter(j => j.status === JobStatus.COMPLETE).length
    const successRate = totalJobs > 0 ? (completeJobs / totalJobs) * 100 : 100
    const lastSync = firm.paymentJobs[0]?.updatedAt || null

    // 3. Health Scoring Logic
    let health: FirmStats['health'] = 'HEALTHY'
    if (failedJobs > 3 || successRate < 80) {
      health = 'CRITICAL'
    } else if (remaining > (incoming * 0.1) || failedJobs > 0) {
      health = 'ATTENTION'
    }

    return {
      id: firm.id,
      name: firm.name,
      totalIncoming: incoming,
      totalAllocated: allocated,
      remaining,
      failedJobs,
      totalJobs,
      successRate,
      lastSync,
      health
    }
  })

  const global = {
    totalFirms: results.length,
    totalIncoming: results.reduce((s, f) => s + f.totalIncoming, 0),
    totalAllocated: results.reduce((s, f) => s + f.totalAllocated, 0),
    totalRemaining: results.reduce((s, f) => s + f.remaining, 0),
    healthyCount: results.filter(f => f.health === 'HEALTHY').length,
    attentionCount: results.filter(f => f.health === 'ATTENTION').length,
    criticalCount: results.filter(f => f.health === 'CRITICAL').length
  }

  const data = { firms: results, global }
  cache[cacheKey] = { data, timestamp: Date.now() }
  return data
}

/**
 * Derives operational alerts dynamically from DB records.
 * READ-ONLY.
 */
export async function getOperationalAlerts(firmIds: string[]): Promise<OperationalAlert[]> {
  const cacheKey = `alerts:${firmIds.sort().join(',')}`
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return cache[cacheKey].data
  }

  // Fetch recent failed or stalled jobs
  const problematicJobs = await prisma.paymentJob.findMany({
    where: {
      firmId: { in: firmIds },
      status: { in: [JobStatus.FAILED, JobStatus.STALLED, JobStatus.REVIEW_REQUIRED] }
    },
    include: { firm: true },
    orderBy: { createdAt: 'desc' },
    take: 50
  })

  const alerts: OperationalAlert[] = problematicJobs.map((job) => {
    let type: OperationalAlert['type'] = 'FAILED_JOB'
    let severity: OperationalAlert['severity'] = 'CRITICAL'
    let message = job.errorMessage || 'Unknown matching error'

    if (job.status === JobStatus.STALLED) {
      type = 'STALLED'
      severity = 'WARNING'
      message = 'Job execution suspended — potential network or timeout issue'
    } else if (job.status === JobStatus.REVIEW_REQUIRED) {
      type = 'HIGH_VALUE'
      severity = 'INFO'
      message = 'Pending review — high value payment detected'
    } else if (message.includes('No active split rule')) {
      type = 'MISSING_RULE'
      severity = 'CRITICAL'
      // Keep original message as it contains the parentCustomerId for the frontend to parse
    } else if (message.includes('invariant violated') || message.includes('sum to')) {
      severity = 'CRITICAL'
      message = 'Allocation mismatch detected — total split does not equal payment total'
    }

    return {
      id: job.id,
      firmId: job.firmId,
      firmName: job.firm.name,
      type,
      severity,
      message,
      createdAt: job.createdAt
    }
  })

  cache[cacheKey] = { data: alerts, timestamp: Date.now() }
  return alerts
}

/**
 * Unified search over PaySplit data only.
 * READ-ONLY.
 */
export async function searchInsights(query: string, firmIds: string[]): Promise<any> {
  const cleanQuery = query.trim()
  if (!cleanQuery) return { jobs: [], entries: [] }

  const [jobs, entries] = await Promise.all([
    prisma.paymentJob.findMany({
      where: {
        firmId: { in: firmIds },
        OR: [
          { paymentId: { contains: cleanQuery, mode: 'insensitive' } },
          { errorMessage: { contains: cleanQuery, mode: 'insensitive' } }
        ]
      },
      include: { firm: true },
      take: 20
    }),
    prisma.ledgerEntry.findMany({
      where: {
        firmId: { in: firmIds },
        OR: [
          { account: { contains: cleanQuery, mode: 'insensitive' } },
          { paymentEventId: { contains: cleanQuery, mode: 'insensitive' } }
        ]
      },
      take: 20
    })
  ])

  return { jobs, entries }
}
