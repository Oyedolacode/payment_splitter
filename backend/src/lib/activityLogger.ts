import { prisma } from './prisma'

export type ActivityType =
    | 'PAYMENT_DETECTED'
    | 'RULE_APPLIED'
    | 'JOURNAL_CREATED'
    | 'FAILED'
    | 'ROLLED_BACK'
    | 'ANOMALY_DETECTED'
    | 'SKIPPED'
    | 'LEDGER_COMMITTED'
    | 'STALLED'
    | 'RULE_ADJUSTED'

export type ActorType = 'SYSTEM' | 'USER' | 'WEBHOOK'
export type Severity = 'INFO' | 'WARNING' | 'ERROR'

/**
 * Log an activity for a firm for auditing purposes.
 * This is a foundational system for the PaySplit audit trail.
 */
export async function logActivity(
    firmId: string,
    type: ActivityType,
    metadata: any = {},
    referenceId?: string,
    actorType: ActorType = 'SYSTEM',
    severity: Severity = 'INFO'
) {
    try {
        const log = await prisma.activityLog.create({
            data: {
                firmId,
                type,
                actorType,
                severity,
                referenceId,
                metadata,
            },
        })
        console.log(`[ACTIVITY LOG][${severity}] ${type} by ${actorType} for firm ${firmId}: ${log.id}`)
        return log
    } catch (error) {
        console.error(`[ACTIVITY LOG ERROR] Failed to log ${type} for firm ${firmId}:`, error)
        // We don't throw here to avoid crashing the main process if logging fails
    }
}
