'use client'

import { useEffect, useState, useCallback } from 'react'
import styles from './dashboard.module.css'
import { ThemeToggle } from '../../components/ThemeToggle'

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
      className={styles.badge}
      style={{ color, borderColor: `${color}28`, background: `${color}10` }}
    >
      <span
        className={styles.badgeDot}
        style={{
          background: color,
          animation: status === 'PROCESSING' ? 'pulseDot 1.2s ease-in-out infinite' : 'none',
        }}
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

  return (
    <div
      className={`${styles.globToast} ${styles[`globToast_${toast.type}`]}`}
      onClick={onClose}
    >
      <div className={styles.globToastIcon}>{icons[toast.type]}</div>
      <div className={styles.globToastMessage}>{toast.message}</div>
    </div>
  )
}

// ── Chevron icon ──────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
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
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.pricingModal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader} style={{ padding: '32px 32px 0' }}>
          <h2 className={styles.modalTitle}>Upgrade Your Splitter</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.pricingGridModal}>
          <div className={styles.planCard}>
            <div className={styles.planName}>Standard</div>
            <div className={styles.planPrice}>$149<span>/mo</span></div>
            <div className={styles.planFeature}>Up to 3 rules</div>
            <button
              className={styles.planBtn}
              onClick={() => onUpgrade('standard')}
              disabled={currentPlan === 'STANDARD'}
            >
              {currentPlan === 'STANDARD' ? 'Current Plan' : 'Select Standard'}
            </button>
          </div>

          <div className={`${styles.planCard} ${styles.planActive}`}>
            <div className={styles.planBadge}>RECOMMENDED</div>
            <div className={styles.planName}>Professional</div>
            <div className={styles.planPrice}>$349<span>/mo</span></div>
            <div className={styles.planFeature}>Unlimited rules & Waterfall</div>
            <button
              className={styles.primaryBtn}
              style={{ width: '100%', marginTop: 'auto' }}
              onClick={() => onUpgrade('professional')}
              disabled={currentPlan === 'PROFESSIONAL'}
            >
              {currentPlan === 'PROFESSIONAL' ? 'Current Plan' : 'Upgrade to Pro'}
            </button>
          </div>

          <div className={styles.planCard}>
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
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{editingRule ? 'Edit Split Rule' : 'New Split Rule'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          {loading ? (
            <div className={styles.loadingRows}>
              <div className={styles.skeleton} style={{ height: '40px' }} />
              <div className={styles.skeleton} style={{ height: '40px' }} />
              <div className={styles.skeleton} style={{ height: '120px' }} />
            </div>
          ) : isEmpty ? (
            <div className={styles.empty} style={{ padding: '20px' }}>
              <div className={styles.emptyTitle}>No QBO Data Available</div>
              <div className={styles.emptySub}>
                We couldn't find any customers or locations in your QuickBooks account.
                Please ensure you have sub-customers created to split payments across.
              </div>
            </div>
          ) : (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Parent Customer (where payments arrive)</label>
                <select
                  className={styles.select}
                  value={parentCustomerId}
                  onChange={e => setParentCustomerId(e.target.value)}
                >
                  <option value="">Select a customer...</option>
                  {customers.map(c => (
                    <option key={c.Id} value={c.Id}>{c.DisplayName}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Allocation Strategy</label>
                <div className={styles.tabsSmall}>
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
                        className={`${styles.tabSmall} ${isActive ? styles.tabSmallActive : ''} ${isLocked ? styles.tabSmallDisabled : ''}`}
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
                  <div className={styles.planNoticeSmall}>
                    {currentPlan} plan does not support this strategy. <span className={styles.upgradeLink} onClick={() => { onClose(); setShowPricingModal(true); }}>Upgrade to {ruleType === 'location_priority' ? 'Practice' : 'Professional'}</span> to edit or create new {ruleType.replace('_', ' ')} rules.
                  </div>
                )}
                {isRuleTypeLocked && (
                  <div className={styles.errorBox} style={{ marginTop: '12px', fontSize: '12px' }}>
                    <span>⚠️</span>
                    <span>This rule is currently <strong>locked</strong> due to a plan change. You can toggle it on/off, but cannot modify its configuration or strategy.</span>
                  </div>
                )}
              </div>

              {ruleType === 'proportional' && (
                <div className={styles.weightsGrid}>
                  <label className={styles.label}>Location Weights (Must sum to 100%)</label>
                  {locations.map(loc => (
                    <div key={loc.Id} className={styles.weightRow}>
                      <span className={styles.weightName}>{loc.Name}</span>
                      <div className={styles.weightInputGroup}>
                        <input
                          type="number"
                          className={styles.weightInput}
                          placeholder="0"
                          value={weights[loc.Id] || ''}
                          onChange={e => handleWeightChange(loc.Id, e.target.value)}
                        />
                        <span className={styles.weightUnit}>%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}


              {(ruleType === 'oldest_first' || ruleType === 'location_priority') && (
                <div className={styles.orderSection} style={{ opacity: isRuleTypeLocked ? 0.6 : 1, pointerEvents: isRuleTypeLocked ? 'none' : 'auto' }}>
                  <label className={styles.label}>
                    {ruleType === 'oldest_first' ? 'Settlement Priority (Waterfall Order)' : 'Location Priority Order'}
                  </label>
                  <p className={styles.settingsSub} style={{ marginBottom: '12px' }}>
                    {ruleType === 'oldest_first'
                      ? 'Payments will fully cover the oldest invoices at Location 1 first, then Location 2, etc.'
                      : 'Each location listed will be fully cleared of all open invoices before any funds are applied to the next location.'}
                  </p>
                  <div className={styles.orderList}>
                    {order.map((locId, idx) => {
                      const loc = locations.find(l => String(l.Id) === String(locId))
                      return (
                        <div key={locId} className={styles.orderItem}>
                          <div className={styles.orderBadge}>{idx + 1}</div>
                          <div className={styles.orderName}>{loc?.Name || `Location ${locId}`}</div>
                          {!isRuleTypeLocked && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                className={styles.secondaryBtn}
                                style={{ padding: '4px', fontSize: '10px' }}
                                onClick={() => moveOrder(idx, 'up')}
                                disabled={idx === 0}
                              >
                                ↑
                              </button>
                              <button
                                className={styles.secondaryBtn}
                                style={{ padding: '4px', fontSize: '10px' }}
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

              <div className={styles.modalFooter}>
                <button className={styles.secondaryBtn} onClick={onClose} disabled={saving}>Cancel</button>
                <button
                  className={styles.primaryBtn}
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
      const data = await res.json()
      if (res.ok) {
        setJobs(Array.isArray(data) ? data : [])
      } else {
        addToast(`Failed to fetch jobs: ${data.details || data.error || res.statusText}`, 'error')
      }
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
      window.location.href = '/'
      return
    }

    setFirmId(activeId)
    if (params.get('connected') === 'true') setConnected(true)

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
      {/* Background */}
      <div className={styles.gridBg} aria-hidden="true" />
      <div className={styles.glowPurple} aria-hidden="true" />
      <div className={styles.glowGreen} aria-hidden="true" />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className={`${styles.header} ${showMobileMenu ? styles.headerMenuOpen : ''}`}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <LogoIcon />
            PaySplit
          </div>

          <nav className={styles.nav}>
            <div className={styles.navLinks}>
              <button className={`${styles.navLink} ${tab === 'reconciliation' ? styles.navLinkActive : ''}`} onClick={() => { setTab('reconciliation'); setShowMobileMenu(false) }}>
                Reconciliation
              </button>
              <button className={`${styles.navLink} ${tab === 'rules' ? styles.navLinkActive : ''}`} onClick={() => { setTab('rules'); fetchRules(firmId); setShowMobileMenu(false) }}>
                Routing Rules
              </button>
              <button className={`${styles.navLink} ${tab === 'audit' ? styles.navLinkActive : ''}`} onClick={() => { setTab('audit'); fetchActivity(firmId); setShowMobileMenu(false) }}>
                Audit Feed
              </button>
              <button className={`${styles.navLink} ${tab === 'remittance' ? styles.navLinkActive : ''}`} onClick={() => { setTab('remittance'); setShowMobileMenu(false) }}>
                CSV Remittance
              </button>
              <button className={`${styles.navLink} ${tab === 'ap' ? styles.navLinkActive : ''}`} onClick={() => { setTab('ap'); setShowMobileMenu(false) }}>
                AP Bills
              </button>
              <button className={`${styles.navLink} ${tab === 'trust' ? styles.navLinkActive : ''}`} onClick={() => { setTab('trust'); setShowMobileMenu(false) }}>
                Trust
              </button>
              <button className={`${styles.navLink} ${tab === 'settings' ? styles.navLinkActive : ''}`} onClick={() => { setTab('settings'); setShowMobileMenu(false) }}>
                Settings
              </button>
            </div>
            <div className={styles.navMobileOnly}>
              <div className={styles.firmNameMobile}>
                {firm?.name || 'Loading...'}
              </div>
              <button className={styles.logoutBtnMobile} onClick={confirmLogout}>
                Sign Out
              </button>
            </div>
          </nav>

          <div className={styles.headerRight}>
            <div className={styles.headerRightDesktop}>
              <ThemeToggle />
              {firm?.plan === 'PROFESSIONAL' && (
                <div className={styles.proBadge}>PRO</div>
              )}
              {firm?.plan === 'PRACTICE' && (
                <div className={styles.practiceBadge}>PRACTICE</div>
              )}
              <div className={styles.firmName}>
                {firm?.name || 'Loading firm...'}
              </div>
              <div className={styles.qboBadge}>
                <span className={styles.qboDot} />
                QBO Connected
              </div>
              <button className={styles.logoutBtn} onClick={confirmLogout} aria-label="Log out" title="Log out">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
            <div className={styles.headerRightMobile}>
              <ThemeToggle />
              <button
                className={styles.menuToggle}
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                aria-label="Toggle menu"
              >
                {showMobileMenu ? '✕' : '☰'}
              </button>
            </div>
          </div>
        </div>
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
          <div className={styles.upgradeBanner} style={{ background: 'var(--bg-card)', border: '1px solid #ef4444' }}>
            <div className={styles.upgradeContent}>
              <span className={styles.upgradeIcon}>🚫</span>
              <div>
                <div className={styles.upgradeTitle} style={{ color: '#ef4444' }}>
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
                <div className={styles.statValue} style={{ color: '#10b981' }}>${fmt(totalProcessed)}</div>
                <div className={styles.statSub} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{complete.length} payment{complete.length !== 1 ? 's' : ''}</span>
                  {momDelta !== null && (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '1px 5px',
                      borderRadius: '4px',
                      background: momDelta >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      color: momDelta >= 0 ? '#10b981' : '#ef4444'
                    }}>
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
                  className={styles.statValue}
                  style={{ color: failed.length > 0 ? '#ef4444' : undefined }}
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
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Payment Jobs</span>
                <span className={styles.cardCount}>{jobs.length} total</span>
              </div>

              {loading ? (
                <div className={styles.loadingRows}>
                  {[1, 2, 3].map(i => (
                    <div key={i} className={styles.skeleton} style={{ opacity: 1.1 - i * 0.3 }} />
                  ))}
                </div>
              ) : jobs.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon}>⚡</span>
                  <div className={styles.emptyTitle}>Waiting for payments</div>
                  <div className={styles.emptySub}>
                    Jobs appear automatically when QBO payments are received via webhook.
                  </div>
                </div>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <colgroup>
                      <col /><col /><col /><col /><col /><col /><col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Payment ID</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Splits</th>
                        <th>Rule</th>
                        <th>When</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job, i) => {
                        const isOpen = selected === job.id
                        return (
                          <>
                            <tr
                              key={job.id}
                              className={`${styles.row} ${isOpen ? styles.rowSelected : ''}`}
                              onClick={() => toggleRow(job.id)}
                              style={{ animationDelay: `${i * 35}ms` }}
                              aria-expanded={isOpen}
                            >
                              <td>
                                <span className={styles.mono}>
                                  {job.paymentId.length > 24
                                    ? job.paymentId.slice(0, 24) + '…'
                                    : job.paymentId}
                                </span>
                              </td>
                              <td>
                                <span className={styles.amountCell}>${fmt(job.totalAmount)}</span>
                              </td>
                              <td>
                                <StatusBadge status={job.status} />
                              </td>
                              <td>
                                <span className={styles.splitCount}>
                                  {job.auditEntries.length} invoice{job.auditEntries.length !== 1 ? 's' : ''}
                                </span>
                              </td>
                              <td>
                                {job.rule?.ruleType
                                  ? <span className={styles.ruleType}>{job.rule.ruleType}</span>
                                  : <span className={styles.mono}>—</span>
                                }
                              </td>
                              <td>
                                <span className={styles.timeCell}>{timeAgo(job.createdAt)}</span>
                              </td>
                              <td>
                                <div className={styles.rowActions}>
                                  {(job.status === 'FAILED' || job.status === 'ROLLED_BACK') && (
                                    <button
                                      className={styles.retryBtn}
                                      onClick={e => retryJob(e, job.id)}
                                      disabled={retrying === job.id}
                                    >
                                      {retrying === job.id ? '···' : 'Retry'}
                                    </button>
                                  )}
                                  {job.status === 'REVIEW_REQUIRED' && (
                                    <button
                                      className={styles.approveBtn}
                                      onClick={e => approveJob(e, job.id)}
                                      disabled={retrying === job.id}
                                      style={{ background: '#ec4899', borderColor: '#db2777' }}
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
                              <tr key={`${job.id}-audit`} className={styles.auditRow}>
                                <td colSpan={7}>
                                  <div className={styles.auditPanel}>

                                    {job.errorMessage && (
                                      <div className={styles.errorBox}>
                                        <span>⚠</span>
                                        <span>{job.errorMessage}</span>
                                      </div>
                                    )}

                                    <div className={styles.auditGrid}>
                                      <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                          <div className={styles.auditTitle} style={{ marginBottom: 0 }}>Audit Trail</div>
                                          <button className={styles.printBtn} onClick={() => window.print()} title="Export to PDF">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                              <polyline points="7 10 12 15 17 10" />
                                              <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                            PDF
                                          </button>
                                        </div>
                                        <table className={styles.auditTable}>
                                          <thead>
                                            <tr>
                                              <th>Sub-Location</th>
                                              <th>Invoice</th>
                                              <th>Amount Applied</th>
                                              <th>QBO Payment ID</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {job.auditEntries.map(entry => (
                                              <tr key={entry.id}>
                                                <td><span className={styles.mono}>{entry.subLocationId}</span></td>
                                                <td><span className={styles.mono}>{entry.invoiceId}</span></td>
                                                <td>
                                                  <span style={{ color: '#10b981', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                                                    ${fmt(entry.amountApplied)}
                                                  </span>
                                                </td>
                                                <td>
                                                  <span className={styles.mono} style={{ color: 'var(--text-3)' }}>
                                                    {entry.qboPaymentId ?? '—'}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr>
                                              <td colSpan={2} style={{ color: 'var(--text-3)', fontSize: 11 }}>
                                                Total allocated
                                              </td>
                                              <td>
                                                <span style={{ color: '#10b981', fontWeight: 800, fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '-0.3px' }}>
                                                  ${fmt(job.auditEntries.reduce((s, e) => s + Number(e.amountApplied), 0))}
                                                </span>
                                              </td>
                                              <td />
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>

                                      <div>
                                        <div className={styles.auditTitle}>Job Details</div>
                                        <div className={styles.metaPanel}>
                                          {[
                                            ['Job ID', job.id.slice(0, 8) + '…'],
                                            ['Payment ID', job.paymentId.slice(0, 16) + (job.paymentId.length > 16 ? '…' : '')],
                                            ['Rule type', job.rule?.ruleType ?? '—'],
                                            ['Created', new Date(job.createdAt).toLocaleString()],
                                            ...(job.completedAt
                                              ? [['Completed', new Date(job.completedAt).toLocaleString()]]
                                              : []),
                                          ].map(([k, v]) => (
                                            <div key={k} className={styles.metaRow}>
                                              <span className={styles.metaKey}>{k}</span>
                                              <span className={styles.metaVal}>{v}</span>
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
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Remittance Uploads</span>
              <button className={styles.primaryBtn} onClick={() => setShowPricingModal(true)}>Upload CSV...</button>
            </div>
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📄</span>
              <div className={styles.emptyTitle}>Upload Remittance History</div>
              <div className={styles.emptySub}>Upload bulk clearing lists from payment providers directly. Support for this feature requires Professional plan or higher.</div>
            </div>
          </div>
        )}

        {tab === 'ap' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>AP Bill Splitting</span>
            </div>
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📤</span>
              <div className={styles.emptyTitle}>Split AP Bills Automatically</div>
              <div className={styles.emptySub}>Accounts Payable bill splitting is an upcoming feature. Automate vendor disbursement across branches.</div>
            </div>
          </div>
        )}

        {tab === 'trust' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Trust Accounting</span>
            </div>
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>🏛️</span>
              <div className={styles.emptyTitle}>Trust Ledger Management</div>
              <div className={styles.emptySub}>Manage pre-funded retainers, trust-to-operating transfers, and compliance reporting. Feature currently in beta.</div>
            </div>
          </div>
        )}

        {tab === 'rules' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Payment Routing Rules</span>
              {(firm?.plan === 'TRIAL' || firm?.plan === 'STANDARD') && (
                <span className={styles.cardCount} style={{ marginLeft: '12px' }}>
                  {rules.length} of 3 rules used
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button
                className={styles.secondaryBtn}
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
                <span style={{ fontSize: '16px', fontWeight: 600, marginRight: '4px' }}>+</span> New Rule
              </button>
            </div>

            {rules.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>⚖️</span>
                <div className={styles.emptyTitle}>No rules yet</div>
                <div className={styles.emptySub}>Rules determine how payments are split between your branch locations.</div>
              </div>
            ) : (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Parent Customer</th>
                      <th>Type</th>
                      <th>Weights / Order</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => {
                      const parent = customers.find(c => c.Id === rule.parentCustomerId)
                      return (
                        <tr key={rule.id} className={styles.row}>
                          <td>
                            <div className={styles.customerName}>{parent?.DisplayName || `Customer ${rule.parentCustomerId}`}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span className={styles.ruleType}>{rule.ruleType}</span>
                              {rule.isLocked && <span title={`Locked: ${rule.lockedReason}`} style={{ cursor: 'help' }}>🔒</span>}
                            </div>
                          </td>
                          <td>
                            <div className={styles.mono} style={{ fontSize: '11px', maxWidth: '300px' }}>
                              {rule.ruleType === 'proportional'
                                ? Object.entries(rule.ruleConfig.weights as Record<string, number>).map(([id, w]) => {
                                  const loc = locations.find(l => String(l.Id) === String(id) || String(l.id) === String(id))
                                  return (
                                    <span key={id} className={styles.priorityPill} style={{ marginRight: '4px', marginBottom: '4px', display: 'inline-block' }}>
                                      {loc?.Name || loc?.name || `Location ${id}`}: {w}%
                                    </span>
                                  )
                                })
                                : (
                                  <div className={styles.badgePriority}>
                                    {(rule.ruleConfig.locationIds as string[]).map((locId, idx) => {
                                      const loc = locations.find(l => String(l.Id) === String(locId) || String(l.id) === String(locId))
                                      return (
                                        <span key={locId} className={styles.priorityPill}>
                                          {idx + 1}. {loc?.Name || loc?.name || `Location ${locId}`}
                                        </span>
                                      )
                                    })}
                                  </div>
                                )
                              }
                            </div>
                          </td>
                          <td>
                            <button
                              className={`${styles.statusToggle} ${rule.isActive ? styles.toggleOn : styles.toggleOff}`}
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
                          <td><span className={styles.timeCell}>{new Date(rule.createdAt).toLocaleDateString()}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                className={styles.secondaryBtn}
                                style={{ padding: '4px 8px', fontSize: '10px', opacity: rule.isLocked || !hasAccess ? 0.7 : 1 }}
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
                              <button className={styles.deleteBtn} onClick={() => deleteRule(rule.id)}>Delete</button>
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

        {tab === 'settings' && (
          <div className={styles.settingsGrid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Account Connection</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>QuickBooks Online</div>
                    <div className={styles.settingsSub}>Connected to Realm ID: {firm?.qboRealmId || 'None'}</div>
                  </div>
                  <a
                    href={`${API}/auth/qbo/connect?firmId=${firmId}`}
                    className={styles.primaryBtn}
                    style={{ textDecoration: 'none', textAlign: 'center' }}
                  >
                    {firm?.connected ? 'Reconnect QBO' : 'Connect QBO'}
                  </a>
                </div>
                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Subscription Plan</div>
                    <div className={styles.settingsSub}>Current tier: {firm?.plan || 'TRIAL'}</div>
                  </div>
                  {firm?.plan !== 'TRIAL' ? (
                    <button className={styles.primaryBtn} onClick={() => setShowPricingModal(true)} style={{ padding: '8px 12px', fontSize: '12px' }}>
                      Change plan →
                    </button>
                  ) : (
                    <button className={styles.primaryBtn} onClick={() => setShowPricingModal(true)} style={{ padding: '8px 12px', fontSize: '12px' }}>
                      Upgrade →
                    </button>
                  )}
                </div>
                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Allocation Enforcement</div>
                    <div className={styles.settingsSub}>Choose how payments are posted to QBO.</div>
                    <div className={styles.modeToggle} style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <button
                        className={`${styles.pillBtn} ${firm?.allocationMode === 'AUTO' ? styles.active : ''}`}
                        onClick={() => updateAllocationMode('AUTO')}
                        style={{
                          background: firm?.allocationMode === 'AUTO' ? 'var(--accent)' : 'var(--bg-card)',
                          color: firm?.allocationMode === 'AUTO' ? 'white' : 'var(--text-2)',
                          padding: '6px 12px', borderRadius: '20px', fontSize: '12px', border: '1px solid var(--border)'
                        }}
                      >
                        Auto-Post (Instant)
                      </button>
                      <button
                        className={`${styles.pillBtn} ${firm?.allocationMode === 'REVIEW' ? styles.active : ''}`}
                        onClick={() => updateAllocationMode('REVIEW')}
                        style={{
                          background: firm?.allocationMode === 'REVIEW' ? '#ec4899' : 'var(--bg-card)',
                          color: firm?.allocationMode === 'REVIEW' ? 'white' : 'var(--text-2)',
                          padding: '6px 12px', borderRadius: '20px', fontSize: '12px', border: '1px solid var(--border)'
                        }}
                      >
                        Manual Review
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Notifications</span>
              </div>
              <div className={styles.cardBody}>
                <p className={styles.subtitle} style={{ padding: '0 24px 24px' }}>Webhooks and email alerts are active for all failed jobs.</p>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Advanced Integrations</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Xero Integration</div>
                    <div className={styles.settingsSub}>Sync payments and reconciliations with Xero (Coming soon)</div>
                  </div>
                  <button className={styles.secondaryBtn} disabled>Connect Xero</button>
                </div>
                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Multi-Entity Portal</div>
                    <div className={styles.settingsSub}>Manage multiple QBO files under one firm roof</div>
                  </div>
                  <button className={styles.secondaryBtn} onClick={() => addToast('Multi-Entity setup requires Practice Plan. Contact sales.', 'info')}>Configure</button>
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>Security & Branding</span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Fraud & Anomaly Detection</div>
                    <div className={styles.settingsSub}>Automatically pause payments above $5,000 for manual review</div>
                  </div>
                  <button className={`${styles.statusToggle} ${styles.toggleOn}`}>Active</button>
                </div>
                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>White-label Reporting</div>
                    <div className={styles.settingsSub}>Use your firm's logo and branding on audit reports</div>
                  </div>
                  <button className={styles.secondaryBtn} onClick={() => addToast('White-label is a Practice Plan exclusive.', 'info')}>Customize</button>
                </div>
              </div>
            </div>

          </div>
        )}

        {tab === 'audit' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Audit Feed</span>
              <div style={{ flex: 1 }} />
              <button className={styles.secondaryBtn} style={{ marginRight: '8px' }} onClick={() => addToast('Bulk export queued. You will receive an email shortly.', 'info')}>
                ⬇ Bulk Attachment Export
              </button>
              <button className={styles.secondaryBtn} onClick={() => fetchActivity(firmId)}>Refresh</button>
            </div>
            {activity.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>📜</span>
                <div className={styles.emptyTitle}>No activity logged yet</div>
              </div>
            ) : (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
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
                        <tr key={log.id} className={styles.row}>
                          <td><span className={styles.timeCell}>{new Date(log.createdAt).toLocaleString()}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sevColor }} />
                              <span className={styles.mono} style={{ fontWeight: 600 }}>{log.type}</span>
                            </div>
                          </td>
                          <td>
                            <span className={styles.badge} style={{ fontSize: '9px', padding: '2px 6px', background: `${actorColor}20`, color: actorColor, borderColor: `${actorColor}40` }}>
                              {log.actorType}
                            </span>
                          </td>
                          <td>
                            <div className={styles.metaSub} style={{ fontSize: '11px', maxWidth: '400px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {JSON.stringify(log.details)}
                            </div>
                          </td>
                          <td><span className={styles.mono} style={{ fontSize: '10px' }}>{log.jobId?.slice(0, 8) || '—'}</span></td>
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
        <div className={styles.toastContainer}>
          {toasts.map(t => (
            <Toast key={t.id} toast={t} onClose={() => removeToast(t.id)} />
          ))}
        </div>

        {showDeleteModal && (
          <div className={styles.overlay} onClick={() => setShowDeleteModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <h2 className={styles.modalTitle} style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--red)' }}>Delete Rule</h2>
              <p className={styles.modalSub}>Are you sure you want to permanently delete this rule? This cannot be undone.</p>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  className={styles.secondaryBtn}
                  style={{ flex: 1, padding: '12px', fontSize: '13px' }}
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button
                  className={styles.primaryBtn}
                  style={{ flex: 1, padding: '12px', fontSize: '13px', background: 'var(--red)', border: 'none', color: 'white' }}
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
        <div className={styles.logoutOverlay} onClick={() => setShowLogoutModal(false)}>
          <div className={styles.logoutModal} onClick={e => e.stopPropagation()}>
            <div className={styles.logoutModalIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </div>
            <h2 className={styles.logoutModalTitle}>Sign Out</h2>
            <p className={styles.logoutModalBody}>Are you sure you want to sign out? You&apos;ll need to re-enter your firm ID to access your dashboard.</p>
            <div className={styles.logoutModalActions}>
              <button
                className={styles.secondaryBtn}
                style={{ flex: 1, padding: '11px' }}
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
              <button
                className={styles.logoutConfirmBtn}
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
