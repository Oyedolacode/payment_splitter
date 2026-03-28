import { AlertIcon, InfoIcon, XIcon, ZapIcon, CheckIcon, Chevron } from '../common/Icons'
import { timeAgo } from '../../lib/utils'

interface OperationalAlert {
  id: string
  firmId: string
  firmName: string
  type: 'FAILED_JOB' | 'MISSING_RULE' | 'HIGH_VALUE' | 'STALLED'
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  message: string
  createdAt: string
}

export function AlertsPanel({ alerts }: { alerts: OperationalAlert[] }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-surface/40 backdrop-blur-md border border-border border-dashed p-10 rounded-[40px] text-center flex flex-col items-center group">
        <div className="w-16 h-16 bg-[#10b98110] rounded-full flex items-center justify-center mb-4 text-[#10b981] relative">
            <div className="absolute inset-0 bg-[#10b98120] rounded-full animate-ping opacity-20" />
            <CheckIcon className="w-8 h-8 relative z-10" />
        </div>
        <h3 className="font-display text-[18px] font-800 text-text tracking-tight mb-2">All systems running smoothly</h3>
        <p className="text-text-3 text-[13px] max-w-[240px] leading-relaxed">No operational issues detected across your connected entities.</p>
      </div>
    )
  }

  // ── Grouping Logic ─────────────────────────────────────────────────────────
  const groups = alerts.reduce((acc, alert) => {
    if (!acc[alert.type]) acc[alert.type] = []
    acc[alert.type].push(alert)
    return acc
  }, {} as Record<string, OperationalAlert[]>)

  const sortedTypes = Object.entries(groups).sort((a, b) => {
    const severityMap = { CRITICAL: 0, WARNING: 1, INFO: 2 }
    return severityMap[a[1][0].severity] - severityMap[b[1][0].severity]
  })

  return (
    <div className="flex flex-col gap-6">
      {sortedTypes.map(([type, items]) => {
        const first = items[0]
        const typeLabel = type.replace('_', ' ')
        
        return (
          <div key={type} className="flex flex-col gap-3">
            {/* Group Header */}
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${
                        first.severity === 'CRITICAL' ? 'text-[#ef4444]' :
                        first.severity === 'WARNING' ? 'text-[#f59e0b]' :
                        'text-accent'
                    }`}>
                        {typeLabel}
                    </span>
                    <span className="w-4 h-4 rounded-full bg-surface-3 border border-border flex items-center justify-center text-[9px] font-black text-text-3">
                        {items.length}
                    </span>
                </div>
            </div>

            {/* Entity Alerts */}
            <div className="flex flex-col gap-2">
                {items.map((alert) => (
                    <div 
                        key={alert.id} 
                        className={`group flex items-start gap-4 p-4 rounded-[24px] border transition-all hover:translate-x-1 ${
                            alert.severity === 'CRITICAL' ? 'bg-[#ef444405] border-[#ef444415]' :
                            alert.severity === 'WARNING' ? 'bg-[#f59e0b05] border-[#f59e0b15]' :
                            'bg-surface-2/40 border-border/60'
                        }`}
                    >
                        <div className="flex flex-col flex-1 gap-0.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-text tracking-tight">{alert.firmName}</span>
                                <span className="text-[9px] font-extrabold text-text-3 opacity-60 uppercase">{timeAgo(alert.createdAt)}</span>
                            </div>
                            <p className="text-[12px] font-700 text-text leading-snug group-hover:text-accent transition-colors">
                                {alert.message}
                            </p>
                        </div>
                        <button className="text-text-3 hover:text-text p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Chevron className="w-3 h-3 rotate-[-90deg]" />
                        </button>
                    </div>
                ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
