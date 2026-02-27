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
  createdAt: string
}

type Tab = 'reconciliation' | 'rules' | 'settings'

type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'ROLLED_BACK'

interface AuditEntry {
  id: string
  subLocationId: string
  invoiceId: string
  amountApplied: string
  qboPaymentId?: string
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

// ── Constants ─────────────────────────────────────────────────────────────────

// FIRM_ID is now handled dynamically in the component
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const STATUS_META: Record<JobStatus, { label: string; color: string }> = {
  COMPLETE: { label: 'Complete', color: '#10b981' },
  FAILED: { label: 'Failed', color: '#ef4444' },
  ROLLED_BACK: { label: 'Rolled Back', color: '#6366f1' },
  PROCESSING: { label: 'Processing', color: '#f59e0b' },
  QUEUED: { label: 'Queued', color: '#2d31fa' },
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

function RuleBuilderModal({
  customers,
  locations,
  onClose,
  onSave,
  loading,
  plan,
  firmId
}: {
  customers: any[],
  locations: any[],
  onClose: () => void,
  onSave: (rule: any) => Promise<void>,
  loading: boolean,
  plan: string,
  firmId: string
}) {
  const isStandard = plan === 'STANDARD' || plan === 'TRIAL'
  const [parentCustomerId, setParentCustomerId] = useState('')
  const [ruleType, setRuleType] = useState<RuleType>('proportional')
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const handleWeightChange = (locId: string, val: string) => {
    setWeights(prev => ({ ...prev, [locId]: Number(val) }))
  }

  const handleSave = async () => {
    if (!parentCustomerId) return alert('Select a parent customer')

    const ruleConfig: any = { type: ruleType }
    if (ruleType === 'proportional') {
      const total = Object.values(weights).reduce((s, w) => s + w, 0)
      if (Math.abs(total - 100) > 0.01) return alert(`Weights must sum to 100% (currently ${total}%)`)
      ruleConfig.weights = weights
    } else {
      ruleConfig.locationIds = locations.map(l => l.Id)
    }

    setSaving(true)
    try {
      await onSave({ firmId, parentCustomerId, ruleConfig })
      onClose()
    } catch (e) {
      console.error(e)
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
          <h2 className={styles.modalTitle}>New Split Rule</h2>
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
                  <button
                    className={`${styles.tabSmall} ${ruleType === 'proportional' ? styles.tabSmallActive : ''}`}
                    onClick={() => setRuleType('proportional')}
                  >
                    Proportional (%)
                  </button>
                  <button
                    className={`${styles.tabSmall} ${ruleType === 'oldest_first' ? styles.tabSmallActive : ''} ${isStandard ? styles.tabSmallDisabled : ''}`}
                    onClick={() => !isStandard && setRuleType('oldest_first')}
                  >
                    Oldest First (Waterfall) {isStandard && '🔒'}
                  </button>
                </div>
                {isStandard && (
                  <div className={styles.planNoticeSmall}>
                    {plan === 'TRIAL' ? 'Trial' : 'Standard'} plan only supports Proportional spltting. <span className={styles.upgradeLink} onClick={onClose}>Upgrade to Pro</span> for Waterfall logic.
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

              {ruleType === 'oldest_first' && (
                <div className={styles.infoBox}>
                  <strong>Waterfall Strategy:</strong> Payments will be applied to the oldest open invoices across all active sub-locations until the balance is zero.
                </div>
              )}

              {ruleType === 'proportional' && (
                <div className={styles.summary}>
                  <div className={styles.summaryValue}>
                    <span className={styles.totalLabel}>Total Allocation</span>
                    <span className={styles.totalVal} style={{ color: totalWeight === 100 ? '#10b981' : '#ef4444' }}>
                      {totalWeight}%
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.secondaryBtn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className={styles.primaryBtn}
            onClick={handleSave}
            disabled={saving || loading || isEmpty || (ruleType === 'proportional' && totalWeight !== 100)}
          >
            {saving ? 'Creating...' : 'Create Rule'}
          </button>
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
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [loadingQBO, setLoadingQBO] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  const fetchJobs = useCallback(async (id: string) => {
    if (!id) return
    try {
      const res = await fetch(`${API}/api/jobs?firmId=${id}`)
      const data = await res.json()
      setJobs(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch jobs:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchRules = useCallback(async (id: string) => {
    if (!id) return
    try {
      const res = await fetch(`${API}/api/rules?firmId=${id}`)
      const data = await res.json()
      setRules(data)
    } catch (e) {
      console.error('Failed to fetch rules:', e)
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
    }
  }, [])

  const fetchQBOData = useCallback(async (id: string) => {
    if (!id) return
    setLoadingQBO(true)
    try {
      const [cRes, lRes] = await Promise.all([
        fetch(`${API}/api/qbo/customers?firmId=${id}`),
        fetch(`${API}/api/qbo/locations?firmId=${id}`)
      ])
      if (cRes.ok) setCustomers(await cRes.json())
      if (lRes.ok) setLocations(await lRes.json())
    } catch (e) {
      console.error('Failed to fetch QBO data:', e)
    } finally {
      setLoadingQBO(false)
    }
  }, [])

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

  async function retryJob(e: React.MouseEvent, jobId: string) {
    e.stopPropagation()
    setRetrying(jobId)
    try {
      await fetch(`${API}/api/jobs/${jobId}/retry`, { method: 'POST' })
      await fetchJobs(firmId)
    } finally {
      setRetrying(null)
    }
  }

  function toggleRow(jobId: string) {
    setSelected(prev => prev === jobId ? null : jobId)
  }

  async function toggleRule(ruleId: string, isActive: boolean) {
    try {
      await fetch(`${API}/api/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      })
      await fetchRules(firmId)
    } catch (e) {
      console.error('Failed to toggle rule:', e)
    }
  }

  async function deleteRule(ruleId: string) {
    if (!confirm('Are you sure you want to delete this rule?')) return
    try {
      await fetch(`${API}/api/rules/${ruleId}`, { method: 'DELETE' })
      await fetchRules(firmId)
    } catch (e) {
      console.error('Failed to delete rule:', e)
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
        throw new Error(err.error || 'Failed to create rule')
      }
      await fetchRules(firmId)
      alert('Rule created successfully!')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create rule')
    }
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const complete = jobs.filter(j => j.status === 'COMPLETE')
  const failed = jobs.filter(j => j.status === 'FAILED' || j.status === 'ROLLED_BACK')
  const totalProcessed = complete.reduce((s, j) => s + Number(j.totalAmount), 0)
  const totalSplits = complete.reduce((s, j) => s + j.auditEntries.length, 0)
  const successRate = jobs.length ? Math.round((complete.length / jobs.length) * 100) : null

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
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to start checkout')
      if (data.url) window.location.href = data.url
    } catch (e: any) {
      alert(e.message || 'Failed to start checkout')
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

          <nav className={`${styles.headerNav} ${showMobileMenu ? styles.headerNavMobile : ''}`}>
            <button
              className={`${styles.navItem} ${tab === 'reconciliation' ? styles.navItemActive : ''}`}
              onClick={() => { setTab('reconciliation'); setShowMobileMenu(false) }}
            >
              Reconciliation
            </button>
            <button
              className={`${styles.navItem} ${tab === 'rules' ? styles.navItemActive : ''}`}
              onClick={() => { setTab('rules'); setShowMobileMenu(false) }}
            >
              Rules
            </button>
            <button
              className={`${styles.navItem} ${tab === 'settings' ? styles.navItemActive : ''}`}
              onClick={() => { setTab('settings'); setShowMobileMenu(false) }}
            >
              Settings
            </button>
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

        {/* Upgrade Banner for TRIAL/STANDARD */}
        {(firm?.plan === 'TRIAL' || firm?.plan === 'STANDARD') && tab === 'reconciliation' && (
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
            <button className={styles.upgradeBtn} onClick={() => setTab('settings')}>
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
                  if ((firm?.plan === 'TRIAL' || firm?.plan === 'STANDARD') && rules.length >= 3) {
                    alert(`${firm?.plan} plan allows a maximum of 3 rules. Upgrade to Professional to unlock unlimited rules.`)
                    return
                  }
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
                          <td><span className={styles.ruleType}>{rule.ruleType}</span></td>
                          <td>
                            <div className={styles.mono} style={{ fontSize: '11px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {rule.ruleType === 'proportional'
                                ? Object.entries(rule.ruleConfig.weights as Record<string, number>).map(([id, w]) => {
                                  const loc = locations.find(l => String(l.Id) === String(id))
                                  return `${loc?.Name || `Location ${id}`}: ${w}%`
                                }).join(', ')
                                : 'Oldest first waterfall'
                              }
                            </div>
                          </td>
                          <td>
                            <button
                              className={`${styles.statusToggle} ${rule.isActive ? styles.toggleOn : styles.toggleOff}`}
                              onClick={() => toggleRule(rule.id, !rule.isActive)}
                            >
                              {rule.isActive ? 'Active' : 'Disabled'}
                            </button>
                          </td>
                          <td><span className={styles.timeCell}>{new Date(rule.createdAt).toLocaleDateString()}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className={styles.secondaryBtn} style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => alert('Editing coming soon')}>Edit</button>
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
                    <button className={styles.primaryBtn} onClick={() => alert('Manage billing coming soon')} style={{ padding: '8px 12px', fontSize: '12px' }}>
                      Manage billing →
                    </button>
                  ) : (
                    <div className={styles.mono} style={{ color: 'var(--text-3)' }}>
                      BASIC
                    </div>
                  )}
                </div>
                <div className={styles.settingsRow}>
                  <div>
                    <div className={styles.settingsLabel}>Firm Account</div>
                    <div className={styles.settingsSub}>ID: {firm?.id}</div>
                  </div>
                  <div className={styles.mono}>{firm?.name}</div>
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

            {/* Billing Section in Settings */}
            {(firm?.plan === 'TRIAL' || firm?.plan === 'STANDARD') && (
              <div className={styles.billingCard}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>Subscription Plans</span>
                </div>
                <div className={styles.billingGrid}>
                  <div className={styles.planMini}>
                    <div className={styles.planMiniName}>Standard</div>
                    <div className={styles.planMiniPrice}>$149<span>/mo</span></div>
                    <button className={styles.planMiniBtn} onClick={() => handleUpgrade('standard')}>Choose</button>
                  </div>
                  <div className={`${styles.planMini} ${styles.planMiniFeatured}`}>
                    <div className={styles.planMiniName}>Professional</div>
                    <div className={styles.planMiniPrice}>$349<span>/mo</span></div>
                    <button className={styles.primaryBtn} onClick={() => handleUpgrade('professional')}>Upgrade</button>
                  </div>
                  <div className={styles.planMini}>
                    <div className={styles.planMiniName}>Practice</div>
                    <div className={styles.planMiniPrice}>$799<span>/mo</span></div>
                    <button className={styles.planMiniBtn} onClick={() => handleUpgrade('practice')}>Choose</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}


        {showRuleModal && (
          <RuleBuilderModal
            customers={customers}
            locations={locations}
            onClose={() => setShowRuleModal(false)}
            onSave={createRule}
            loading={loadingQBO}
            plan={firm?.plan || 'trial'}
            firmId={firmId}
          />
        )}

        {showLogoutModal && (
          <div className={styles.overlay} onClick={() => setShowLogoutModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <h2 className={styles.modalTitle} style={{ fontSize: '18px', marginBottom: '8px' }}>Sign Out</h2>
              <p className={styles.modalSub}>Are you sure you want to log out of your account?</p>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  className={styles.secondaryBtn}
                  style={{ flex: 1, padding: '12px', fontSize: '13px' }}
                  onClick={() => setShowLogoutModal(false)}
                >
                  Cancel
                </button>
                <button
                  className={styles.primaryBtn}
                  style={{ flex: 1, padding: '12px', fontSize: '13px', background: 'var(--red)', borderColor: 'var(--red)', color: 'white' }}
                  onClick={handleLogout}
                >
                  Sign Out
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
