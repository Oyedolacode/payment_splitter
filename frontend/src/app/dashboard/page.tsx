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

interface ReconciliationJob {
  id: string
  firmId: string
  paymentId: string
  totalAmount: string
  status: JobStatus
  errorMessage?: string
  createdAt: string
  rule?: Rule
  auditEntries: AuditEntry[]
}

interface Firm {
  id: string
  name: string
  plan: 'TRIAL' | 'PRACTICE' | 'SCALE' | 'ELITE'
  qboConnected: boolean
}

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

// ── Constants ───────────────────────────────────────────────────────────────

const API = (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : null) || 'http://localhost:3001'

const STATUS_META: Record<JobStatus, { label: string; color: string }> = {
  COMPLETE: { label: 'Complete', color: '#10b981' },
  PROCESSING: { label: 'Processing', color: '#2d31fa' },
  QUEUED: { label: 'Queued', color: '#71717a' },
  FAILED: { label: 'Failed', color: '#ef4444' },
  ROLLED_BACK: { label: 'Rolled Back', color: '#f59e0b' },
  REVIEW_REQUIRED: { label: 'Action Needed', color: '#8b5cf6' },
  ANOMALY_PAUSED: { label: 'Paused', color: '#ec4899' },
}

// ── Components ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: JobStatus }) {
  const meta = STATUS_META[status] || STATUS_META.QUEUED
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border">
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      <span className="text-[10px] font-800 uppercase tracking-wider text-text-2">{meta.label}</span>
    </div>
  )
}

function LogoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" rx="3" fill="currentColor" />
      <rect x="12" y="1" width="9" height="9" rx="3" fill="currentColor" fillOpacity="0.3" />
      <rect x="1" y="12" width="9" height="9" rx="3" fill="currentColor" fillOpacity="0.3" />
      <rect x="12" y="12" width="9" height="9" rx="3" fill="#10B981" />
    </svg>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
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
    info: 'ℹ',
    warning: '⚠',
  }

  const colors = {
    success: 'bg-[#10b98110] border-[#10b98130] text-[#10b981]',
    error: 'bg-[#ef444410] border-[#ef444430] text-[#ef4444]',
    info: 'bg-[#2d31fa10] border-[#2d31fa30] text-[#2d31fa]',
    warning: 'bg-[#f59e0b10] border-[#f59e0b30] text-[#f59e0b]',
  }

  return (
    <div className={`p-4 pr-12 rounded-2xl border shadow-xl animate-slideIn relative pointer-events-auto min-w-[300px] backdrop-blur-md ${colors[toast.type]}`}>
      <div className="flex items-start gap-3">
        <span className="text-[16px] font-bold">{icons[toast.type]}</span>
        <p className="text-[13px] font-700 leading-tight">{toast.message}</p>
      </div>
      <button onClick={onClose} className="absolute top-4 right-4 opacity-50 hover:opacity-100 transition-opacity">✕</button>
    </div>
  )
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('reconciliation')
  const [firm, setFirm] = useState<Firm | null>(null)
  const [jobs, setJobs] = useState<ReconciliationJob[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [qboConnected, setQboConnected] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [firmId, setFirmId] = useState<string>('')

  const [customers, setCustomers] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [showPricingModal, setShowPricingModal] = useState(false)

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const fetchDashboardData = useCallback(async (fid: string) => {
    if (!fid) return
    try {
      const [fRes, jRes, rRes, aRes, cRes, lRes] = await Promise.all([
        fetch(`${API}/auth/firms/${fid}/status`),
        fetch(`${API}/api/jobs?firmId=${fid}`),
        fetch(`${API}/api/rules?firmId=${fid}`),
        fetch(`${API}/api/jobs/activity?firmId=${fid}`),
        fetch(`${API}/api/qbo/customers?firmId=${fid}`),
        fetch(`${API}/api/qbo/locations?firmId=${fid}`),
      ])

      let firmData = null
      if (fRes.ok) {
        firmData = await fRes.json()
        setFirm(firmData)
        setQboConnected(firmData.qboConnected || false)
      } else {
        setQboConnected(false)
      }

      if (jRes.ok) setJobs(await jRes.json())
      if (rRes.ok) setRules(await rRes.json())
      if (aRes.ok) setActivity(await aRes.json())
      if (cRes.ok) setCustomers(await cRes.json())
      if (lRes.ok) setLocations(await lRes.json())
    } catch (e) {
      addToast('Failed to refresh dashboard data', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    const id = localStorage.getItem('ps_firm_id')
    if (!id) {
      router.push('/')
      return
    }
    setFirmId(id)
    fetchDashboardData(id)

    const interval = setInterval(() => fetchDashboardData(id), 10000)
    return () => clearInterval(interval)
  }, [router, fetchDashboardData])

  const handleManualSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch(`${API}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId }),
      })
      if (!res.ok) throw new Error('Sync failed')
      addToast('Synchronization triggered successfully', 'success')
      fetchDashboardData(firmId)
    } catch (e) {
      addToast('Failed to trigger manual sync', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const deleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return
    try {
      const res = await fetch(`${API}/api/rules/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      addToast('Split rule deleted', 'success')
      fetchDashboardData(firmId)
    } catch (e) {
      addToast('Failed to delete rule', 'error')
    }
  }

  const toggleRule = async (id: string, current: boolean) => {
    try {
      const res = await fetch(`${API}/api/rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !current }),
      })
      if (!res.ok) throw new Error('Update failed')
      addToast(`Rule ${!current ? 'activated' : 'paused'}`, 'success')
      fetchDashboardData(firmId)
    } catch (e) {
      addToast('Failed to toggle rule', 'error')
    }
  }

  const handleUpgrade = async (plan: string) => {
    try {
      const res = await fetch(`${API}/api/stripe/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId, plan }),
      })
      if (!res.ok) throw new Error('Upgrade failed')
      addToast(`Successfully upgraded to ${plan}`, 'success')
      fetchDashboardData(firmId)
      setShowPricingModal(false)
    } catch (e) {
      addToast('Failed to process upgrade', 'error')
    }
  }

  const fmt = (amt: string | number) => Number(amt).toLocaleString(undefined, { minimumFractionDigits: 2 })
  const timeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return new Date(date).toLocaleDateString()
  }

  const getRuleDetails = (rule: Rule) => {
    const { ruleType, ruleConfig } = rule
    if (ruleType === 'proportional' && ruleConfig.weights) {
      return Object.entries(ruleConfig.weights).map(([loc, weight]) => `${loc}: ${weight}%`).join(', ')
    }
    if (ruleType === 'oldest_first' && ruleConfig.locations) {
      return ruleConfig.locations.join(' → ')
    }
    return 'Custom strategy'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-3 font-display font-700 text-[13px] tracking-wide uppercase">Initializing Dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-accent/20 selection:text-accent">
      {/* Toast Overlay */}
      <div className="fixed top-6 right-6 z-[10000] flex flex-col gap-3">
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>

      <nav className="fixed top-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-md border-b border-border z-[100] px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-accent/10 rounded-xl flex items-center justify-center border border-accent/20 text-accent">
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
                                  <div key={i} className="p-4 bg-surface rounded-xl border border-border flex items-center justify-between transition-all hover:bg-surface-2">
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
                    <span className="font-display text-[16px] font-800 text-text">{firm?.plan || 'TRIAL'} Plan</span>
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

      {showRuleModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => setShowRuleModal(false)} />
          <div className="bg-surface border border-border rounded-[32px] w-full max-w-[600px] shadow-2xl relative z-10 animate-slideUp overflow-hidden max-h-[90vh] flex flex-col">
            <header className="p-8 border-b border-border flex items-center justify-between bg-surface-2/50">
              <div>
                <h2 className="font-display text-[20px] font-800 tracking-tight text-text">{editingRule ? 'Edit Split Rule' : 'New Split Rule'}</h2>
                <p className="text-[12px] text-text-3 font-600 mt-1 uppercase tracking-wider">Configure your distribution strategy</p>
              </div>
              <button onClick={() => setShowRuleModal(false)} className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-text-3 hover:bg-surface-3 transition-all">✕</button>
            </header>

            <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
              <RuleForm
                editingRule={editingRule}
                customers={customers}
                locations={locations}
                onSave={async (rule) => {
                  try {
                    const method = editingRule ? 'PATCH' : 'POST'
                    const url = editingRule ? `${API}/api/rules/${editingRule.id}` : `${API}/api/rules`
                    const res = await fetch(url, {
                      method,
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ...rule, firmId }),
                    })
                    if (!res.ok) throw new Error('Save failed')
                    addToast(`Rule ${editingRule ? 'updated' : 'created'} successfully`, 'success')
                    fetchDashboardData(firmId)
                    setShowRuleModal(false)
                  } catch (e) {
                    addToast('Failed to save split rule', 'error')
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showPricingModal && (
        <PricingModal
          currentPlan={firm?.plan || 'TRIAL'}
          onClose={() => setShowPricingModal(false)}
          onUpgrade={handleUpgrade}
        />
      )}
    </div>
  )
}

// ── Secondary Components ───────────────────────────────────────────────────

