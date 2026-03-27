/**
 * Shared Status Constants and Metadata.
 * Rules: UI_RULES.md, COMPONENTS_RULES.md
 */

export const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  QUEUED: { label: 'Queued', color: '#6366f1', bg: '#6366f110' },
  PROCESSING: { label: 'Processing', color: '#f59e0b', bg: '#f59e0b10' },
  COMPLETE: { label: 'Completed', color: '#10b981', bg: '#10b98110' },
  FAILED: { label: 'Failed', color: '#ef4444', bg: '#ef444410' },
  REVIEW_REQUIRED: { label: 'Review Required', color: '#ec4899', bg: '#ec489910' },
  ANOMALY_PAUSED: { label: 'Anomaly Detected', color: '#8b5cf6', bg: '#8b5cf610' },
  ROLLED_BACK: { label: 'Rolled Back', color: '#64748b', bg: '#64748b10' },
  ALLOCATING: { label: 'Allocating', color: '#f59e0b', bg: '#f59e0b10' }, // For derived ledger status
}
