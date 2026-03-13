'use client'

import { useEffect, useState, useCallback, useRef, Fragment } from 'react'
import { ThemeToggle } from '../../components/ThemeToggle'
import { useRouter } from 'next/navigation'

declare var process: {
  env: {
    [key: string]: string | undefined
  }
}

// ── Types ───────────────────────────────────────────────────────────────────
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

// ── Constants ───────────────────────────────────────────────────────────────

// FIRM_ID is now handled dynamically in the component
const API = (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : null) || 'http://localhost:3001'

const STATUS_META: Record<JobStatus, { label: string; color: string }> = {
  COMPLETE: { label: 'Complete', color: '#10b981' },
  FAILED: { label: 'Failed', color: '#ef4444' },
  ROLLED_BACK: { label: 'Rolled Back', color: '#6366f1' },
  PROCESSING: { label: 'Processing', color: '#f59e0b' },
  QUEUED: { label: 'Queued', color: '#2d31fa' },
  REVIEW_REQUIRED: { label: 'Manual Review', color: '#ec4899' },
  ANOMALY_PAUSED: { label: 'Anomaly Detected', color: '#f97316' },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Logo icon ────────────────────────────────────────────────────────────────

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
// ── Status badge ─────────────────────────────────────────────────────────────

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

interface ToastProps {
  toast: Toast
  onClose: () => void
  key?: any
}

function Toast({ toast, onClose }: ToastProps) {
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

// ── Chevron icon ─────────────────────────────────────────────────────────────

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
              {currentPlan === 'PROFESSIONAL' ? 'Current Plan' : 'Select Professional'}
            </button>
          </div>

          <div className="bg-surface border border-border rounded-[18px] p-[32px_24px] display-flex flex-col transition-all duration-300 relative shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:translate-y-[-4px] hover:border-accent hover:shadow-[0_12px_30px_rgba(0,0,0,0.06)]">
            <div className="font-display text-[14px] font-700 text-text-3 mb-4 uppercase tracking-[1px]">Practice</div>
            <div className="font-display text-[40px] font-800 text-text mb-6">$799<span className="text-[16px] text-text-3 font-500">/mo</span></div>
            <div className="text-[14px] text-text-2 mb-8">Practice-wide automation & Location Priority</div>
            <button
              className="mt-auto p-3 rounded-[10px] border border-border-strong bg-surface-2 text-text text-[13px] font-700 cursor-pointer transition-all duration-200 hover:bg-surface-3 hover:border-text-3 disabled:opacity-50 disabled:cursor-not-allowed"
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
      ;[newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]]
    setOrder(newOrder)
  }
  const handleWeightChange = (locId: string, val: string) => {
    setWeights(prev => ({ ...prev, [locId]: Number(val) }))
  }

  const handleSave = async () => {
    if (!parentCustomerId) return addToast('Select a parent customer', 'error')

    const ruleConfig: any = { type: ruleType }
    if (ruleType === 'proportional') {
      const total = Object.values(weights).reduce((s: number, w: number) => s + w, 0)
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
      onSave(data)
      onClose()
    } catch (e) {
      console.error(e)
      addToast('An unexpected error occurred', 'error')
    } finally {
      setSaving(false)
    }
  }

  const totalWeight = Object.values(weights).reduce((s: number, w: number) => s + w, 0)
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
              <div className="h-10 rounded-lg bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%] animate-pulse" />
              <div className="h-10 rounded-lg bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%] animate-pulse" />
              <div className="h-[120px] rounded-lg bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%] animate-pulse" />
            </div>
          ) : isEmpty ? (
            <div className="p-12 text-center" role="status">
              <div className="text-[40px] mb-4">🔭</div>
              <div className="font-display text-[15px] font-800 text-text mb-[7px]">No QBO Data Available</div>
              <div className="text-[13px] text-text-3 max-w-[360px] mx-auto leading-[1.6]">
                We couldn&apos;t find any customers or locations in your QuickBooks account.
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
                        disabled={isRuleTypeLocked && !isActive}
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
  const [toasts, setToasts] = useState<Toast[]>([])
  const [qboConnected, setQboConnected] = useState<boolean | null>(null)
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const fetchDashboardData = useCallback(async (fid: string) => {
    try {
      const [jRes, rRes, aRes, fRes, cRes, lRes] = await Promise.all([
        fetch(`${API}/api/jobs?firmId=${fid}`),
        fetch(`${API}/api/rules?firmId=${fid}`),
        fetch(`${API}/api/activity?firmId=${fid}`),
        fetch(`${API}/api/firm/${fid}`),
        fetch(`${API}/api/qbo/customers?firmId=${fid}`),
        fetch(`${API}/api/qbo/locations?firmId=${fid}`),
      ])

      if (jRes.ok) setJobs(await jRes.json())
      if (rRes.ok) setRules(await rRes.json())
      if (aRes.ok) setActivity(await aRes.json())
      if (fRes.ok) setFirm(await fRes.json())
      if (cRes.ok) setCustomers(await cRes.json())
      if (lRes.ok) setLocations(await lRes.json())
    } catch (e) {
      console.error('Fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSyncStatus = useCallback(async (fid: string) => {
    try {
      const res = await fetch(`${API}/api/qbo/status?firmId=${fid}`)
      if (res.ok) {
        const data = await res.json()
        setQboConnected(data.connected)
      }
    } catch (e) {
      console.error('Status fetch error:', e)
    }
  }, [])

  useEffect(() => {
    const storedFirmId = localStorage.getItem('ps_firm_id')
    if (!storedFirmId) {
      router.push('/')
      return
    }
    setFirmId(storedFirmId)
    fetchDashboardData(storedFirmId)
    fetchSyncStatus(storedFirmId)

    const interval = setInterval(() => {
      fetchDashboardData(storedFirmId)
      fetchSyncStatus(storedFirmId)
    }, 10000)

    return () => clearInterval(interval)
  }, [router, fetchDashboardData, fetchSyncStatus])

  const handleManualSync = async () => {
    if (!firmId) return
    setSyncing(true)
    try {
      const res = await fetch(`${API}/api/jobs/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId })
      })
      if (res.ok) {
        addToast('Sync initiated...', 'success')
        fetchDashboardData(firmId)
      } else {
        addToast('Sync failed to start', 'error')
      }
    } catch (e) {
      addToast('Error starting sync', 'error')
    } finally {
      setSyncing(false)
    }
  }
  const toggleRule = async (id: string, current: boolean) => {
    try {
      const res = await fetch(`${API}/api/rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !current })
      })
      if (res.ok) {
        addToast(`Rule ${!current ? 'enabled' : 'disabled'}`, 'success')
        fetchDashboardData(firmId)
      }
    } catch (e) {
      addToast('Failed to toggle rule', 'error')
    }
  }

  const deleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return
    try {
      const res = await fetch(`${API}/api/rules/${id}`, { method: 'DELETE' })
      if (res.ok) {
        addToast('Rule deleted', 'success')
        fetchDashboardData(firmId)
      }
    } catch (e) {
      addToast('Failed to delete rule', 'error')
    }
  }

  const handleUpgrade = async (plan: string) => {
    try {
      const res = await fetch(`${API}/api/firm/${firmId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: plan.toUpperCase() })
      })
      if (res.ok) {
        addToast(`Upgraded to ${plan}!`, 'success')
        setShowPricingModal(false)
        fetchDashboardData(firmId)
      }
    } catch (e) {
      addToast('Upgrade failed', 'error')
    }
  }

  const getRuleDetails = (rule: Rule) => {
    if (rule.ruleType === 'proportional') {
      return Object.entries(rule.ruleConfig.weights || {})
        .map(([id, w]) => {
          const loc = locations.find(l => String(l.Id) === String(id))
          return `${loc?.Name || id}: ${w}%`
        })
        .join(', ')
    }
    if (rule.ruleType === 'oldest_first' || rule.ruleType === 'location_priority') {
      const ids = rule.ruleConfig.locationIds || rule.ruleConfig.order || []
      return ids.map((id: string, i: number) => {
        const loc = locations.find(l => String(l.Id) === String(id))
        return `${i + 1}. ${loc?.Name || id}`
      }).join(' → ')
    }
    return 'Custom strategy'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-3 font-display font-700 text-[13px] tracking-wide uppercase">Initializing Dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-text selection:bg-accent/20 selection:text-accent">
      {/* Toast Overlay */}
      <div className="fixed top-6 right-6 z-[10000] flex flex-col gap-3">
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>

      <nav className="fixed top-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-md border-b border-border z-[100] px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-accent/10 rounded-xl flex items-center justify-center border border-accent/20">
            <LogoIcon />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-800 text-[14px] leading-tight tracking-tight">Antigravity Splitter</span>
            <span className="text-[10px] text-text-3 font-bold uppercase tracking-wider">{firm?.name || 'Loading...'}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-border">
            {(['reconciliation', 'rules', 'audit', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`p-[6px_14px] rounded-[8px] text-[11.5px] font-700 transition-all ${tab === t ? 'bg-surface text-accent shadow-sm border border-border' : 'text-text-3 hover:text-text'}`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="h-6 w-[1px] bg-border mx-1" />

          <button
            onClick={() => setShowPricingModal(true)}
            className="flex items-center gap-2 p-[6px_14px] bg-accent/10 border border-accent/20 rounded-xl text-accent text-[11.5px] font-800 hover:bg-accent/20 transition-all group"
          >
            <span>✨</span>
            <span>{firm?.plan === 'TRIAL' ? 'Upgrade Plan' : `${firm?.plan} Plan`}</span>
          </button>

          <ThemeToggle />
        </div>
      </nav>

      <main className="pt-24 pb-12 px-8 max-w-[1400px] mx-auto">
        {tab === 'reconciliation' && (
          <div className="animate-fadeIn">
            <header className="flex items-center justify-between mb-8">
              <div>
                <h1 className="font-display text-[28px] font-800 tracking-tight text-text mb-2">Payment Reconciliation</h1>
                <p className="text-text-3 text-[14px]">Monitor and manage automated payment splits from QuickBooks.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 p-[8px_16px] bg-surface border border-border rounded-xl">
                  <div className={`w-2 h-2 rounded-full ${qboConnected ? 'bg-[#10b981] shadow-[0_0_8px_#10b981]' : 'bg-[#ef4444]'}`} />
                  <span className="text-[12px] font-700 text-text-2">{qboConnected ? 'QBO Linked' : 'QBO Disconnected'}</span>
                </div>
                <button
                  onClick={handleManualSync}
                  disabled={syncing}
                  className="flex items-center gap-2 p-[10px_20px] bg-accent text-white rounded-xl text-[12px] font-700 hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_4px_12px_rgba(45,49,250,0.2)]"
                >
                  <span>{syncing ? 'Syncing...' : 'Force Sync'}</span>
                </button>
              </div>
            </header>
            <div className="grid grid-cols-1 gap-4">
              {jobs.length === 0 ? (
                <div className="p-20 bg-surface border border-border rounded-[24px] text-center border-dashed">
                  <div className="text-[48px] mb-4 opacity-50">📑</div>
                  <h3 className="font-display text-[16px] font-800 text-text mb-2">No jobs found</h3>
                  <p className="text-text-3 text-[14px]">As payments arrive in QBO, they will appear here for splitting.</p>
                </div>
              ) : (
                jobs.map(job => (
                  <div
                    key={job.id}
                    className="group bg-surface border border-border rounded-[20px] overflow-hidden transition-all hover:border-accent/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
                  >
                    <div
                      className="p-6 flex items-center justify-between cursor-pointer"
                      onClick={() => setSelected(selected === job.id ? null : job.id)}
                    >
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Payment ID</span>
                          <span className="font-mono text-[13px] font-bold text-text underline decoration-accent/20 underline-offset-4">{job.paymentId}</span>
                        </div>
                        <div className="h-8 w-[1px] bg-border/60" />
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Total Amount</span>
                          <span className="text-[15px] font-800 text-text tracking-tight">${fmt(job.totalAmount)}</span>
                        </div>
                        <div className="h-8 w-[1px] bg-border/60" />
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Created</span>
                          <span className="text-[13px] font-600 text-text-2">{timeAgo(job.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <StatusBadge status={job.status} />
                        <div className={`p-2 rounded-lg bg-surface-2 border border-border text-text-3 transition-all group-hover:border-text-3/30 ${selected === job.id ? 'rotate-90 bg-accent/5 border-accent/20 text-accent' : ''}`}>
                          <Chevron open={selected === job.id} />
                        </div>
                      </div>
                    </div>

                    {selected === job.id && (
                      <div className="px-6 pb-6 animate-slideDown">
                        <div className="pt-6 border-t border-border flex flex-col gap-6">
                          {job.rule && (
                            <div className="bg-surface-2 p-4 rounded-xl border border-border flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="p-2 bg-accent/10 text-accent rounded-lg text-[12px]">⚖️</span>
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Applied Rule</span>
                                  <span className="text-[13px] font-700 text-text">{job.rule.ruleType.replace('_', ' ')} strategy</span>
                                </div>
                              </div>
                              <div className="text-[12px] font-600 text-text-3">Target: {job.rule.parentCustomerId}</div>
                            </div>
                          )}
                          {job.auditEntries.length > 0 ? (
                            <div className="flex flex-col gap-3">
                              <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider ml-1">Allocations</span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {job.auditEntries.map((ae, i) => (
                                  <div key={i} className="p-4 bg-surface p-4 rounded-xl border border-border flex items-center justify-between transition-all hover:bg-surface-2">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Location</span>
                                      <span className="text-[13px] font-700 text-text">{ae.subLocationId}</span>
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Amount</span>
                                      <span className="text-[14px] font-800 text-[#10b981]">+${fmt(ae.amountApplied)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="p-8 text-center bg-surface-2 rounded-xl border border-border border-dashed">
                              <p className="text-text-3 text-[12px] font-600">No split details available for this job.</p>
                            </div>
                          )}

                          {job.errorMessage && (
                            <div className="p-4 bg-[#ef444410] border border-[#ef444420] rounded-xl flex items-start gap-3">
                              <span className="text-[#ef4444] text-[16px]">⚠️</span>
                              <div className="flex flex-col gap-1">
                                <span className="text-[11px] font-800 text-[#ef4444] uppercase tracking-wider">Error Details</span>
                                <span className="text-[13px] font-600 text-[#ef4444] leading-relaxed">{job.errorMessage}</span>
                              </div>
                            </div>
                          ) || (
                              job.status === 'COMPLETE' && (
                                <div className="p-4 bg-[#10b98110] border border-[#10b98120] rounded-xl flex items-center gap-3">
                                  <span className="text-[#10b981] text-[16px]">✓</span>
                                  <span className="text-[12px] font-700 text-[#10b981]">All funds successfully allocated in QuickBooks Online.</span>
                                </div>
                              )
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {tab === 'rules' && (
          <div className="animate-fadeIn">
            <header className="flex items-center justify-between mb-8">
              <div>
                <h1 className="font-display text-[28px] font-800 tracking-tight text-text mb-2">Split Rules</h1>
                <p className="text-text-3 text-[14px]">Define how incoming payments should be distributed across sub-locations.</p>
              </div>
              <button
                onClick={() => { setEditingRule(null); setShowRuleModal(true); }}
                className="flex items-center gap-2 p-[10px_24px] bg-accent text-white rounded-xl text-[12px] font-700 hover:opacity-90 transition-all shadow-[0_4px_12px_rgba(45,49,250,0.2)]"
              >
                <span>+</span>
                <span>New Split Rule</span>
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rules.length === 0 ? (
                <div className="col-span-full p-20 bg-surface border border-border rounded-[24px] text-center border-dashed">
                  <div className="text-[48px] mb-4 opacity-50">⚖️</div>
                  <h3 className="font-display text-[16px] font-800 text-text mb-2">No rules defined</h3>
                  <p className="text-text-3 text-[14px]">Create your first split rule to start automating your reconciliation.</p>
                </div>
              ) : (
                rules.map(rule => (
                  <div key={rule.id} className="group bg-surface border border-border rounded-[24px] p-6 flex flex-col gap-6 transition-all hover:border-accent/40 hover:shadow-[0_12px_32px_rgba(0,0,0,0.04)] relative overflow-hidden">
                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Parent Customer</span>
                        <span className="text-[15px] font-800 text-text tracking-tight">{rule.parentCustomerId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditingRule(rule); setShowRuleModal(true); }}
                          className="p-2 rounded-lg bg-surface-2 border border-border text-text-3 hover:text-accent hover:border-accent/20 transition-all"
                          title="Edit rule"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="p-2 rounded-lg bg-surface-2 border border-border text-text-3 hover:text-[#ef4444] hover:border-[#ef4444]/20 transition-all"
                          title="Delete rule"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-surface-2 rounded-2xl border border-border flex flex-col gap-3 relative z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-800 text-text-3 uppercase tracking-widest">Strategy</span>
                        <span className="p-[3px_10px] bg-accent/10 text-accent text-[10px] font-bold rounded-full border border-accent/20 uppercase tracking-wider">{rule.ruleType.replace('_', ' ')}</span>
                      </div>
                      <div className="text-[12px] font-600 text-text-2 leading-relaxed italic">&quot;{getRuleDetails(rule)}&quot;</div>
                    </div>
                    <div className="flex items-center justify-between mt-2 relative z-10">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${rule.isActive ? 'bg-[#10b981]' : 'bg-text-3'}`} />
                        <span className="text-[11px] font-700 text-text-3 uppercase tracking-wider">{rule.isActive ? 'Active' : 'Paused'}</span>
                      </div>
                      <button
                        onClick={() => toggleRule(rule.id, rule.isActive)}
                        className={`p-[6px_16px] rounded-xl text-[11px] font-800 transition-all ${rule.isActive ? 'bg-surface border border-border text-text-2 hover:bg-surface-2' : 'bg-accent text-white hover:opacity-90 shadow-sm'}`}
                      >
                        {rule.isActive ? 'Pause' : 'Activate'}
                      </button>
                    </div>

                    {/* Locked Background Decor */}
                    {rule.isLocked && (
                      <div className="absolute inset-0 bg-surface/40 backdrop-blur-[1px] flex items-center justify-center z-20">
                        <div className="bg-surface border border-border shadow-xl p-4 rounded-2xl flex flex-col items-center gap-2 max-w-[80%] text-center animate-fadeIn">
                          <span className="text-[20px]">🔒</span>
                          <span className="text-[12px] font-800 text-text uppercase tracking-tight">Strategy Locked</span>
                          <p className="text-[10px] text-text-3 font-600 leading-tight">Your current plan does not support this strategy.</p>
                          <button
                            onClick={() => setShowPricingModal(true)}
                            className="mt-2 text-[10px] font-800 text-accent uppercase tracking-wider hover:underline"
                          >
                            Upgrade to Unlock
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="animate-fadeIn">
            <header className="mb-8">
              <h1 className="font-display text-[28px] font-800 tracking-tight text-text mb-2">Audit Registry</h1>
              <p className="text-text-3 text-[14px]">System-wide activity log for transparency and debugging.</p>
            </header>

            <div className="bg-surface border border-border rounded-[24px] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border">
                      <th className="p-5 text-[11px] font-800 text-text-3 uppercase tracking-[1px] first:pl-8">Timestamp</th>
                      <th className="p-5 text-[11px] font-800 text-text-3 uppercase tracking-[1px]">Event Type</th>
                      <th className="p-5 text-[11px] font-800 text-text-3 uppercase tracking-[1px]">Actor</th>
                      <th className="p-5 text-[11px] font-800 text-text-3 uppercase tracking-[1px]">Details</th>
                      <th className="p-5 text-[11px] font-800 text-text-3 uppercase tracking-[1px] last:pr-8">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-20 text-center">
                          <p className="text-text-3 text-[13px] font-600">No activity recorded yet.</p>
                        </td>
                      </tr>
                    ) : (
                      activity.map(log => (
                        <tr key={log.id} className="border-b border-border/60 hover:bg-surface-2/40 transition-colors group">
                          <td className="p-5 first:pl-8 text-[12px] font-600 text-text-3 tabular-nums">{new Date(log.createdAt).toLocaleString()}</td>
                          <td className="p-5">
                            <span className="font-mono text-[12px] font-semibold text-text">{log.type}</span>
                          </td>
                          <td className="p-5">
                            <span className={`p-[3px_10px] rounded-full text-[10px] font-bold border ${log.actorType === 'SYSTEM' ? 'bg-[#2d31fa10] border-[#2d31fa20] text-[#2d31fa]' : 'bg-[#10b98110] border-[#10b98120] text-[#10b981]'}`}>{log.actorType}</span>
                          </td>
                          <td className="p-5 text-[13px] font-500 text-text-2 max-w-[400px] truncate group-hover:whitespace-normal">{JSON.stringify(log.details)}</td>
                          <td className="p-5 last:pr-8">
                            <div className="flex items-center gap-1.5">
                              <div className={`w-1.5 h-1.5 rounded-full ${log.severity === 'ERROR' ? 'bg-[#ef4444]' : log.severity === 'WARNING' ? 'bg-[#f59e0b]' : 'bg-[#10b981]'}`} />
                              <span className="text-[11px] font-700 text-text-3 uppercase tracking-wider">{log.severity}</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="animate-fadeIn max-w-[800px]">
            <header className="mb-8">
              <h1 className="font-display text-[28px] font-800 tracking-tight text-text mb-2">Firm Settings</h1>
              <p className="text-text-3 text-[14px]">Manage your firm configuration and billing preferences.</p>
            </header>

            <div className="flex flex-col gap-6">
              <div className="bg-surface border border-border rounded-[24px] p-8 flex flex-col gap-8">
                <div className="flex flex-col gap-1">
                  <h3 className="font-display text-[16px] font-800 text-text uppercase tracking-tight">Organization Profile</h3>
                  <p className="text-text-3 text-[13px] font-500">Global settings for your payment reconciliation firm.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-800 text-text-3 uppercase tracking-wider ml-1">Firm Name</label>
                    <input
                      className="bg-surface-2 border border-border text-text rounded-xl p-[12px_16px] text-[14px] font-600 outline-none focus:border-accent transition-all"
                      value={firm?.name || ''}
                      disabled
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-800 text-text-3 uppercase tracking-wider ml-1">Firm ID (Read-only)</label>
                    <input
                      className="bg-surface-2 border border-border text-text-3 rounded-xl p-[12px_16px] text-[13px] font-mono outline-none"
                      value={firmId}
                      readOnly
                    />
                  </div>
                </div>
                <div className="pt-8 border-t border-border flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="font-display text-[15px] font-800 text-text">Data Retention Policy</span>
                      <span className="text-[12px] text-text-3 font-500">Keep audit logs for 12 months after job completion.</span>
                    </div>
                    <div className="w-12 h-6 bg-accent rounded-full border border-accent relative">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="font-display text-[15px] font-800 text-text">Email Notifications</span>
                      <span className="text-[12px] text-text-3 font-500">Receive summaries of payment batches and failures.</span>
                    </div>
                    <div className="w-12 h-6 bg-surface-3 rounded-full border border-border relative">
                      <div className="absolute left-1 top-1 w-4 h-4 bg-text-3 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-[24px] p-8 flex items-center justify-between bg-gradient-to-br from-surface to-accent/5">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center text-[24px] border border-accent/20">✨</div>
                  <div className="flex flex-col gap-1">
                    <span className="font-display text-[16px] font-800 text-text">Standard Plan</span>
                    <span className="text-[12px] text-text-3 font-600 uppercase tracking-widest">Next billing date: April 1, 2026</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowPricingModal(true)}
                  className="p-[10px_24px] bg-white text-black border border-black rounded-xl text-[12px] font-800 hover:bg-black hover:text-white transition-all"
                >
                  Manage Billing
                </button>
              </div>

              <div className="bg-[#ef444405] border border-[#ef444415] rounded-[24px] p-8 flex flex-col gap-6">
                <div className="flex flex-col gap-1">
                  <h3 className="font-display text-[16px] font-800 text-[#ef4444] uppercase tracking-tight">Danger Zone</h3>
                  <p className="text-text-3 text-[13px] font-500">Irreversible actions for your organization data.</p>
                </div>
                <div className="flex items-center justify-between p-6 bg-white border border-[#ef444415] rounded-2xl">
                  <div className="flex flex-col gap-1">
                    <span className="font-display text-[15px] font-800 text-text">Purge Audit Logs</span>
                    <span className="text-[12px] text-text-3 font-500">Permanently delete all historical activity data.</span>
                  </div>
                  <button className="p-[8px_16px] border border-[#ef4444] text-[#ef4444] rounded-lg text-[11px] font-800 hover:bg-[#ef4444] hover:text-white transition-all uppercase tracking-wider">Empty Registry</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      {/* Modals */}
      {showRuleModal && (
        <RuleBuilderModal
          customers={customers}
          locations={locations}
          onClose={() => { setShowRuleModal(false); setEditingRule(null); }}
          onSave={() => fetchDashboardData(firmId)}
          loading={loading}
          plan={firm?.plan || 'TRIAL'}
          firmId={firmId}
          editingRule={editingRule}
          addToast={addToast}
          setShowPricingModal={setShowPricingModal}
        />
      )}

      {showPricingModal && (
        <PricingModal
          onClose={() => setShowPricingModal(false)}
          onUpgrade={handleUpgrade}
          currentPlan={firm?.plan || 'TRIAL'}
        />
      )}

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); height: 0; }
          to { opacity: 1; transform: translateY(0); height: auto; }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        .animate-fadeIn { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slideIn { animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slideUp { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slideDown { animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-pulseDot { animation: pulseDot 2s ease-in-out infinite; }
        
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-3); }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
      `}</style>
    </div>
  )
}
