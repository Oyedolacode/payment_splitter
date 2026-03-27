import { STATUS_META } from '../../constants/status'

type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'ROLLED_BACK' | 'REVIEW_REQUIRED' | 'ANOMALY_PAUSED' | 'STALLED'

interface StatusBadgeProps {
  status: JobStatus
  errorMessage?: string
}

export function StatusBadge({ status, errorMessage }: StatusBadgeProps) {
  let meta = STATUS_META[status] || STATUS_META.QUEUED
  
  // Custom override for rule-related failures
  if (status === 'FAILED' && errorMessage?.includes('No active split rule')) {
    meta = { label: 'Requires Action', color: '#f59e0b', bg: '#f59e0b10' }
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border">
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      <span className="text-[10px] font-800 uppercase tracking-wider text-text-2">{meta.label}</span>
    </div>
  )
}
