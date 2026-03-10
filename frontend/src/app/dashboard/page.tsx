'use client'

import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import { ThemeToggle } from '../../components/ThemeToggle'
import { useRouter } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────
type RuleType = 'proportional' | 'oldest_first' | 'location_priority'

interface Rule {
  id: string
  parentCustomerId: string
  ruleType: RuleType
  ruleConfig: any
  isActive: boolean
  isLocked: boolean
  lockedReason?: string
  createdAt: string
}

type Tab = 'reconciliation' | 'rules' | 'settings' | 'audit' | 'remittance' | 'ap' | 'trust'

type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'ROLLED_BACK' | 'REVIEW_REQUIRED' | 'ANOMALY_PAUSED'

interface AuditEntry {
  id: string
  subLocationId: string
  invoiceId: string
  amountApplied: string
  qboPaymentId?: string
}

interface ActivityLog {
  id: string
  firmId: string
  type: string
  details: any
  jobId?: string
  actorType: 'SYSTEM' | 'USER' | 'WEBHOOK'
  severity: 'INFO' | 'WARNING' | 'ERROR'
  createdAt: string
}

interface PaymentJob {
  id: string
  paymentId: string
  status: JobStatus
  totalAmount: string
  createdAt: string
  completedAt?: string
  errorMessage?: string
  auditEntries: AuditEntry[]
  rule?: { ruleType: string; parentCustomerId: string }
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

// ── Constants ─────────────────────────────────────────────────────────────────

// FIRM_ID is now handled dynamically in the component
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const STATUS_META: Record<JobStatus, { label: string; color: string }> = {
  COMPLETE: { label: 'Complete', color: '#10b981' },
  FAILED: { label: 'Failed', color: '#ef4444' },
  ROLLED_BACK: { label: 'Rolled Back', color: '#6366f1' },
  PROCESSING: { label: 'Processing', color: '#f59e0b' },
  QUEUED: { label: 'Queued', color: '#2d31fa' },
  REVIEW_REQUIRED: { label: 'Manual Review', color: '#ec4899' }, // Pink for attention
  ANOMALY_PAUSED: { label: 'Anomaly Detected', color: '#f97316' }, // Orange for warning
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: string | number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Logo icon ─────────────────────────────────────────────────────────────────

function LogoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" rx="3" fill="#2d31fa" />
      <rect x="12" y="1" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".2" />
      <rect x="1" y="12" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".2" />
      <rect x="12" y="12" width="9" height="9" rx="3" fill="#10b981" />
    </svg>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JobStatus }) {
  const { label, color } = STATUS_META[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 p-[3px_10px] rounded-[6px] font-bold text-[11px] border border-transparent"
      style={{ color, borderColor: `${color}28`, background: `${color}10` }}
      aria-label={`Status: ${label}`}
      role="status"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === 'PROCESSING' ? 'animate-pulseDot' : ''}`}
        style={{ background: color }}
      />
      {label}
    </span>
  )
}

function Toast({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  }

  const borderColors = {
    success: 'border-l-[#10b981]',
    error: 'border-l-[#ef4444]',
    info: 'border-l-[#2d31fa]'
  }

  const iconColors = {
    success: 'text-[#10b981]',
    error: 'text-[#ef4444]',
    info: 'text-[#2d31fa]'
  }

  return (
    <div
      className={`flex items-center gap-3 p-[12px_20px] bg-surface border border-border border-l-4 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.15)] animate-slideIn min-w-[280px] max-w-[400px] cursor-pointer ${borderColors[toast.type]}`}
      onClick={onClose}
    >
      <div className={`text-[16px] font-800 ${iconColors[toast.type]}`}>{icons[toast.type]}</div>
      <div className="text-[13px] font-600 text-text leading-[1.4]">{toast.message}</div>
    </div>
  )
}

// ── Chevron icon ──────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function PricingModal({
  onClose,
  onUpgrade,
  currentPlan
}: {
  onClose: () => void
  onUpgrade: (plan: string) => void
  currentPlan: string
}) {
  return (
    <div className="fixed inset-0 z-[9999] bg-[rgba(0,0,0,0.7)] backdrop-blur-[8px] flex items-center justify-center p-5 animate-fadeIn" onClick={onClose}>
      <div className="bg-surface border border-border-strong rounded-[20px] w-full max-w-[500px] p-8 relative shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-slideUp max-[768px]:w-[95%] max-[768px]:p-5 max-[768px]:max-h-[90vh] max-[768px]:overflow-y-auto" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pricing-modal-title">
        <div className="flex justify-between items-center mb-6 pt-8 px-8 pb-0 max-[768px]:px-0">
          <h2 className="font-display text-[20px] font-800 text-text tracking-[-0.5px]" id="pricing-modal-title">Upgrade Your Splitter</h2>
          <button className="bg-none border-none text-text-3 text-[20px] cursor-pointer p-1 transition-colors hover:text-text" onClick={onClose} aria-label="Close modal">✕</button>
        </div>
        <div className="flex flex-col gap-4 mt-6">
          <div className="bg-surface border border-border rounded-[18px] p-[32px_24px] display-flex flex-col transition-all duration-300 relative shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:translate-y-[-4px] hover:border-accent hover:shadow-[0_12px_30px_rgba(0,0,0,0.06)]">
            <div className="font-display text-[14px] font-700 text-text-3 mb-4 uppercase tracking-[1px]">Standard</div>
            <div className="font-display text-[40px] font-800 text-text mb-6">$149<span className="text-[16px] text-text-3 font-500">/mo</span></div>
            <div className="text-[14px] text-text-2 mb-8">Up to 3 rules</div>
            <button
              className="mt-auto p-3 rounded-[10px] border border-border-strong bg-surface-2 text-text text-[13px] font-700 cursor-pointer transition-all duration-200 hover:bg-surface-3 hover:border-text-3 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => onUpgrade('standard')}
              disabled={currentPlan === 'STANDARD'}
            >
              {currentPlan === 'STANDARD' ? 'Current Plan' : 'Select Standard'}
            </button>
          </div>

          <div className="bg-surface border border-accent rounded-[18px] p-[32px_24px] display-flex flex-col transition-all duration-300 relative scale-[1.05] shadow-[0_8px_24px_var(--accent-glow)] hover:translate-y-[-4px] hover:scale-[1.05]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-[10px] font-800 p-[4px_12px] rounded-[20px] tracking-[0.8px]">RECOMMENDED</div>
            <div className="font-display text-[14px] font-700 text-text-3 mb-4 uppercase tracking-[1px]">Professional</div>
            <div className="font-display text-[40px] font-800 text-text mb-6">$349<span className="text-[16px] text-text-3 font-500">/mo</span></div>
            <div className="text-[14px] text-text-2 mb-8">Unlimited rules & Waterfall</div>
            <button
              className="mt-auto p-3 rounded-[10px] border border-border-strong bg-surface-2 text-text text-[13px] font-700 cursor-pointer transition-all duration-200 hover:bg-surface-3 hover:border-text-3 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => onUpgrade('professional')}
              disabled={currentPlan === 'PROFESSIONAL'}
            >
            <div className={styles.planName}>Practice</div>
            <div className={styles.planPrice}>$799<span>/mo</span></div>
            <div className={styles.planFeature}>Practice-wide automation & Location Priority</div>
            <button
              className={styles.planBtn}
              onClick={() => onUpgrade('practice')}
              disabled={currentPlan === 'PRACTICE'}
            >
              {currentPlan === 'PRACTICE' ? 'Current Plan' : 'Go Practice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RuleBuilderModal({
  customers,
  locations,
  onClose,
  onSave,
  loading,
  plan,
  firmId,
  editingRule,
  addToast,
  setShowPricingModal
}: {
  customers: any[],
  locations: any[],
  onClose: () => void,
  onSave: (rule: any) => void,
  loading: boolean,
  plan: string,
  firmId: string,
  editingRule: Rule | null,
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  setShowPricingModal: (show: boolean) => void
}) {
  const allowedStrategiesByPlan: Record<string, RuleType[]> = {
    TRIAL: ['proportional'],
    STANDARD: ['proportional'],
    PROFESSIONAL: ['proportional', 'oldest_first'],
    PRACTICE: ['proportional', 'oldest_first', 'location_priority'],
  }

  const currentPlan = plan.toUpperCase()
  const allowed = allowedStrategiesByPlan[currentPlan] || ['proportional']

  const [parentCustomerId, setParentCustomerId] = useState(editingRule?.parentCustomerId || '')
  const [ruleType, setRuleType] = useState<RuleType>(editingRule?.ruleType || 'proportional')
  const [weights, setWeights] = useState<Record<string, number>>(editingRule?.ruleConfig?.weights || {})
  const [order, setOrder] = useState<string[]>(
    editingRule?.ruleType === 'location_priority'
      ? editingRule.ruleConfig.order
      : (editingRule?.ruleConfig?.locationIds || locations.map(l => String(l.Id)))
  )
  const [saving, setSaving] = useState(false)

  // Downgrade check: is the current rule's type locked?
  const isRuleTypeLocked = editingRule && !allowed.includes(editingRule.ruleType)

  useEffect(() => {
    if (editingRule) {
      setParentCustomerId(editingRule.parentCustomerId)
      setRuleType(editingRule.ruleType)
      if (editingRule.ruleType === 'proportional') {
        setWeights(editingRule.ruleConfig.weights || {})
      } else {
        setOrder(editingRule.ruleConfig.locationIds || locations.map(l => String(l.Id)))
      }
    }
  }, [editingRule, locations])

  const moveOrder = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...order]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newOrder.length) return
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]]
    setOrder(newOrder)
  }

  const handleWeightChange = (locId: string, val: string) => {
    setWeights(prev => ({ ...prev, [locId]: Number(val) }))
  }

  const handleSave = async () => {
    if (!parentCustomerId) return addToast('Select a parent customer', 'error')

    const ruleConfig: any = { type: ruleType }
    if (ruleType === 'proportional') {
      const total = Object.values(weights).reduce((s, w) => s + w, 0)
      if (Math.abs(total - 100) > 0.01) return addToast(`Weights must sum to 100% (currently ${total}%)`, 'error')
      ruleConfig.weights = weights
    } else if (ruleType === 'oldest_first') {
      ruleConfig.locationIds = order
    } else if (ruleType === 'location_priority') {
      ruleConfig.order = order
    }

    setSaving(true)
    try {
      const method = editingRule ? 'PATCH' : 'POST'
      const url = editingRule ? `${API}/api/rules/${editingRule.id}` : `${API}/api/rules`

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId, parentCustomerId, ruleConfig })
      })

      const data = await res.json()
      if (!res.ok) {
        addToast(data.error || `Failed to ${editingRule ? 'update' : 'create'} rule`, 'error')
        return
      }

      addToast(`Rule ${editingRule ? 'updated' : 'created'} successfully!`, 'success')
      onSave(data) // Refetch rules in parent
      onClose()
    } catch (e) {
      console.error(e)
      addToast('An unexpected error occurred', 'error')
    } finally {
      setSaving(false)
    }
  }

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0)
  const isEmpty = customers.length === 0 || locations.length === 0

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fadeIn p-4" onClick={onClose}>
      <div className="bg-surface border border-border w-full max-w-[540px] rounded-[24px] shadow-[0_24px_64px_rgba(0,0,0,0.2)] animate-slideUp overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="rule-modal-title">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-display text-[18px] font-800 text-text tracking-tight" id="rule-modal-title">{editingRule ? 'Edit Split Rule' : 'New Split Rule'}</h2>
          <button className="bg-none border-none text-text-3 cursor-pointer p-1 transition-colors hover:text-text flex items-center justify-center" onClick={onClose} aria-label="Close modal">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col gap-4">
              <div className="h-10 rounded-lg bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%] animate-shimmer" />
              <div className="h-10 rounded-lg bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%] animate-shimmer" />
              <div className="h-[120px] rounded-lg bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%] animate-shimmer" />
            </div>
          ) : isEmpty ? (
            <div className="p-12 text-center" role="status">
              <div className="text-[40px] mb-4">📭</div>
              <div className="font-display text-[15px] font-800 text-text mb-[7px]">No QBO Data Available</div>
              <div className="text-[13px] text-text-3 max-w-[360px] mx-auto leading-[1.6]">
                We couldn't find any customers or locations in your QuickBooks account.
                Please ensure you have sub-customers created to split payments across.
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6 last:mb-0">
                <label className="block text-[12px] font-700 text-text-3 uppercase tracking-[0.5px] mb-2">Parent Customer (where payments arrive)</label>
                <select
                  className="w-full bg-surface-2 border border-border text-text rounded-[12px] p-[10px_14px] text-[14px] outline-none transition-all focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)] appearance-none"
                  value={parentCustomerId}
                  onChange={e => setParentCustomerId(e.target.value)}
                >
                  <option value="">Select a customer...</option>
                  {customers.map(c => (
                    <option key={c.Id} value={c.Id}>{c.DisplayName}</option>
                  ))}
                </select>
              </div>

              <div className="mb-6 last:mb-0">
                <label className="block text-[12px] font-700 text-text-3 uppercase tracking-[0.5px] mb-2">Allocation Strategy</label>
                <div className="flex flex-wrap gap-2 bg-surface-2 p-1.5 rounded-[12px] border border-border w-fit">
                  {[
                    { id: 'proportional', label: 'Proportional (%)' },
                    { id: 'oldest_first', label: 'Oldest First (Waterfall)' },
                    { id: 'location_priority', label: 'Location Priority' }
                  ].map((strat) => {
                    const isLocked = !allowed.includes(strat.id as RuleType)
                    const isActive = ruleType === strat.id

                    return (
                      <button
                        key={strat.id}
                        className={`text-[11.5px] font-700 p-[6px_14px] rounded-[8px] border border-transparent transition-all cursor-pointer ${isActive ? 'bg-surface border-border shadow-sm text-accent' : 'text-text-3 hover:text-text'} ${isLocked ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                        onClick={() => {
                          if (isLocked) {
                            addToast(`${strat.label} is locked on the ${currentPlan} plan.`, 'info')
                            setShowPricingModal(true)
                          } else {
                            setRuleType(strat.id as RuleType)
                          }
                        }}
                        disabled={isRuleTypeLocked && !isActive} // Prevent changing type if existing rule is locked
                      >
                        {strat.label} {isLocked && '🔒'}
                      </button>
                    )
                  })}
                </div>
                {!allowed.includes(ruleType) && (
                  <div className="mt-3 text-[11px] text-text-3 italic">
                    {currentPlan} plan does not support this strategy. <span className="text-accent cursor-pointer hover:underline font-bold" onClick={() => { onClose(); setShowPricingModal(true); }}>Upgrade to {ruleType === 'location_priority' ? 'Practice' : 'Professional'}</span> to edit or create new {ruleType.replace('_', ' ')} rules.
                  </div>
                )}
                {isRuleTypeLocked && (
                  <div className="mt-3 text-[12px] bg-red/10 border border-red/20 text-red p-3 rounded-lg flex gap-2">
                    <span>⚠️</span>
                    <span>This rule is currently <strong>locked</strong> due to a plan change. You can toggle it on/off, but cannot modify its configuration or strategy.</span>
                  </div>
                )}
              </div>

              {ruleType === 'proportional' && (
                <div className="mt-6 grid grid-cols-1 gap-3">
                  <label className="block text-[12px] font-700 text-text-3 uppercase tracking-[0.5px] mb-2">Location Weights (Must sum to 100%)</label>
                  {locations.map(loc => (
                    <div key={loc.Id} className="flex items-center justify-between p-4 bg-surface-2 border border-border rounded-[16px] transition-all hover:border-text-3/40">
                      <span className="font-bold text-[13px] text-text">{loc.Name}</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          className="w-[64px] bg-surface border border-border text-center font-bold text-text text-[14px] p-2 rounded-[8px] outline-none focus:border-accent"
                          placeholder="0"
                          value={weights[loc.Id] || ''}
                          onChange={e => handleWeightChange(loc.Id, e.target.value)}
                        />
                        <span className="text-[12px] font-800 text-text-3">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}


              {(ruleType === 'oldest_first' || ruleType === 'location_priority') && (
                <div className={`transition-opacity ${isRuleTypeLocked ? 'opacity-60 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
                  <label className="block text-[12px] font-700 text-text-3 uppercase tracking-[0.5px] mb-2">
                    {ruleType === 'oldest_first' ? 'Settlement Priority (Waterfall Order)' : 'Location Priority Order'}
                  </label>
                  <p className="text-[12px] text-text-3 mb-3 leading-relaxed">
                    {ruleType === 'oldest_first'
                      ? 'Payments will fully cover the oldest invoices at Location 1 first, then Location 2, etc.'
                      : 'Each location listed will be fully cleared of all open invoices before any funds are applied to the next location.'}
                  </p>
                  <div className="flex flex-col gap-2 mt-4">
                    {order.map((locId, idx) => {
                      const loc = locations.find(l => String(l.Id) === String(locId))
                      return (
                        <div key={locId} className="flex items-center gap-4 p-4 bg-surface-2 border border-border rounded-[16px] transition-all hover:border-text-3/40">
                          <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/20 text-accent text-[11.5px] font-800 flex items-center justify-center flex-shrink-0">{idx + 1}</div>
                          <div className="flex-1 font-bold text-[13px] text-text">{loc?.Name || `Location ${locId}`}</div>
                          {!isRuleTypeLocked && (
                            <div className="flex gap-1">
                              <button
                                className="bg-surface border border-border-strong text-text-2 rounded p-1 text-[10px] font-bold cursor-pointer transition-all hover:bg-surface-2 hover:text-text disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => moveOrder(idx, 'up')}
                                disabled={idx === 0}
                              >
                                ↑
                              </button>
                              <button
                                className="bg-surface border border-border-strong text-text-2 rounded p-1 text-[10px] font-bold cursor-pointer transition-all hover:bg-surface-2 hover:text-text disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => moveOrder(idx, 'down')}
                                disabled={idx === order.length - 1}
                              >
                                ↓
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 p-6 mt-8 border-t border-border -mx-8 -mb-8 bg-surface-2/50">
                <button 
                  className="text-[11px] font-700 text-text bg-surface border border-border p-[7px_14px] rounded-[8px] cursor-pointer hover:bg-surface-3 transition-colors flex items-center gap-1" 
                  onClick={onClose} 
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="text-[11px] font-700 text-white bg-accent border border-accent p-[7px_14px] rounded-[8px] cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-1"
                  onClick={handleSave}
                  disabled={saving || loading || isEmpty || isRuleTypeLocked || (ruleType === 'proportional' && Math.abs(totalWeight - 100) > 0.01)}
                >
                  {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('reconciliation')
  const [firmId, setFirmId] = useState<string>('')
  const [jobs, setJobs] = useState<PaymentJob[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [firm, setFirm] = useState<any>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('ps_checklist_dismissed') === '1'
  })
  const [connected, setConnected] = useState(false)
  const [loadingQBO, setLoadingQBO] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => removeToast(id), 5000)
  }, [removeToast])

  const fetchJobs = useCallback(async (id: string) => {
    if (!id) return
    try {
      const res = await fetch(`${API}/api/jobs?firmId=${id}`)
      if (!res.ok) {
        const data = await res.json()
        addToast(`Failed to fetch jobs: ${data.details || data.error || res.statusText}`, 'error')
        return
      }
      const data = await res.json()
      setJobs(Array.isArray(data) ? data : [])
    } catch (e: any) {
      console.error('Failed to fetch jobs:', e)
      addToast(`Jobs Fetch Error: ${e.message || 'Unknown network error'}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const fetchRules = useCallback(async (id: string) => {
    if (!id) return
    try {
      const res = await fetch(`${API}/api/rules?firmId=${id}`)
      const data = await res.json()
      setRules(data)
    } catch (e) {
      console.error('Failed to fetch rules:', e)
      addToast('Failed to fetch rules', 'error')
    }
  }, [addToast])

  const fetchActivity = useCallback(async (id: string) => {
    if (!id) return
    try {
      const res = await fetch(`${API}/api/jobs/activity?firmId=${id}`)
      const data = await res.json()
      setActivity(data)
    } catch (e) {
      console.error('Failed to fetch activity:', e)
    }
  }, [])

  const fetchFirm = useCallback(async (id: string) => {
    if (!id) return
    try {
      const res = await fetch(`${API}/auth/firms/${id}/status`)
      const data = await res.json()
      setFirm(data)
    } catch (e) {
      console.error('Failed to fetch firm status:', e)
      addToast('Failed to fetch firm status', 'error')
    }
  }, [addToast])

  const fetchQBOData = useCallback(async (id: string) => {
    if (!id) return
    setLoadingQBO(true)
    try {
      const [cRes, lRes] = await Promise.all([
        fetch(`${API}/api/qbo/customers?firmId=${id}`),
        fetch(`${API}/api/qbo/locations?firmId=${id}`)
      ])
      if (cRes.ok) {
        setCustomers(await cRes.json())
      } else {
        const errData = await cRes.json().catch(() => ({}))
        addToast(`QBO Customers: ${errData.details || errData.error || cRes.statusText}`, 'error')
      }

      if (lRes.ok) {
        setLocations(await lRes.json())
      } else {
        const errData = await lRes.json().catch(() => ({}))
        addToast(`QBO Locations: ${errData.details || errData.error || lRes.statusText}`, 'error')
      }
    } catch (e: any) {
      console.error('Failed to fetch QBO data:', e)
      addToast(`QBO Data Error: ${e.message || 'Unknown network error'}`, 'error')
    } finally {
      setLoadingQBO(false)
    }
  }, [addToast])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    let activeId = params.get('id')

    // Resolve Firm ID: URL -> LocalStorage
    if (activeId) {
      localStorage.setItem('ps_firm_id', activeId)
    } else {
      activeId = localStorage.getItem('ps_firm_id')
    }

    if (!activeId) {
      // No ID found, redirect back to landing
      router.push('/')
      return
    }

    setFirmId(activeId)
    if (params.get('connected') === 'true') {
      setConnected(true)
      // Clean up URL params
      router.replace('/dashboard')
    }

    fetchJobs(activeId)
    fetchRules(activeId)
    fetchFirm(activeId)
    fetchQBOData(activeId)

    // If we just returned from Stripe, poll the firm status specifically
    let pollFirm: NodeJS.Timeout | null = null
    if (params.get('session_id')) {
      pollFirm = setInterval(() => {
        fetchFirm(activeId!)
      }, 2000)
    }

    const interval = setInterval(() => {
      fetchJobs(activeId!)
    }, 5000)

    return () => {
      clearInterval(interval)
      if (pollFirm) clearInterval(pollFirm)
    }
  }, [fetchJobs, fetchRules, fetchFirm, fetchQBOData])

  const retryJob = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setRetrying(id)
    try {
      const resp = await fetch(`${API}/api/jobs/${id}/retry`, { method: 'POST' })
      if (!resp.ok) throw new Error('Retry failed')
      addToast('Job re-queued for processing', 'success')
      fetchJobs(firmId)
    } catch (err: any) {
      addToast(err.message, 'error')
    } finally {
      setRetrying(null)
    }
  }

  const approveJob = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setRetrying(id) // Reuse retrying state for loading indicator
    try {
      const resp = await fetch(`${API}/api/jobs/${id}/approve`, { method: 'POST' })
      if (!resp.ok) throw new Error('Approval failed')
      addToast('Job approved and moved to processing', 'success')
      fetchJobs(firmId)
    } catch (err: any) {
      addToast(err.message, 'error')
    } finally {
      setRetrying(null)
    }
  }

  const updateAllocationMode = async (mode: 'AUTO' | 'REVIEW') => {
    try {
      const resp = await fetch(`${API}/api/stripe/firm/${firmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocationMode: mode }),
      })
      if (!resp.ok) throw new Error('Failed to update settings')
      addToast(`Allocation mode set to ${mode}`, 'success')
      setFirm(prev => prev ? { ...prev, allocationMode: mode } : prev)
    } catch (err: any) {
      addToast(err.message, 'error')
    }
  }

  function toggleRow(jobId: string) {
    setSelected(prev => prev === jobId ? null : jobId)
  }

  // Focus trap for modals would usually go here using a hook or Ref
  const modalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (showRuleModal || showPricingModal || showLogoutModal || showDeleteModal) {
      modalRef.current?.focus()
    }
  }, [showRuleModal, showPricingModal, showLogoutModal, showDeleteModal])

  async function toggleRule(ruleId: string, isActive: boolean) {
    try {
      const res = await fetch(`${API}/api/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      })
      const data = await res.json()
      if (!res.ok) {
        addToast(data.error || 'Failed to update rule', 'error')
        return
      }

      addToast(`Rule ${isActive ? 'enabled' : 'disabled'} successfully`, 'success')
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive } : r))
    } catch (e) {
      console.error('Failed to toggle rule:', e)
      addToast('An unexpected error occurred while toggling the rule', 'error')
    }
  }

  const deleteRule = async (id: string) => {
    setDeletingRuleId(id)
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (!deletingRuleId) return
    try {
      const res = await fetch(`${API}/api/rules/${deletingRuleId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (!res.ok) {
        addToast(data.error || 'Failed to delete rule', 'error')
      } else {
        setRules(prev => prev.filter(r => r.id !== deletingRuleId))
        addToast('Rule deleted successfully', 'success')
      }
    } catch (e) {
      console.error('Failed to delete rule:', e)
      addToast('An unexpected error occurred while deleting the rule', 'error')
    } finally {
      setShowDeleteModal(false)
      setDeletingRuleId(null)
    }
  }

  async function createRule(rule: any) {
    try {
      const res = await fetch(`${API}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
      })
      if (!res.ok) {
        const err = await res.json()
        addToast(err.error || 'Failed to create rule', 'error')
        return
      }
      await fetchRules(firmId)
      addToast('Rule created successfully!', 'success')
    } catch (e) {
      console.error('Failed to create rule:', e)
      addToast(e instanceof Error ? e.message : 'Failed to create rule', 'error')
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const complete = jobs.filter(j => j.status === 'COMPLETE')
  const failed = jobs.filter(j => j.status === 'FAILED' || j.status === 'ROLLED_BACK')
  const totalProcessed = complete.reduce((s, j) => s + Number(j.totalAmount), 0)
  const totalSplits = complete.reduce((s, j) => s + j.auditEntries.length, 0)
  const successRate = jobs.length ? Math.round((complete.length / jobs.length) * 100) : null
  
  if (loading) {
    return (
      <div className={styles.main} aria-busy="true" aria-live="polite">
        <div className="flex flex-col gap-8">
          <div className="h-12 w-1/3 bg-surface-2 animate-shimmer rounded-lg" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-surface-2 animate-shimmer rounded-xl" />
            ))}
          </div>
          <div className="h-96 bg-surface-2 animate-shimmer rounded-2xl" />
        </div>
      </div>
    )
  }

  const isTrialExpired = firm?.trialEndsAt ? new Date(firm.trialEndsAt) < new Date() : false
  const hasAccess = firm?.isSubscribed || !isTrialExpired

  // Month-over-month comparison
  const now = new Date()
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const thisMonthJobs = complete.filter(j => new Date(j.createdAt) >= startOfThisMonth)
  const lastMonthJobs = complete.filter(j => {
    const d = new Date(j.createdAt)
    return d >= startOfLastMonth && d < startOfThisMonth
  })
  const thisMonthTotal = thisMonthJobs.reduce((s, j) => s + Number(j.totalAmount), 0)
  const lastMonthTotal = lastMonthJobs.reduce((s, j) => s + Number(j.totalAmount), 0)
  const momDelta = lastMonthTotal > 0
    ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100)
    : null

  function dismissChecklist() {
    localStorage.setItem('ps_checklist_dismissed', '1')
    setChecklistDismissed(true)
  }

  async function handleUpgrade(tier: string) {
    try {
      const res = await fetch(`${API}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId, tier })
      })
      const data = await res.json()
      if (!res.ok) {
        addToast(data.message || data.error || 'Failed to start checkout', 'error')
        return
      }
      const checkoutUrl = data.url
      if (checkoutUrl) {
        window.location.href = checkoutUrl
      } else {
        addToast('Checkout session failed to initialize', 'error')
      }
    } catch (e: any) {
      console.error('Failed to start checkout:', e)
      addToast(e.message || 'Failed to start checkout', 'error')
    }
  }

  function handleLogout() {
    localStorage.removeItem('ps_firm_id')
    window.location.href = '/'
  }

  function confirmLogout() {
    setShowLogoutModal(true)
  }

  return (
    <div className={styles.root}>
      <div className={styles.gridBg} aria-hidden="true" />
      <div className={styles.glowPurple} aria-hidden="true" />
      <div className={styles.glowGreen} aria-hidden="true" />

      <div ref={modalRef} tabIndex={-1} className="outline-none">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-[50] w-full bg-surface/80 backdrop-blur-md border-b border-border transition-all duration-300" role="banner">
          <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 font-display font-800 text-[18px] text-text cursor-pointer" onClick={() => router.push('/')} aria-label="PaySplit dashboard">
                <LogoIcon />
                PaySplit
              </div>

              <nav className="hidden md:flex items-center gap-1">
                {[
                  { id: 'reconciliation', label: 'Reconciliation' },
                  { id: 'rules', label: 'Routing Rules' },
                  { id: 'audit', label: 'Audit Feed', gated: true },
                  { id: 'remittance', label: 'CSV Remittance', gated: true },
                  { id: 'ap', label: 'AP Bills', gated: true },
                  { id: 'trust', label: 'Trust', gated: true },
                  { id: 'settings', label: 'Settings' }
                ].map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`px-4 py-2 rounded-lg text-[13px] font-700 transition-all flex items-center gap-2 ${tab === t.id ? 'bg-surface-2 text-accent shadow-sm' : 'text-text-3 hover:text-text hover:bg-surface-2'}`}
                    onClick={() => {
                      if (t.gated) {
                        addToast(`${t.label} is available on Professional and Practice plans.`, 'info')
                        setShowPricingModal(true)
                      } else {
                        setTab(t.id as Tab)
                        if (t.id === 'rules') fetchRules(firmId)
                        if (t.id === 'audit') fetchActivity(firmId)
                      }
                    }}
                  >
                    {t.label}
                    {t.gated && <span className="flex items-center gap-1 bg-accent/10 text-accent text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wider font-900 border border-accent/20">Pro 🔒</span>}
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <div className="text-[12px] font-800 text-text max-w-[120px] truncate">{firm?.name || 'My Firm'}</div>
                {firm?.qboRealmId ? (
                  <div className="flex items-center gap-1.5 text-[10px] font-900 text-accent-2 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-2 animate-pulse" />
                    QBO Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10px] font-900 text-text-3 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-border" />
                    QBO Disconnected
                  </div>
                )}
              </div>
              <ThemeToggle />
              <button
                className="w-10 h-10 rounded-xl bg-surface-2 border border-border text-text-3 hover:text-text hover:border-text-3/30 transition-all flex items-center justify-center"
                onClick={confirmLogout}
                aria-label="Log out"
                title="Log out"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
              <button
                className="md:hidden w-10 h-10 rounded-xl bg-surface-2 border border-border text-text transition-all flex items-center justify-center p-0"
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                aria-label="Toggle menu"
              >
                {showMobileMenu ? '✕' : '☰'}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {showMobileMenu && (
            <div className="md:hidden border-t border-border bg-surface w-full animate-fadeIn overflow-hidden pb-4">
              <nav className="flex flex-col p-4 gap-1">
                {[
                  { id: 'reconciliation', label: 'Reconciliation' },
                  { id: 'rules', label: 'Routing Rules' },
                  { id: 'audit', label: 'Audit Feed', gated: true },
                  { id: 'remittance', label: 'CSV Remittance', gated: true },
                  { id: 'ap', label: 'AP Bills', gated: true },
                  { id: 'trust', label: 'Trust', gated: true },
                  { id: 'settings', label: 'Settings' }
                ].map((t) => (
                  <button
                    key={t.id}
                    className={`w-full text-left px-4 py-3 rounded-xl text-[14px] font-700 transition-all flex items-center justify-between ${tab === t.id ? 'bg-surface-2 text-accent' : 'text-text-3'}`}
                    onClick={() => {
                      if (t.gated) {
                        addToast(`${t.label} is available on Professional and Practice plans.`, 'info')
                        setShowPricingModal(true)
                      } else {
                        setTab(t.id as Tab)
                        setShowMobileMenu(false)
                      }
                    }}
                  >
                    {t.label}
                    {t.gated && <span className="bg-accent/10 text-accent text-[9px] px-2 py-0.5 rounded-full border border-accent/20">Pro 🔒</span>}
                  </button>
                ))}
              </nav>
            </div>
          )}
        </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className={styles.main}>


        {/* Connected toast */}
        {connected && tab === 'reconciliation' && (
          <div className={styles.toast} role="status">
            <span className={styles.toastIcon}>✓</span>
            QuickBooks Online connected — payment monitoring is now active.
          </div>
        )}

        {/* Page titles */}
        <div className={styles.titleRow}>
          {tab === 'reconciliation' && (
            <div>
              <h1 className={styles.title}>Reconciliation History</h1>
              <p className={styles.subtitle}>Automated payment splits across all branch locations</p>
            </div>
          )}
          {tab === 'rules' && (
            <div>
              <h1 className={styles.title}>Split Rules</h1>
              <p className={styles.subtitle}>Define how incoming payments should be distributed</p>
            </div>
          )}
          {tab === 'audit' && (
            <div>
              <h1 className={styles.title}>Audit Feed</h1>
              <p className={styles.subtitle}>System and user activity logs</p>
            </div>
          )}
          {tab === 'remittance' && (
            <div>
              <h1 className={styles.title}>CSV Remittance</h1>
              <p className={styles.subtitle}>Upload bulk clearing files and remittance advice</p>
            </div>
          )}
          {tab === 'ap' && (
            <div>
              <h1 className={styles.title}>AP Bill Splitting</h1>
              <p className={styles.subtitle}>Automatically split and route Accounts Payable bills</p>
            </div>
          )}
          {tab === 'trust' && (
            <div>
              <h1 className={styles.title}>Trust Accounting</h1>
              <p className={styles.subtitle}>Manage compliance and transfers for trust ledger funds</p>
            </div>
          )}
          {tab === 'settings' && (
            <div>
              <h1 className={styles.title}>Firm Settings</h1>
              <p className={styles.subtitle}>Manage your connection and account preferences</p>
            </div>
          )}

          <div className={styles.livePill} aria-label="Live data">
            <span className={styles.liveDot} />
            Live
          </div>
        </div>

        {/* Expired Paywall Banner */}
        {!loading && !hasAccess && (
          <div className={`${styles.upgradeBanner} bg-surface-2 border border-red/30`}>
            <div className={styles.upgradeContent}>
              <span className={styles.upgradeIcon}>🚫</span>
              <div>
                <div className={`${styles.upgradeTitle} text-red`}>
                  Subscription or Trial Expired
                </div>
                <div className={styles.upgradeText}>
                  Your automated payment splitting is paused. Please subscribe to reactivate your rules and continue processing payments.
                </div>
              </div>
            </div>
            <button className={styles.primaryBtn} onClick={() => setShowPricingModal(true)}>
              Subscribe Now
            </button>
          </div>
        )}

        {/* Upgrade Banner for TRIAL/STANDARD */}
        {hasAccess && (firm?.plan === 'TRIAL' || firm?.plan === 'STANDARD') && tab === 'reconciliation' && (
          <div className={styles.upgradeBanner}>
            <div className={styles.upgradeContent}>
              <span className={styles.upgradeIcon}>💎</span>
              <div>
                <div className={styles.upgradeTitle}>
                  Upgrade to Professional
                </div>
                <div className={styles.upgradeText}>
                  Unlock unlimited rules and waterfall allocation logic.
                </div>
              </div>
            </div>
            <button className={styles.upgradeBtn} onClick={() => setShowPricingModal(true)}>
              View Plans
            </button>
          </div>
        )}

        {/* ── Tab Content ────────────────────────────────────────────────── */}

        {tab === 'reconciliation' && (
          <>
            {/* Stats */}
            <div className={styles.stats}>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Total Processed</div>
                <div className={`${styles.statValue} text-accent-2`}>${fmt(totalProcessed)}</div>
                <div className={`${styles.statSub} flex items-center gap-1.5`}>
                  <span>{complete.length} payment{complete.length !== 1 ? 's' : ''}</span>
                  {momDelta !== null && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${momDelta >= 0 ? 'bg-accent-2/10 text-accent-2' : 'bg-red/10 text-red'}`}>
                      {momDelta >= 0 ? '▲' : '▼'} {Math.abs(momDelta)}% vs last mo.
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Invoice Splits</div>
                <div className={styles.statValue}>{totalSplits}</div>
                <div className={styles.statSub}>across all jobs</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Success Rate</div>
                <div className={styles.statValue}>{successRate !== null ? `${successRate}%` : '—'}</div>
                <div className={styles.statSub}>{jobs.length} total job{jobs.length !== 1 ? 's' : ''}</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statLabel}>Needs Attention</div>
                <div
                  className={`${styles.statValue} ${failed.length > 0 ? 'text-red' : ''}`}
                >
                  {failed.length}
                </div>
                <div className={styles.statSub}>failed / rolled back</div>
              </div>
            </div>

            {/* Onboarding checklist — shown until dismissed */}
            {!loading && !checklistDismissed && jobs.length === 0 && (
              <div className={styles.checklist}>
                <div className={styles.checklistHeader}>
                  <div>
                    <div className={styles.checklistTitle}>Getting started with PaySplit</div>
                    <div className={styles.checklistSub}>Complete these steps to start splitting payments automatically</div>
                  </div>
                  <button className={styles.checklistDismiss} onClick={dismissChecklist} aria-label="Dismiss">✕</button>
                </div>
                <div className={styles.checklistItems}>
                  {[
                    { label: 'Create your account', done: true },
                    { label: 'Connect QuickBooks Online', done: !!firm?.connected },
                    { label: 'Create your first split rule', done: rules.length > 0, action: () => setTab('rules') },
                    { label: 'Receive your first payment split', done: false },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className={`${styles.checklistItem} ${item.done ? styles.checklistItemDone : ''} ${item.action && !item.done ? styles.checklistItemClickable : ''}`}
                      onClick={item.action && !item.done ? item.action : undefined}
                    >
                      <span className={styles.checklistIcon}>{item.done ? '✓' : `${i + 1}`}</span>
                      <span className={styles.checklistLabel}>{item.label}</span>
                      {item.action && !item.done && <span className={styles.checklistArrow}>→</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Jobs table */}
            <div className="bg-surface border border-border shadow-[0_8px_32px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] rounded-[18px] overflow-hidden mb-6 animate-fadeUp backdrop-blur-[10px]">
              <div className="flex items-center justify-between p-[16px_24px] border-b border-border">
                <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">Payment Jobs</span>
                <span className="text-[11.5px] text-text-2 bg-surface-2 border border-border rounded-[20px] p-[3px_11px] font-600">{jobs.length} total</span>
              </div>

              {loading ? (
                <div className="p-[16px_24px_20px] flex flex-col gap-[10px]">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-[46px] rounded-[8px] bg-[linear-gradient(90deg,var(--surface-2)_25%,var(--surface-3)_50%,var(--surface-2)_75%)] bg-[length:200%_100%] animate-shimmer" style={{ opacity: 1.1 - i * 0.3 }} />
                  ))}
                </div>
              ) : jobs.length === 0 ? (
                <div className="p-[72px_24px] text-center">
                  <span className="text-[36px] mb-[14px] block filter grayscale-[0.3]">⚡</span>
                  <div className="font-display text-[15px] font-800 text-text mb-[7px]">Waiting for payments</div>
                  <div className="text-[13px] text-text-3 max-w-[360px] mx-auto leading-[1.6]">
                    Jobs appear automatically when QBO payments are received via webhook.
                  </div>
                </div>
              ) : (
                <div className="w-full overflow-x-auto">
                  <table className="w-full border-collapse table-fixed min-w-[800px]">
                    <colgroup>
                      <col className="w-[22%]" /><col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[12%]" /><col className="w-[14%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3 whitespace-nowrap overflow-hidden">Payment ID</th>
                        <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3 whitespace-nowrap overflow-hidden">Amount</th>
                        <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3 whitespace-nowrap overflow-hidden">Status</th>
                        <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3 whitespace-nowrap overflow-hidden">Splits</th>
                        <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3 whitespace-nowrap overflow-hidden">Rule</th>
                        <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3 whitespace-nowrap overflow-hidden">When</th>
                        <th className="p-[11px_20px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job, i) => {
                        const isOpen = selected === job.id
                        return (
                          <Fragment key={job.id}>
                            <tr
                              className={`border-b border-border cursor-pointer transition-colors duration-[0.12s] animate-fadeUp hover:bg-surface-2 ${isOpen ? 'bg-accent-glow border-b-transparent' : ''}`}
                              onClick={() => toggleRow(job.id)}
                              style={{ animationDelay: `${i * 35}ms` }}
                              aria-expanded={isOpen}
                            >
                              <td className="p-[11px_20px]">
                                <span className="font-mono text-[13px]">
                                  {job.paymentId.length > 24
                                    ? job.paymentId.slice(0, 24) + '…'
                                    : job.paymentId}
                                </span>
                              </td>
                              <td className="p-[11px_20px]">
                                <span className="font-mono font-bold text-accent-2 text-[13px]">${fmt(job.totalAmount)}</span>
                              </td>
                              <td className="p-[11px_20px]">
                                <StatusBadge status={job.status} />
                              </td>
                              <td className="p-[11px_20px]">
                                <span className="text-[12px] text-text-2">
                                  {job.auditEntries.length} invoice{job.auditEntries.length !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td className="p-[11px_20px]">
                                {job.rule?.ruleType
                                  ? <span className="text-[11px] font-700 uppercase tracking-[0.5px] text-accent p-[2px_8px] bg-accent-glow rounded-[4px]">{job.rule.ruleType}</span>
                                  : <span className="font-mono text-text-3">—</span>
                                }
                              </td>
                              <td className="p-[11px_20px]">
                                <span className="text-[12px] text-text-3">{timeAgo(job.createdAt)}</span>
                              </td>
                              <td className="p-[11px_20px]">
                                <div className="flex items-center gap-3">
                                  {(job.status === 'FAILED' || job.status === 'ROLLED_BACK') && (
                                    <button
                                      className="text-[11px] font-700 text-accent border border-accent bg-transparent p-[4px_10px] rounded-[6px] cursor-pointer hover:bg-accent hover:text-white transition-all"
                                      onClick={e => retryJob(e, job.id)}
                                      disabled={retrying === job.id}
                                    >
                                      {retrying === job.id ? '···' : 'Retry'}
                                    </button>
                                  )}
                                  {job.status === 'REVIEW_REQUIRED' && (
                                    <button
                                      className="text-[11px] font-700 text-white border border-[#db2777] bg-[#ec4899] p-[4px_10px] rounded-[6px] cursor-pointer hover:opacity-90 transition-all shadow-[0_2px_8px_rgba(236,72,153,0.3)]"
                                      onClick={e => approveJob(e, job.id)}
                                      disabled={retrying === job.id}
                                    >
                                      {retrying === job.id ? '···' : 'Approve'}
                                    </button>
                                  )}
                                  <Chevron open={isOpen} />
                                </div>
                              </td>
                            </tr>

                            {/* Audit trail expansion */}
                            {isOpen && (
                              <tr key={`${job.id}-audit`} className="bg-surface-2 border-b border-border">
                                <td colSpan={7} className="p-0">
                                  <div className="p-8 animate-fadeIn border-t border-border">

                                    {job.errorMessage && (
                                      <div className="flex items-center gap-3 p-[14px_18px] mb-6 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-xl text-[#ef4444] text-[13px] font-600 animate-slideUp">
                                        <span className="text-[16px]">⚠</span>
                                        <span>{job.errorMessage}</span>
                                      </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-8 max-[1024px]:grid-cols-1">
                                      <div>
                                        <div className="flex justify-between items-center mb-4">
                                          <div className="font-display text-[14px] font-800 text-text uppercase tracking-[0.5px]">Audit Trail</div>
                                          <button className="p-[5px_10px] text-[11px] font-700 font-display text-text-3 bg-transparent border border-border rounded-[7px] cursor-pointer transition-all flex items-center gap-[5px] hover:text-text hover:border-border-strong hover:bg-surface" onClick={() => window.print()} title="Export to PDF">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                              <polyline points="7 10 12 15 17 10" />
                                              <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                            PDF
                                          </button>
                                        </div>
                                        <table className="w-full border-collapse">
                                          <thead>
                                            <tr className="border-b border-border">
                                              <th className="p-[10px_0] text-left text-[10px] font-800 uppercase text-text-3 tracking-[0.5px]">Sub-Location</th>
                                              <th className="p-[10px_0] text-left text-[10px] font-800 uppercase text-text-3 tracking-[0.5px]">Invoice</th>
                                              <th className="p-[10px_0] text-left text-[10px] font-800 uppercase text-text-3 tracking-[0.5px]">Amount Applied</th>
                                              <th className="p-[10px_0] text-left text-[10px] font-800 uppercase text-text-3 tracking-[0.5px]">QBO Payment ID</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {job.auditEntries.map(entry => (
                                              <tr key={entry.id} className="border-b border-border last:border-none">
                                                <td className="py-3"><span className="font-mono text-[12px] text-text">{entry.subLocationId}</span></td>
                                                <td className="py-3"><span className="font-mono text-[12px] text-text">{entry.invoiceId}</span></td>
                                                <td className="py-3">
                                                  <span className="text-accent-2 font-extrabold font-mono text-[13px]">
                                                    ${fmt(entry.amountApplied)}
                                                  </span>
                                                </td>
                                                <td className="py-3">
                                                  <span className="font-mono text-[12px] text-text-3">
                                                    {entry.qboPaymentId ?? '—'}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="border-t border-border-strong">
                                              <td colSpan={2} className="py-4 text-text-3 text-[11px] font-700 uppercase tracking-wider">
                                                Total allocated
                                              </td>
                                              <td className="py-4">
                                                <span className="text-accent-2 font-extrabold font-display text-[15px] tracking-tight">
                                                  ${fmt(job.auditEntries.reduce((s, e) => s + Number(e.amountApplied), 0))}
                                                </span>
                                              </td>
                                              <td className="py-4" />
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>

                                      <div>
                                        <div className="font-display text-[14px] font-800 text-text mb-4 uppercase tracking-[0.5px]">Job Details</div>
                                        <div className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-4 shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
                                          {[
                                            ['Job ID', job.id.slice(0, 8) + '…', job.id],
                                            ['Payment ID', job.paymentId.slice(0, 16) + (job.paymentId.length > 16 ? '…' : ''), job.paymentId],
                                            ['Rule type', job.rule?.ruleType ?? '—', job.rule?.ruleType],
                                            ['Created', new Date(job.createdAt).toLocaleString(), job.createdAt],
                                            ...(job.completedAt
                                              ? [['Completed', new Date(job.completedAt).toLocaleString(), job.completedAt]]
                                              : []),
                                          ].map(([k, v, full]) => (
                                            <div key={k} className="flex justify-between items-center py-2 border-b border-border last:border-none">
                                              <span className="text-[11px] font-700 uppercase text-text-3 tracking-[0.5px]">{k}</span>
                                              <span className="text-[13px] font-600 text-text font-mono truncate max-w-[200px]" title={full as string}>{v}</span>
                                            </div>
                                          ))}
                                          <div className={styles.metaRow}>
                                            <span className={styles.metaKey}>Total amount</span>
                                            <span className={styles.metaAmount}>${fmt(job.totalAmount)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'remittance' && (
          <div className="bg-surface border border-border shadow-[0_8px_32px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] rounded-[18px] overflow-hidden mb-6 animate-fadeUp backdrop-blur-[10px]">
            <div className="flex items-center justify-between p-[16px_24px] border-b border-border">
              <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">Remittance Uploads</span>
              <button className="text-[11px] font-700 text-white bg-accent border border-accent p-[7px_14px] rounded-[8px] cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-1" onClick={() => setShowPricingModal(true)}>Upload CSV...</button>
            </div>
            <div className="p-[72px_24px] text-center">
              <span className="text-[36px] mb-[14px] block filter grayscale-[0.3]">📄</span>
              <div className="font-display text-[15px] font-800 text-text mb-[7px]">Upload Remittance History</div>
              <div className="text-[13px] text-text-3 max-w-[360px] mx-auto leading-[1.6]">Upload bulk clearing lists from payment providers directly. Support for this feature requires Professional plan or higher.</div>
            </div>
          </div>
        )}

        {tab === 'ap' && (
          <div className="bg-surface border border-border shadow-[0_8px_32px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] rounded-[18px] overflow-hidden mb-6 animate-fadeUp backdrop-blur-[10px]">
            <div className="flex items-center justify-between p-[16px_24px] border-b border-border">
              <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">AP Bill Splitting</span>
            </div>
            <div className="p-[72px_24px] text-center">
              <span className="text-[36px] mb-[14px] block filter grayscale-[0.3]">📤</span>
              <div className="font-display text-[15px] font-800 text-text mb-[7px]">Split AP Bills Automatically</div>
              <div className="text-[13px] text-text-3 max-w-[360px] mx-auto leading-[1.6]">Accounts Payable bill splitting is an upcoming feature. Automate vendor disbursement across branches.</div>
            </div>
          </div>
        )}

        {tab === 'trust' && (
          <div className="bg-surface border border-border shadow-[0_8px_32px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] rounded-[18px] overflow-hidden mb-6 animate-fadeUp backdrop-blur-[10px]">
            <div className="flex items-center justify-between p-[16px_24px] border-b border-border">
              <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">Trust Accounting</span>
            </div>
            <div className="p-[72px_24px] text-center">
              <span className="text-[36px] mb-[14px] block filter grayscale-[0.3]">🏛️</span>
              <div className="font-display text-[15px] font-800 text-text mb-[7px]">Trust Ledger Management</div>
              <div className="text-[13px] text-text-3 max-w-[360px] mx-auto leading-[1.6]">Manage pre-funded retainers, trust-to-operating transfers, and compliance reporting. Feature currently in beta.</div>
            </div>
          </div>
        )}

        {tab === 'rules' && (
          <div className="bg-surface border border-border shadow-[0_8px_32px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] rounded-[18px] overflow-hidden mb-6 animate-fadeUp backdrop-blur-[10px]">
            <div className="flex items-center justify-between p-[16px_24px] border-b border-border">
              <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">Payment Routing Rules</span>
              {(firm?.plan === 'TRIAL' || firm?.plan === 'STANDARD') && (
                <span className="text-[11.5px] text-text-2 bg-surface-2 border border-border rounded-[20px] p-[3px_11px] font-600 ml-3">
                  {rules.length} of 3 rules used
                </span>
              )}
              <div className="flex-1" />
              <button
                className="text-[11px] font-700 text-text bg-surface-2 border border-border p-[7px_14px] rounded-[8px] cursor-pointer hover:bg-surface-3 transition-colors flex items-center gap-1"
                onClick={() => {
                  if (!hasAccess) {
                    addToast(`Your access has expired. Please subscribe to create or edit rules.`, 'error')
                    setShowPricingModal(true)
                    return
                  }
                  if ((firm?.plan === 'TRIAL' || firm?.plan === 'STANDARD') && rules.length >= 3) {
                    addToast(`Your ${firm?.plan} plan allows up to 3 rules. Upgrade for more.`, 'info')
                    setShowPricingModal(true)
                    return
                  }
                  setEditingRule(null)
                  setShowRuleModal(true)
                }}
              >
                <span className="text-[16px] font-semibold mr-1">+</span> New Rule
              </button>
            </div>

            {rules.length === 0 ? (
              <div className="p-16 text-center" role="status">
                <div className="text-[40px] mb-4">⚖️</div>
                <div className="font-display text-[15px] font-800 text-text mb-[7px]">No rules yet</div>
                <div className="text-[13px] text-text-3 max-w-[360px] mx-auto leading-[1.6]">Rules determine how payments are split between your branch locations.</div>
                <div className="mt-6">
                  <button 
                    className="text-[11px] font-700 text-white bg-accent border border-accent p-[7px_14px] rounded-[8px] cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-1 mx-auto" 
                    onClick={() => {
                       if (!hasAccess) {
                         addToast(`Your access has expired. Please subscribe to create rules.`, 'error')
                         setShowPricingModal(true)
                         return
                       }
                       setEditingRule(null)
                       setShowRuleModal(true)
                    }}
                  >
                    + Create your first rule
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse table-fixed min-w-[800px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3">Parent Customer</th>
                      <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3">Type</th>
                      <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3">Weights / Order</th>
                      <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3">Status</th>
                      <th className="p-[11px_20px] text-left text-[10.5px] font-700 uppercase tracking-[0.75px] text-text-3">Created</th>
                      <th className="p-[11px_20px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => {
                      const parent = customers.find(c => c.Id === rule.parentCustomerId)
                      return (
                        <tr key={rule.id} className="border-b border-border hover:bg-surface-2 transition-colors">
                          <td className="p-[11px_20px]">
                            <div className="font-bold text-[13px] text-text">{parent?.DisplayName || `Customer ${rule.parentCustomerId}`}</div>
                          </td>
                          <td className="p-[11px_20px]">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-700 uppercase tracking-[0.5px] text-accent p-[2px_8px] bg-accent-glow rounded-[4px]">{rule.ruleType}</span>
                              {rule.isLocked && <span title={`Locked: ${rule.lockedReason}`} className="cursor-help">🔒</span>}
                            </div>
                          </td>
                          <td className="p-[11px_20px]">
                            <div className="font-mono text-[11px] max-w-[300px]">
                              {rule.ruleType === 'proportional'
                                ? Object.entries(rule.ruleConfig.weights as Record<string, number>).map(([id, w]) => {
                                  const loc = locations.find(l => String(l.Id) === String(id) || String(l.id) === String(id))
                                  return (
                                    <span key={id} className="text-[10px] font-700 bg-surface-2 border border-border p-[3px_8px] rounded-[20px] text-text-2 whitespace-nowrap mr-1 mb-1 inline-block">
                                      {loc?.Name || loc?.name || `Location ${id}`}: {w}%
                                    </span>
                                  )
                                })
                                : (
                                  <div className="flex flex-wrap gap-1 items-center">
                                    {(rule.ruleConfig.locationIds as string[]).map((locId, idx) => {
                                      const loc = locations.find(l => String(l.Id) === String(locId) || String(l.id) === String(locId))
                                      return (
                                        <span key={locId} className="text-[10px] font-700 bg-surface-2 border border-border p-[3px_8px] rounded-[20px] text-text-2 whitespace-nowrap">
                                          {idx + 1}. {loc?.Name || loc?.name || `Location ${locId}`}
                                        </span>
                                      )
                                    })}
                                  </div>
                                )
                              }
                            </div>
                          </td>
                          <td className="p-[11px_20px]">
                            <button
                              className={`appearance-none border-none p-[4px_10px] rounded-[6px] text-[10.5px] font-800 uppercase tracking-[0.5px] cursor-pointer transition-all ${rule.isActive ? 'bg-accent-glow text-accent' : 'bg-surface-2 text-text-3'}`}
                              disabled={!hasAccess}
                              onClick={() => {
                                if (!hasAccess) {
                                  addToast('Your access has expired. Please subscribe.', 'error')
                                  setShowPricingModal(true)
                                } else {
                                  toggleRule(rule.id, !rule.isActive)
                                }
                              }}
                            >
                              {rule.isActive ? 'Active' : 'Disabled'}
                            </button>
                          </td>
                          <td className="p-[11px_20px]"><span className="text-[12px] text-text-3">{new Date(rule.createdAt).toLocaleDateString()}</span></td>
                          <td className="p-[11px_20px]">
                            <div className="flex gap-2">
                              <button
                                className={`text-[11px] font-700 text-text bg-surface-2 border border-border py-1 px-2 rounded-[6px] hover:bg-surface-3 transition-colors ${rule.isLocked || !hasAccess ? 'opacity-70' : 'opacity-100'}`}
                                onClick={() => {
                                  if (!hasAccess) {
                                    addToast('Your access has expired. Please subscribe.', 'error')
                                    setShowPricingModal(true)
                                    return
                                  }
                                  if (rule.isLocked) {
                                    addToast(`This rule is locked due to a plan downgrade. Upgrade to Professional to edit.`, 'info')
                                    setShowPricingModal(true)
                                    return
                                  }
                                  setEditingRule(rule);
                                  setShowRuleModal(true);
                                }}
                              >
                                {rule.isLocked ? 'View' : 'Edit'}
                              </button>
                              <button className="text-[10px] font-700 text-red bg-transparent border border-red/20 p-[4px_10px] rounded-[6px] cursor-pointer hover:bg-red/10 hover:border-red/40 transition-all font-display uppercase tracking-wider" onClick={() => deleteRule(rule.id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

            <div className="bg-surface border border-border shadow-sm rounded-[18px] overflow-hidden mb-6 animate-fadeUp">
              <div className="flex items-center justify-between p-[16px_24px] border-b border-border bg-surface-2/30">
                <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">Account Connection</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border last:border-none">
                  <div>
                    <div className="font-bold text-[14px] text-text mb-1">QuickBooks Online</div>
                    <div className="text-[12px] text-text-3">
                      {firm?.qboRealmId ? (
                        <span className="flex items-center gap-1.5 text-accent-2 font-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-2" />
                          Connected to Realm ID: {firm.qboRealmId}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-text-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-border" />
                          Not connected to any QBO company
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href={`${API}/auth/qbo/connect?firmId=${firmId}`}
                    className="text-[11px] font-700 text-white bg-accent border border-accent p-[7px_14px] rounded-[8px] cursor-pointer hover:opacity-90 transition-opacity flex items-center gap-1 no-underline text-center"
                  >
                    {firm?.qboRealmId ? 'Reconnect QBO' : 'Connect QBO'}
                  </a>
                </div>
                <div className="flex items-center justify-between p-6 border-b border-border last:border-none">
                  <div>
                    <div className="font-bold text-[14px] text-text mb-1">Subscription Plan</div>
                    <div className="text-[12px] text-text-3 flex items-center gap-2">
                       Current tier: 
                       <span className="bg-accent/10 text-accent font-900 px-2 py-0.5 rounded-full text-[10px] border border-accent/20 uppercase tracking-wider">{firm?.plan || 'TRIAL'}</span>
                    </div>
                  </div>
                  <button className="text-[11px] font-700 text-text bg-surface-2 border border-border p-[8px_16px] rounded-[8px] cursor-pointer hover:bg-surface-3 transition-colors" onClick={() => setShowPricingModal(true)}>
                    {firm?.plan === 'TRIAL' ? 'Upgrade Plan' : 'Change Plan'}
                  </button>
                </div>
                <div className="flex items-center justify-between p-6 border-b border-border last:border-none">
                  <div className="w-full">
                    <div className="font-bold text-[14px] text-text mb-1">Allocation Enforcement</div>
                    <div className="text-[12px] text-text-3 mb-4">Choose how payments are posted to QBO.</div>
                    <div className="flex gap-2">
                      <button
                        className={`flex-1 py-2 px-3 rounded-xl text-[12px] font-700 border transition-all ${firm?.allocationMode === 'AUTO' ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20' : 'bg-surface-2 text-text-3 border-border hover:bg-surface-3'}`}
                        onClick={() => updateAllocationMode('AUTO')}
                      >
                        Auto-Post (Instant)
                      </button>
                      <button
                        className={`flex-1 py-2 px-3 rounded-xl text-[12px] font-700 border transition-all ${firm?.allocationMode === 'REVIEW' ? 'bg-[#ec4899] text-white border-[#ec4899] shadow-lg shadow-[#ec4899]/20' : 'bg-surface-2 text-text-3 border-border hover:bg-surface-3'}`}
                        onClick={() => updateAllocationMode('REVIEW')}
                      >
                        Manual Review
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border shadow-sm rounded-[18px] overflow-hidden mb-6 animate-fadeUp">
              <div className="flex items-center justify-between p-[16px_24px] border-b border-border bg-surface-2/30">
                <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">Notifications</span>
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-[11px] font-800 text-text-3 uppercase tracking-wider mb-2">Alert Recipients</label>
                  <div className="flex gap-2">
                    <input 
                      type="email" 
                      placeholder="admin@firm.com" 
                      readOnly 
                      className="flex-1 bg-surface-2 border border-border p-2.5 rounded-lg text-[13px] text-text-3 outline-none cursor-not-allowed" 
                    />
                    <button className="px-4 py-2 bg-surface-3 border border-border rounded-lg text-[12px] font-700 text-text-3 cursor-not-allowed" onClick={() => addToast('Notification configuration requires Practice plan.', 'info')}>Save</button>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-accent-2/5 rounded-xl border border-accent-2/10">
                  <span className="w-2 h-2 rounded-full bg-accent-2 animate-pulse" />
                  <p className="text-[12px] text-text-2 leading-relaxed">
                    System alerts are <strong>active</strong>. Internal webhooks are monitoring all API activity and failed reconciliation jobs.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border shadow-sm rounded-[18px] overflow-hidden mb-6 animate-fadeUp">
              <div className="flex items-center justify-between p-[16px_24px] border-b border-border bg-surface-2/30">
                <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">Advanced Integrations</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border last:border-none group">
                  <div>
                    <div className="font-bold text-[14px] text-text mb-1 flex items-center gap-2">
                      Xero Integration
                      <span className="bg-surface-3 text-text-3 text-[9px] px-1.5 py-0.5 rounded-full border border-border uppercase tracking-tight font-900">Coming Soon</span>
                    </div>
                    <div className="text-[12px] text-text-3">Sync payments and reconciliations with Xero.</div>
                  </div>
                  <button className="text-[11px] font-700 text-text-3 bg-surface-2 border border-border p-[7px_14px] rounded-[8px] opacity-40 cursor-not-allowed" disabled>Connect Xero</button>
                </div>
                <div className="flex items-center justify-between p-6 border-b border-border last:border-none">
                  <div>
                    <div className="font-bold text-[14px] text-text mb-1 flex items-center gap-2">
                      Multi-Entity Portal
                      <span className="bg-accent/10 text-accent text-[9px] px-1.5 py-0.5 rounded-full border border-accent/20 uppercase tracking-tight font-900">Practice</span>
                    </div>
                    <div className="text-[12px] text-text-3">Manage multiple QBO files under one firm roof.</div>
                  </div>
                  <button 
                    className="text-[11px] font-700 text-text-3 bg-surface-2 border border-border p-[7px_14px] rounded-[8px] cursor-pointer hover:bg-surface-3 transition-colors flex items-center gap-2" 
                    onClick={() => { addToast('Multi-Entity setup requires Practice Plan.', 'info'); setShowPricingModal(true); }}
                  >
                    Configure 🔒
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border shadow-sm rounded-[18px] overflow-hidden mb-6 animate-fadeUp">
              <div className="flex items-center justify-between p-[16px_24px] border-b border-border bg-surface-2/30">
                <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">Security & Branding</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border last:border-none">
                  <div>
                    <div className="font-bold text-[14px] text-text mb-1 flex items-center gap-2">
                      Fraud & Anomaly Detection
                      <span className="bg-accent/10 text-accent text-[9px] px-1.5 py-0.5 rounded-full border border-accent/20 uppercase tracking-tight font-900">Practice</span>
                    </div>
                    <div className="text-[12px] text-text-3">Automatically pause payments above $5,000 for manual review.</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-800 text-text-3 uppercase tracking-wider">Unconfigured</span>
                    <button 
                      className="text-[11px] font-700 text-text-3 bg-surface-2 border border-border p-[6px_10px] rounded-[8px] cursor-pointer hover:bg-surface-3 transition-colors"
                      onClick={() => { addToast('Fraud protection requires Practice plan.', 'info'); setShowPricingModal(true); }}
                    >
                      Enable 🔒
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-6 border-b border-border last:border-none">
                  <div>
                    <div className="font-bold text-[14px] text-text mb-1 flex items-center gap-2">
                      White-label Reporting
                      <span className="bg-accent/10 text-accent text-[9px] px-1.5 py-0.5 rounded-full border border-accent/20 uppercase tracking-tight font-900">Practice</span>
                    </div>
                    <div className="text-[12px] text-text-3">Use your firm's logo and branding on audit reports.</div>
                  </div>
                  <button 
                    className="text-[11px] font-700 text-text-3 bg-surface-2 border border-border p-[7px_14px] rounded-[8px] cursor-pointer hover:bg-surface-3 transition-colors flex items-center gap-2" 
                    onClick={() => { addToast('White-labeling is a Practice plan feature.', 'info'); setShowPricingModal(true); }}
                  >
                    Customize 🔒
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {tab === 'audit' && (
          <div className="bg-surface border border-border shadow-[0_8px_32px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] rounded-[18px] overflow-hidden mb-6 animate-fadeUp backdrop-blur-[10px]">
            <div className="flex items-center justify-between p-[16px_24px] border-b border-border">
              <span className="font-display text-[13.5px] font-700 text-text tracking-[-0.2px]">Audit Feed</span>
              <div className="flex-1" />
              <button className="text-[11px] font-700 text-text bg-surface-2 border border-border p-[7px_14px] rounded-[8px] cursor-pointer hover:bg-surface-3 transition-colors flex items-center gap-1 mr-2" onClick={() => addToast('Bulk export queued. You will receive an email shortly.', 'info')}>
                ⬇ Bulk Attachment Export
              </button>
              <button className="text-[11px] font-700 text-text bg-surface-2 border border-border p-[7px_14px] rounded-[8px] cursor-pointer hover:bg-surface-3 transition-colors flex items-center gap-1" onClick={() => fetchActivity(firmId)}>Refresh</button>
            </div>
            {activity.length === 0 ? (
              <div className="p-[72px_24px] text-center">
                <span className="text-[36px] mb-[14px] block filter grayscale-[0.3]">📜</span>
                <div className="font-display text-[15px] font-800 text-text mb-[7px]">No activity logged yet</div>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th>Time</th>
                      <th>Event</th>
                      <th>Actor</th>
                      <th>Detail</th>
                      <th>Job ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map(log => {
                      const sevColor = log.severity === 'ERROR' ? '#ef4444' : log.severity === 'WARNING' ? '#f59e0b' : '#3b82f6'
                      const actorColor = log.actorType === 'USER' ? '#ec4899' : log.actorType === 'WEBHOOK' ? '#8b5cf6' : '#64748b'
                      return (
                        <tr key={log.id} className="border-b border-border hover:bg-surface-2 transition-colors">
                          <td className="p-[11px_20px]"><span className="text-[12px] text-text-3 font-mono">{new Date(log.createdAt).toLocaleString()}</span></td>
                          <td className="p-[11px_20px]">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ background: sevColor }} />
                              <span className="font-mono text-[12px] font-semibold text-text">{log.type}</span>
                            </div>
                          </td>
                          <td className="p-[11px_20px]">
                            <span className="inline-flex items-center justify-center rounded-[4px] font-bold uppercase text-[9px] px-1.5 py-0.5 border" style={{ background: `${actorColor}20`, color: actorColor, borderColor: `${actorColor}40` }}>
                              {log.actorType}
                            </span>
                          </td>
                          <td className="p-[11px_20px]">
                            <div className="text-[11px] text-text-3 max-w-[400px] whitespace-nowrap overflow-hidden text-ellipsis font-mono">
                              {JSON.stringify(log.details)}
                            </div>
                          </td>
                          <td className="p-[11px_20px]"><span className="font-mono text-[10px] text-text-2">{log.jobId?.slice(0, 8) || '—'}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}


        {showRuleModal && (
          <RuleBuilderModal
            customers={customers}
            locations={locations}
            onClose={() => {
              setShowRuleModal(false);
              setEditingRule(null);
            }}
            onSave={() => fetchRules(firmId)} // Corrected to just refetch
            loading={loadingQBO}
            plan={firm?.plan || 'trial'}
            firmId={firmId}
            addToast={addToast}
            setShowPricingModal={setShowPricingModal}
            editingRule={editingRule}
          />
        )}

        {showPricingModal && (
          <PricingModal
            currentPlan={firm?.plan || 'TRIAL'}
            onClose={() => setShowPricingModal(false)}
            onUpgrade={handleUpgrade}
          />
        )}

        {/* Toast Container */}
        <div className="fixed bottom-8 right-8 z-[2000] flex flex-col gap-3 pointer-events-none">
          {toasts.map(t => (
            <Toast key={t.id} toast={t} onClose={() => removeToast(t.id)} />
          ))}
        </div>

        {showDeleteModal && (
          <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fadeIn p-4" onClick={() => setShowDeleteModal(false)}>
            <div className="bg-surface border border-border w-full max-w-[440px] rounded-[24px] shadow-[0_24px_64px_rgba(0,0,0,0.2)] animate-slideUp overflow-hidden p-8" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
              <h2 className="font-display text-[20px] font-800 text-red mb-2 tracking-tight" id="delete-modal-title">Delete Rule</h2>
              <p className="text-[14px] text-text-2 leading-relaxed mb-6">Are you sure you want to permanently delete this rule? This cannot be undone.</p>
              <div className="flex gap-3 mt-6">
                <button
                  className="flex-1 p-[11px] bg-surface-2 border border-border rounded-[10px] font-bold cursor-pointer hover:bg-surface-3 transition-all text-[13px] text-text"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 p-[11px] bg-red text-white border border-red rounded-[10px] font-bold cursor-pointer hover:bg-red/90 transition-all text-[13px]"
                  onClick={confirmDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Logout confirmation modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fadeIn p-4" onClick={() => setShowLogoutModal(false)}>
          <div className="bg-surface border border-border w-full max-w-[400px] rounded-[24px] shadow-[0_24px_64px_rgba(0,0,0,0.2)] animate-slideUp overflow-hidden p-8 text-center" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="logout-modal-title">
            <div className="w-14 h-14 bg-red/10 text-red rounded-full flex items-center justify-center mx-auto mb-6">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </div>
            <h2 className="font-display text-[20px] font-800 text-text mb-2 tracking-tight" id="logout-modal-title">Sign Out</h2>
            <p className="text-[14px] text-text-2 leading-relaxed mb-6">Are you sure you want to sign out? You&apos;ll need to re-enter your firm ID to access your dashboard.</p>
            <div className="flex gap-3">
              <button
                className="flex-1 p-[11px] bg-surface-2 border border-border rounded-[10px] font-bold cursor-pointer hover:bg-surface-3 transition-all text-[13px] text-text"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 p-[11px] bg-red text-white border border-red rounded-[10px] font-bold cursor-pointer hover:bg-red/90 transition-all text-[13px]"
                onClick={handleLogout}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