function RuleForm({ editingRule, customers, locations, onSave }: any) {
  const [ruleType, setRuleType] = useState<RuleType>(editingRule?.ruleType || 'proportional')
  const [parentCustomerId, setParentCustomerId] = useState(editingRule?.parentCustomerId || '')
  const [ruleConfig, setRuleConfig] = useState(editingRule?.ruleConfig || { weights: {}, locations: [] })

  const handleSave = () => {
    if (!parentCustomerId) return alert('Select a parent customer')
    onSave({ ruleType, parentCustomerId, ruleConfig, isActive: true })
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <label className="text-[11px] font-800 text-text-3 uppercase tracking-widest ml-1">Parent Customer (QuickBooks)</label>
        <select
          value={parentCustomerId}
          onChange={(e) => setParentCustomerId(e.target.value)}
          className="bg-surface-2 border border-border text-text rounded-xl p-[14px_20px] text-[14px] font-700 outline-none focus:border-accent appearance-none cursor-pointer"
        >
          <option value="">Select Customer...</option>
          {customers.map((c: any) => (
            <option key={c.id} value={c.displayName}>{c.displayName}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-[11px] font-800 text-text-3 uppercase tracking-widest ml-1">Splitting Strategy</label>
        <div className="grid grid-cols-1 gap-3">
          {[
            { id: 'proportional', label: 'Proportional Split', desc: 'Distribute by percentage weights', icon: '📊' },
            { id: 'oldest_first', label: 'Oldest First', desc: 'Fill invoices from oldest to newest', icon: '⏳' },
            { id: 'location_priority', label: 'Priority Chain', desc: 'Waterfall through locations in order', icon: '🔗' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setRuleType(t.id as RuleType)}
              className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition-all ${ruleType === t.id ? 'bg-accent/5 border-accent shadow-sm' : 'bg-surface hover:bg-surface-2 border-border'}`}
            >
              <span className="text-[20px] mt-1">{t.icon}</span>
              <div className="flex flex-col">
                <span className={`text-[14px] font-800 tracking-tight ${ruleType === t.id ? 'text-accent' : 'text-text'}`}>{t.label}</span>
                <span className="text-[11px] text-text-3 font-600 uppercase tracking-tight mt-0.5">{t.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-8 border-t border-border">
        {ruleType === 'proportional' && (
          <div className="flex flex-col gap-4">
            <span className="text-[11px] font-800 text-text-3 uppercase tracking-widest ml-1">Set Weights (%)</span>
            {locations.map((loc: any) => (
              <div key={loc.id} className="flex items-center justify-between p-4 bg-surface-2 rounded-xl border border-border">
                <span className="text-[13px] font-700 text-text">{loc.name}</span>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={ruleConfig.weights?.[loc.name] || 0}
                    onChange={(e) => setRuleConfig({
                      ...ruleConfig,
                      weights: { ...ruleConfig.weights, [loc.name]: Number(e.target.value) }
                    })}
                    className="w-20 bg-surface border border-border rounded-lg p-2 text-right text-[13px] font-mono font-bold"
                  />
                  <span className="text-text-3 font-bold">%</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {ruleType !== 'proportional' && (
          <div className="p-8 text-center bg-surface-2 rounded-2xl border border-border border-dashed">
            <p className="text-text-3 text-[12px] font-600">Additional configuration for this strategy will appear here.</p>
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        className="w-full p-4 bg-accent text-white rounded-2xl text-[14px] font-800 hover:opacity-90 transition-all shadow-lg mt-4"
      >
        {editingRule ? 'Update Split Rule' : 'Save Split Rule'}
      </button>
    </div>
  )
}

function PricingModal({ currentPlan, onClose, onUpgrade }: any) {
  const plans = [
    { id: 'TRIAL', name: 'Trial', price: '$0', features: ['Manual Syncing', '1 Split Strategy', 'Basic Audits'] },
    { id: 'PRACTICE', name: 'Practice', price: '$49', features: ['Real-time Sync', 'All Split Strategies', 'Priority Support'] },
    { id: 'SCALE', name: 'Scale', price: '$129', features: ['Multi-Firm Access', 'API Access', 'Anomaly Detection'] },
  ]

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="bg-surface border border-border rounded-[40px] w-full max-w-[900px] p-10 relative z-10 shadow-3xl animate-fadeIn">
        <div className="text-center mb-12">
          <h2 className="font-display text-[32px] font-800 tracking-tight text-text mb-3">Upgrade Your Operations</h2>
          <p className="text-text-3 text-[15px]">Scale your financial automation with elite features.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(p => (
            <div key={p.id} className={`p-8 rounded-[32px] border-2 flex flex-col gap-6 transition-all ${currentPlan === p.id ? 'border-accent bg-accent/5' : 'border-border bg-surface'}`}>
              <div className="flex flex-col">
                <span className="text-[11px] font-800 text-text-3 uppercase tracking-widest">{p.name} Plan</span>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-[28px] font-800 text-text tracking-tight">{p.price}</span>
                  <span className="text-[12px] text-text-3 font-bold">/mo</span>
                </div>
              </div>
              <div className="flex flex-col gap-3 flex-1">
                {p.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-accent text-[12px]">✓</span>
                    <span className="text-[13px] font-600 text-text-2">{f}</span>
                  </div>
                ))}
              </div>
              <button
                disabled={currentPlan === p.id}
                onClick={() => onUpgrade(p.id)}
                className={`w-full p-4 rounded-2xl text-[12px] font-800 transition-all ${currentPlan === p.id ? 'bg-border text-text-3' : 'bg-black text-white hover:opacity-90 shadow-md'}`}
              >
                {currentPlan === p.id ? 'Current Plan' : 'Select Plan'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
