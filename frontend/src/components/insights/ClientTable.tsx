import { StatusBadge } from '../common/StatusBadge'
import { Chevron, CheckIcon, XIcon, ActivityIcon } from '../common/Icons'
import { fmt } from '../../lib/formatters'
import { timeAgo } from '../../lib/utils'

interface FirmStats {
  id: string
  name: string
  totalIncoming: number
  totalAllocated: number
  remaining: number
  failedJobs: number
  totalJobs: number
  successRate: number
  lastSync: string | null
  health: 'HEALTHY' | 'ATTENTION' | 'CRITICAL'
}

export function ClientTable({ firms }: { firms: FirmStats[] }) {
  if (!firms || firms.length === 0) {
    return (
      <div className="bg-surface/40 backdrop-blur-md border border-border border-dashed p-20 rounded-[32px] text-center">
        <div className="w-16 h-16 bg-surface-2 rounded-full flex items-center justify-center mx-auto mb-4 text-[32px] opacity-50 grayscale">🏢</div>
        <h3 className="font-display text-[18px] font-800 text-text-2 mb-2">No clients found</h3>
        <p className="text-text-3 text-[14px]">Connect your first QuickBooks entity to see operational insights.</p>
      </div>
    )
  }

  return (
    <div className="bg-surface/80 backdrop-blur-2xl border border-border rounded-[32px] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-2/50 border-b border-border">
              <th className="px-6 py-5 text-[10px] font-bold text-text-3 uppercase tracking-widest">Client Name</th>
              <th className="px-6 py-5 text-[10px] font-bold text-text-3 uppercase tracking-widest">OP Health</th>
              <th className="px-6 py-5 text-[10px] font-bold text-text-3 uppercase tracking-widest">Needs Action</th>
              <th className="px-6 py-5 text-[10px] font-bold text-text-3 uppercase tracking-widest">Cash Volume</th>
              <th className="px-6 py-5 text-[10px] font-bold text-text-3 uppercase tracking-widest">Success Rate</th>
              <th className="px-6 py-5 text-[10px] font-bold text-text-3 uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {firms.map((firm) => (
              <tr key={firm.id} className="group hover:bg-surface-2/30 transition-all">
                <td className="px-6 py-5">
                  <div className="flex flex-col">
                    <span className="font-display font-800 text-[14px] text-text tracking-tight">{firm.name}</span>
                    <span className="text-[10px] text-text-3 font-semibold uppercase tracking-wider mt-0.5">ID: {firm.id.slice(0, 8)}...</span>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <HealthBadge status={firm.health} percentage={firm.successRate} />
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col gap-1">
                    {firm.failedJobs > 0 && (
                        <div className="flex items-center gap-1.5 text-[#ef4444] text-[11px] font-800">
                            <span className="w-2 h-2 bg-[#ef4444] rounded-full animate-pulse" />
                            {firm.failedJobs} failed jobs
                        </div>
                    )}
                    {firm.remaining > (firm.totalIncoming * 0.01) && (
                        <div className="flex items-center gap-1.5 text-[#f59e0b] text-[11px] font-800">
                            <span className="w-2 h-2 bg-[#f59e0b] rounded-full" />
                            Unallocated funds
                        </div>
                    )}
                    {firm.failedJobs === 0 && Number(firm.remaining) <= (firm.totalIncoming * 0.01) && (
                        <div className="flex items-center gap-1.5 text-[#10b981] text-[11px] font-800 opacity-60">
                            <CheckIcon className="w-3 h-3" />
                            No action required
                        </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col">
                    <span className="font-display font-800 text-[14px] text-text-2">${fmt(firm.totalIncoming)}</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="w-24 h-1 bg-surface-3 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${firm.remaining > (firm.totalIncoming * 0.1) ? 'bg-[#f59e0b]' : 'bg-[#10b981]'}`}
                          style={{ width: `${Math.min(100, (firm.totalAllocated / (firm.totalIncoming || 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-text-3 font-bold uppercase">{Math.round((firm.totalAllocated / (firm.totalIncoming || 1)) * 100)}%</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${firm.successRate < 80 ? 'bg-[#ef444410] border-[#ef444420] text-[#ef4444]' : 'bg-[#10b98110] border-[#10b98120] text-[#10b981]'}`}>
                      {firm.successRate >= 99 ? <CheckIcon className="w-4 h-4" /> : <ActivityIcon className="w-4 h-4" />}
                    </div>
                    <span className={`text-[13px] font-800 ${firm.successRate < 80 ? 'text-[#ef4444]' : 'text-text'}`}>
                      {fmt(firm.successRate)}%
                    </span>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <button 
                    onClick={() => {
                        localStorage.setItem('ps_firm_id', firm.id)
                        window.location.href = firm.health === 'CRITICAL' || firm.failedJobs > 0 ? '/dashboard?tab=reconciliation' : '/dashboard?tab=ledger'
                    }}
                    className={`flex items-center gap-2 p-[6px_14px] rounded-xl border transition-all text-[11px] font-800 ${
                        firm.health === 'CRITICAL' || firm.failedJobs > 0 
                        ? 'bg-[#ef444410] border-[#ef444420] text-[#ef4444] hover:bg-[#ef444420]' 
                        : 'bg-surface-3 border-border hover:bg-accent hover:text-white'
                    }`}
                  >
                    {firm.health === 'CRITICAL' || firm.failedJobs > 0 ? 'Fix Traffic Issue' : 'View Traffic'}
                    <Chevron className="w-3 h-3 rotate-[-90deg]" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HealthBadge({ status, percentage }: { status: 'HEALTHY' | 'ATTENTION' | 'CRITICAL', percentage: number }) {
  const config = {
    HEALTHY: { label: 'Healthy', color: 'bg-[#10b98115] text-[#10b981] border-[#10b98125]' },
    ATTENTION: { label: 'Attention', color: 'bg-[#f59e0b15] text-[#f59e0b] border-[#f59e0b25]' },
    CRITICAL: { label: 'Critical', color: 'bg-[#ef444415] text-[#ef4444] border-[#ef444425]' }
  }

  return (
    <div className={`px-3 py-1 rounded-full border text-[10px] font-800 uppercase tracking-widest inline-flex items-center gap-1.5 ${config[status].color}`}>
      {config[status].label}
      <span className="opacity-50">({Math.round(percentage)}%)</span>
    </div>
  )
}
