import { AlertIcon, InfoIcon, XIcon, ZapIcon } from '../common/Icons'
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
      <div className="bg-surface/40 backdrop-blur-md border border-border border-dashed p-10 rounded-[32px] text-center">
        <div className="w-12 h-12 bg-[#10b98110] rounded-full flex items-center justify-center mx-auto mb-4 text-[#10b981]">
            <ZapIcon className="w-6 h-6" />
        </div>
        <h3 className="font-display text-[15px] font-800 text-text-2 mb-1">System Healthy</h3>
        <p className="text-text-3 text-[12px]">All processes are operating normally.</p>
      </div>
    )
  }

  const topIssues = alerts.filter(a => a.severity === 'CRITICAL')
  const warnings = alerts.filter(a => a.severity === 'WARNING')
  const info = alerts.filter(a => a.severity === 'INFO')

  return (
    <div className="flex flex-col gap-6">
      {/* Top Issues Summary Card */}
      {topIssues.length > 0 && (
        <div className="bg-gradient-to-br from-[#ef444408] to-transparent border border-[#ef444430] p-6 rounded-[32px] animate-pulse-slow">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[#ef444415] rounded-2xl flex items-center justify-center text-[#ef4444]">
                    <AlertIcon className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-display text-[16px] font-800 text-[#ef4444]">Top Operational Issues</h3>
                    <p className="text-[12px] font-bold uppercase tracking-wider text-[#ef444480]">Action Required immediately</p>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {topIssues.slice(0, 3).map(alert => (
                    <div key={alert.id} className="bg-white/50 backdrop-blur shadow-sm border border-[#ef444420] px-4 py-3 rounded-2xl flex flex-col gap-1 max-w-[300px]">
                        <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">{alert.firmName}</span>
                        <p className="text-[12px] font-700 text-text leading-tight line-clamp-2">{alert.message}</p>
                    </div>
                ))}
            </div>
        </div>
      )}

      {/* Dynamic Alerts List */}
      <div className="flex flex-col gap-3">
        {alerts.map((alert) => (
          <div 
            key={alert.id} 
            className={`flex items-start gap-4 p-5 rounded-[24px] border transition-all hover:translate-x-1 ${
                alert.severity === 'CRITICAL' ? 'bg-[#ef444405] border-[#ef444415]' :
                alert.severity === 'WARNING' ? 'bg-[#f59e0b05] border-[#f59e0b15]' :
                'bg-surface-2/40 border-border/60'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                alert.severity === 'CRITICAL' ? 'text-[#ef4444] bg-[#ef444410]' :
                alert.severity === 'WARNING' ? 'text-[#f59e0b] bg-[#f59e0b10]' :
                'text-accent bg-accent/10'
            }`}>
              {alert.severity === 'CRITICAL' ? <AlertIcon className="w-4 h-4" /> : <InfoIcon className="w-4 h-4" />}
            </div>
            <div className="flex flex-col flex-1 gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-text-3 uppercase tracking-widest">{alert.firmName}</span>
                <span className="text-[10px] font-extrabold text-text-3 opacity-60 uppercase">{timeAgo(alert.createdAt)}</span>
              </div>
              <p className="text-[13px] font-800 text-text leading-snug">{alert.message}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-900 tracking-wider uppercase ${
                    alert.type === 'FAILED_JOB' ? 'bg-[#ef444410] text-[#ef4444]' :
                    alert.type === 'MISSING_RULE' ? 'bg-[#f59e0b10] text-[#f59e0b]' :
                    'bg-accent/10 text-accent'
                }`}>
                  {alert.type.replace('_', ' ')}
                </span>
              </div>
            </div>
            <button className="text-text-3 hover:text-text p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <XIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
