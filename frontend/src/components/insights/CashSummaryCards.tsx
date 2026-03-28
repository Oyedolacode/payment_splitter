import { DollarIcon, ActivityIcon, ZapIcon } from '../common/Icons'
import { fmt } from '../../lib/formatters'

interface SummaryStats {
  totalIncoming: number
  totalAllocated: number
  totalRemaining: number
  healthyCount: number
  attentionCount: number
  criticalCount: number
}

export function CashSummaryCards({ stats }: { stats: SummaryStats }) {
  if (!stats) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Incoming Card */}
      <div className="bg-surface/60 backdrop-blur-xl border border-border p-6 rounded-[32px] hover:border-accent/30 transition-all group">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 bg-accent/10 rounded-2xl flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
            <DollarIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold text-text-3 uppercase tracking-widest bg-surface-2 px-3 py-1 rounded-full border border-border">Total Processed</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[28px] font-display font-800 text-text leading-tight tracking-tight">
            ${fmt(stats.totalIncoming)}
          </span>
          <p className="text-[12px] text-text-3 font-medium mt-1">Total revenue processed across all entities</p>
        </div>
      </div>

      {/* Allocated Card */}
      <div className="bg-surface/60 backdrop-blur-xl border border-border p-6 rounded-[32px] hover:border-[#10b98130] transition-all group">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 bg-[#10b98110] rounded-2xl flex items-center justify-center text-[#10b981] group-hover:scale-110 transition-transform">
            <ZapIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold text-[#10b981] uppercase tracking-widest bg-[#10b98108] px-3 py-1 rounded-full border border-[#10b98120]">Synced to Ledger</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[28px] font-display font-800 text-text leading-tight tracking-tight">
            ${fmt(stats.totalAllocated)}
          </span>
          <p className="text-[12px] text-text-3 font-medium mt-1">Successfully synchronized to QuickBooks sub-ledgers</p>
        </div>
      </div>

      {/* Remaining Card */}
      <div className="bg-surface/60 backdrop-blur-xl border border-border p-6 rounded-[32px] hover:border-[#f59e0b30] transition-all group">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 bg-[#f59e0b10] rounded-2xl flex items-center justify-center text-[#f59e0b] group-hover:scale-110 transition-transform">
            <ActivityIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold text-[#f59e0b] uppercase tracking-widest bg-[#f59e0b08] px-3 py-1 rounded-full border border-[#f59e0b20]">Pending Allocation</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[28px] font-display font-800 text-text leading-tight tracking-tight">
            ${fmt(stats.totalRemaining)}
          </span>
          <p className="text-[12px] text-text-3 font-medium mt-1">Funds currently staged in payment pool</p>
        </div>
      </div>
    </div>
  )
}
