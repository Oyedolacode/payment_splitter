'use client'

import { useEffect, useState, useCallback, useMemo, useRef, Fragment } from 'react'
import { ThemeToggle } from '../../components/common/ThemeToggle'
import { StatusBadge } from '../../components/common/StatusBadge'
import { Toast } from '../../components/common/Toast'
import { 
  LogoIcon, Chevron, CheckIcon, XIcon, InfoIcon, 
  AlertIcon, ZapIcon, LayersIcon, ScaleIcon, 
  ShieldIcon, BarChartIcon, SettingsIcon, PlusIcon, SparklesIcon, DollarIcon, ActivityIcon, LockIcon 
} from '../../components/common/Icons'
import { fmt, deriveStatus } from '../../lib/formatters'
import { timeAgo } from '../../lib/utils'
import { STATUS_META } from '../../constants/status'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

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
  isDefault: boolean
  isLocked: boolean
  lockedReason?: string
  createdAt: string
}

type Tab = 'reconciliation' | 'ledger' | 'rules' | 'settings' | 'audit' | 'remittance' | 'ap' | 'trust'

type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED' | 'ROLLED_BACK' | 'REVIEW_REQUIRED' | 'ANOMALY_PAUSED' | 'STALLED'

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
  updatedAt: string
  parentCustomerId: string
  rule?: Rule
  auditEntries: AuditEntry[]
}

interface Firm {
  id: string
  name: string
  plan: 'TRIAL' | 'STANDARD' | 'PROFESSIONAL' | 'PRACTICE'
  connected: boolean
  isSubscribed?: boolean
  subscriptionStatus?: string
  currentPeriodEnd?: string
}

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info' | 'warning'
}

// ── Constants ───────────────────────────────────────────────────────────────

const API = (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : null) || 'http://localhost:3001'

const PLAN_RANK = {
  TRIAL: 0,
  STANDARD: 1,
  PROFESSIONAL: 2,
  PRACTICE: 3,
}

const isPlanAllowed = (minPlan: keyof typeof PLAN_RANK, currentPlan: keyof typeof PLAN_RANK) => {
  return PLAN_RANK[currentPlan] >= PLAN_RANK[minPlan]
}

// ── Main Dashboard ──────────────────────────────────────────────────────────

// ── Main Dashboard ──────────────────────────────────────────────────────────

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Initialize from URL parameters if available
  const initialTab = (searchParams.get('tab') as Tab) || 'reconciliation'
  const initialSubTab = (searchParams.get('subTab') as any) || 'profile'

  const [tab, setTab] = useState<Tab>(initialTab)
  const [firm, setFirm] = useState<Firm | null>(null)
  const [jobs, setJobs] = useState<ReconciliationJob[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([])
  const [ledgerMetadata, setLedgerMetadata] = useState<any>(null)
  const [ledgerFilters, setLedgerFilters] = useState({
    startDate: '',
    endDate: '',
    account: '',
    jobId: '',
    search: ''
  })
  const [customers, setCustomers] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [qboConnected, setQboConnected] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [previewingRule, setPreviewingRule] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [firmId, setFirmId] = useState<string>('')
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState<any>(null)
  const [rulePrefillId, setRulePrefillId] = useState<string>('')
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [settingsSubTab, setSettingsSubTab] = useState<'profile' | 'billing' | 'security' | 'notifications'>(initialSubTab)
  const [confirmation, setConfirmation] = useState<{
    show: boolean;
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
    type: 'danger' | 'info';
  }>({
    show: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    onConfirm: () => {},
    type: 'info'
  })
  const [workerHealth, setWorkerHealth] = useState<any>(null)

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Sync state changes to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab !== 'reconciliation') {
      params.set('tab', tab)
    } else {
      params.delete('tab')
    }
    
    if (tab === 'settings' && settingsSubTab !== 'profile') {
      params.set('subTab', settingsSubTab)
    } else {
      params.delete('subTab')
    }

    const newUrl = `${window.location.pathname}?${params.toString()}`
    
    // Using replace state to prevent polluting history stack during rapid tab switching
    window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
  }, [tab, settingsSubTab, searchParams])

  const fetchDashboardData = useCallback(async (fid: string) => {
    if (!fid) return
    try {
      // Build ledger query string from filters
      const ledgerParams = new URLSearchParams({ firmId: fid })
      Object.entries(ledgerFilters).forEach(([k, v]) => {
        if (v) ledgerParams.append(k, String(v))
      })

      const [fRes, jRes, rRes, aRes, cRes, lRes, ledRes, hRes] = await Promise.all([
        fetch(`${API}/auth/firms/${fid}/status`),
        fetch(`${API}/api/jobs?firmId=${fid}`),
        fetch(`${API}/api/rules?firmId=${fid}`),
        fetch(`${API}/api/jobs/activity?firmId=${fid}`),
        fetch(`${API}/api/qbo/customers?firmId=${fid}`),
        fetch(`${API}/api/qbo/locations?firmId=${fid}`),
        fetch(`${API}/api/jobs/ledger?${ledgerParams.toString()}`),
        fetch(`${API}/api/jobs/health`),
      ])

      let firmData = null
      if (fRes.ok) {
        firmData = await fRes.json()
        setFirm(firmData)
        setQboConnected(firmData.connected || false)
      } else {
        setQboConnected(false)
      }

      if (jRes.ok) setJobs(await jRes.json())
      if (rRes.ok) setRules(await rRes.json())
      if (aRes.ok) setActivity(await aRes.json())
      if (cRes.ok) setCustomers(await cRes.json())
      if (lRes.ok) setLocations(await lRes.json())
      if (ledRes.ok) {
        const data = await ledRes.json()
        setLedgerEntries(data.entries || [])
        setLedgerMetadata(data.metadata || null)
      }
      if (hRes.ok) {
        setWorkerHealth(await hRes.json())
      }
    } catch (e) {
      addToast('Failed to refresh dashboard data', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast, ledgerFilters])

  useEffect(() => {
    const id = localStorage.getItem('ps_firm_id')
    if (!id) {
      router.push('/')
      return
    }
    setFirmId(id)
    fetchDashboardData(id)

    // Check for connection success query param
    const params = new URLSearchParams(window.location.search)
    const connectedParam = params.get('connected') === 'true'
    const idParam = params.get('id')
    
    if (connectedParam) {
      if (idParam && idParam !== id) {
        console.log('[DASHBOARD] Syncing new firm ID from URL:', idParam)
        localStorage.setItem('ps_firm_id', idParam)
        setFirmId(idParam)
        fetchDashboardData(idParam)
      }
      addToast('QuickBooks Online successfully connected!', 'success')
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }

    const interval = setInterval(() => {
      setFirmId(currentId => {
        fetchDashboardData(currentId)
        return currentId
      })
    }, 10000)
    return () => clearInterval(interval)
  }, [router, fetchDashboardData, addToast])

  const groupedLedger = useMemo(() => {
    const groups: Record<string, any[]> = {}
    ledgerEntries.forEach(entry => {
      const key = entry.jobId || 'UNCATEGORIZED'
      if (!groups[key]) groups[key] = []
      groups[key].push(entry)
    })
    
    return Object.entries(groups).map(([jobId, entries]) => {
      const job = jobs.find(j => j.id === jobId)
      const rule = job?.rule
      const customer = customers.find(c => c.id === job?.parentCustomerId || entries[0].metadata?.parentCustomerId)
      
      const totalDebits = entries.reduce((sum, e) => sum + (e.debit || 0), 0)
      const totalCredits = entries.reduce((sum, e) => sum + (e.credit || 0), 0)
      const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

      // Sort: Incoming pool first, then allocations
      const sortedEntries = [...entries].sort((a, b) => {
        if (a.account?.includes('POOL')) return -1
        if (b.account?.includes('POOL')) return 1
        return 0
      })
      
      let runningPoolBalance = 0
      const entriesWithBalance = sortedEntries.map(e => {
        if (e.account?.includes('POOL')) {
          runningPoolBalance = e.debit || 0
        } else {
          runningPoolBalance -= (e.credit || 0)
        }
        return { ...e, runningPoolBalance }
      })

      // Fallback priority: Matched customer name -> payment.customerName -> "Customer not synced"
      const customerName = customer?.displayName || entries[0].metadata?.customerName || 'Customer not synced'

      return {
        jobId,
        date: entries[0].createdAt,
        entries: entriesWithBalance,
        totalAmount: totalDebits,
        totalCredits,
        isBalanced,
        customerName,
        ruleType: rule?.ruleType || null
      }
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [ledgerEntries, jobs, customers])

  const handleManualSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch(`${API}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId }),
      })
      if (!res.ok) throw new Error('Sync failed')
      const data = await res.json()
      
      const summary = [
        data.triggeredCount > 0 ? `${data.triggeredCount} new payments queued` : null,
        data.skippedCount > 0 ? `${data.skippedCount} skipped (already in system)` : null,
        data.failedCount > 0 ? `${data.failedCount} failed jobs require attention` : null
      ].filter(Boolean).join('. ')

      addToast(summary || 'No changes detected', data.triggeredCount > 0 ? 'success' : 'info')
      fetchDashboardData(firmId)
    } catch (e) {
      addToast('Failed to trigger manual sync', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleRetryJob = async (id: string) => {
    try {
      const res = await fetch(`${API}/api/jobs/${id}/retry`, { method: 'POST' })
      if (!res.ok) throw new Error('Retry failed')
      addToast('Job re-queued successfully', 'success')
      fetchDashboardData(firmId)
    } catch (e) {
      addToast('Failed to retry job', 'error')
    }
  }

  const handleRetryAll = async () => {
    try {
      const res = await fetch(`${API}/api/jobs/retry-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('[RETRY_ALL] Failure:', res.status, errorData)
        throw new Error(errorData.error || 'Retry all failed')
      }
      const data = await res.json()
      
      const counts = []
      if (data.failedCount > 0) counts.push(`${data.failedCount} failed`)
      if (data.stalledCount > 0) counts.push(`${data.stalledCount} stalled`)
      
      const message = counts.length > 0 
        ? `Re-enqueued ${counts.join(' and ')} jobs`
        : `Re-enqueued ${data.count} jobs`
        
      addToast(message, 'success')
      fetchDashboardData(firmId)
    } catch (e: any) {
      addToast(`Failed to retry all jobs: ${e.message}`, 'error')
    }
  }

  const handleRetryStalled = async () => {
    try {
      const res = await fetch(`${API}/api/jobs/retry-stalled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId }),
      })
      if (!res.ok) throw new Error('Retry failed')
      const data = await res.json()
      addToast(`Re-enqueued ${data.count} stalled jobs`, 'success')
      fetchDashboardData(firmId)
    } catch (e) {
      addToast('Failed to retry stalled jobs', 'error')
    }
  }

  const deleteRule = async (id: string) => {
    setConfirmation({
      show: true,
      title: 'Delete Allocation Rule',
      message: 'Are you sure you want to permanently delete this allocation rule? This action cannot be undone.',
      confirmText: 'Delete Rule',
      type: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`${API}/api/rules/${id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error('Delete failed')
          addToast('Allocation rule deleted', 'success')
          fetchDashboardData(firmId)
        } catch (e) {
          addToast('Failed to delete rule', 'error')
        }
        setConfirmation(prev => ({ ...prev, show: false }))
      }
    })
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
      const res = await fetch(`${API}/api/stripe/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId, tier: plan }),
      })
      if (!res.ok) throw new Error('Upgrade failed')
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL returned')
      }
    } catch (e) {
      addToast('Checkout failed. Please try again.', 'error')
    }
  }



  const handleManageBilling = async () => {
    try {
      setSyncing(true)
      const res = await fetch(`${API}/api/stripe/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmId }),
      })
      if (!res.ok) throw new Error('Failed to create portal session')
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('No portal URL returned')
      }
    } catch (e) {
      addToast('Failed to open billing portal', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const getRuleDetails = (rule: Rule) => {
    const { ruleType, ruleConfig } = rule
    if (ruleType === 'proportional' && ruleConfig.weights) {
      return Object.entries(ruleConfig.weights).map(([locId, weight]) => {
        const name = customers.find((c: any) => c.id === locId)?.displayName 
                  || locations.find((l: any) => l.id === locId)?.name 
                  || locId
        return `${name}: ${weight}%`
      }).join(', ')
    }
    const ids = (ruleConfig as any).locationIds || (ruleConfig as any).order || []
    if (ids.length > 0) {
      return ids.map((id: string) => 
        customers.find((c: any) => c.id === id)?.displayName 
        || locations.find((l: any) => l.id === id)?.name 
        || id
      ).join(' → ')
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
    <div className="min-h-screen bg-bg text-text selection:bg-accent/20 selection:text-accent overflow-x-hidden max-w-full">
      {/* Toast Overlay */}
      <div className="fixed top-6 right-6 z-[10000] flex flex-col gap-3">
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>

      <nav className="fixed top-0 left-0 right-0 h-16 bg-surface/80 backdrop-blur-md border-b border-border z-[100] px-6 max-[1024px]:px-4 flex items-center justify-between">
        <div className="flex items-center gap-4 shrink-0">
          <div className="w-8 h-8 bg-accent/10 rounded-xl flex items-center justify-center border border-accent/20 text-accent">
            <LogoIcon />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-800 text-[14px] leading-tight tracking-tight">PaySplit</span>
            <span className="text-[10px] text-text-3 font-bold uppercase tracking-wider line-clamp-1 max-w-[100px]">
              {firm?.name || 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 max-[1024px]:gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-border max-[1200px]:hidden">
            {(['reconciliation', 'ledger', 'rules', 'audit', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`p-[6px_14px] rounded-lg text-[11.5px] font-800 transition-all whitespace-nowrap ${tab === t ? 'bg-accent text-white shadow-[0_4px_12px_rgba(45,49,250,0.3)] border border-accent' : 'text-text-3 hover:text-text hover:bg-surface-3'}`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowPricingModal(true)}
            className="flex items-center gap-2 p-[6px_14px] bg-accent/10 border border-accent/20 rounded-xl text-accent text-[11.5px] font-800 hover:bg-accent/20 transition-all group shrink-0"
          >
            <SparklesIcon className="w-4 h-4" />
            <span className="max-[480px]:hidden">{firm?.plan ? `${firm.plan} Plan` : 'Plan'}</span>
          </button>

          <ThemeToggle />
        </div>
      </nav>

      {/* Mobile Sub-Nav */}
      <div className="fixed top-16 left-0 right-0 h-12 bg-surface border-b border-border z-[90] min-[1201px]:hidden flex items-center px-4 overflow-x-auto no-scrollbar scroll-smooth">
        <div className="flex items-center gap-2 pr-4 min-w-max">
          {(['reconciliation', 'ledger', 'rules', 'audit', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`p-[6px_16px] rounded-xl text-[11.5px] font-800 transition-all whitespace-nowrap ${tab === t ? 'bg-accent text-white shadow-sm' : 'text-text-3 bg-surface-2 hover:bg-surface-3'}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <main className="pt-20 pb-12 px-8 max-[1200px]:pt-32 max-[768px]:px-4 max-w-[1400px] mx-auto">
        {/* Guided Onboarding Flow - only shows if not fully set up */}
        {(!qboConnected || rules.length === 0 || jobs.length === 0) && (
          <div className="mb-10 bg-[#2d31fa08] border border-[#2d31fa15] rounded-[24px] p-6 flex flex-col gap-6 animate-fadeIn transition-all">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-[15px] font-800 text-text tracking-tight uppercase">Getting Started with PaySplit</h2>
                <p className="text-[12px] text-text-3 font-600">Complete these steps to activate automated revenue allocation.</p>
              </div>
              <div className="text-[11px] font-800 text-accent bg-accent/10 px-3 py-1 rounded-full border border-accent/20">
                Setup: {qboConnected ? (rules.length > 0 ? (jobs.length > 0 ? '100%' : '75%') : '50%') : '25%'}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: 'Connect QBO', active: qboConnected, desc: 'Link your firm' },
                { label: 'Add Rules', active: rules.length > 0, desc: 'Define strategies' },
                { label: 'Import Jobs', active: jobs.length > 0, desc: 'Fetch payments' },
                { label: 'First Split', active: jobs.some(j => j.status === 'COMPLETE'), desc: 'Automate results' }
              ].map((step, i) => (
                <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${step.active ? 'bg-white border-[#10b98130] shadow-sm' : 'bg-surface/40 border-border'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${step.active ? 'bg-[#10b981] text-white' : 'bg-surface-3 text-text-3'}`}>
                    {step.active ? '✓' : i + 1}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-[12px] font-800 ${step.active ? 'text-text' : 'text-text-3'}`}>{step.label}</span>
                    <span className="text-[10px] text-text-3 font-600 uppercase tracking-tight">{step.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'reconciliation' && (
          <div className="animate-fadeIn">
            <header className="flex items-center justify-between mb-8 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-4">
              <div>
                <h1 className="font-display text-[28px] max-[1024px]:text-[24px] font-800 tracking-tight text-text mb-2">Payment Reconciliation</h1>
                <p className="text-text-3 text-[14px]">Monitor and manage automated payment splits from QuickBooks.</p>
              </div>
              <div className="flex items-center gap-3 w-full max-[768px]:justify-between">
                <div className="flex items-center gap-2 p-[8px_16px] bg-surface border border-border rounded-xl">
                  <div className={`w-2 h-2 rounded-full ${qboConnected ? 'bg-[#10b981] shadow-[0_0_8px_#10b981]' : 'bg-[#ef4444]'}`} />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-800 text-text leading-none">
                      {qboConnected ? 'QuickBooks Online Linked' : 'QBO Disconnected'}
                    </span>
                    {qboConnected && (
                      <span className="text-[9px] text-text-3 font-bold uppercase tracking-tighter mt-1">
                        Last Live Sync: {timeAgo(jobs[0]?.createdAt || new Date().toISOString())}
                      </span>
                    )}
                  </div>
                </div>
                {qboConnected ? (
                  <div className="flex items-center gap-2">
                    {jobs.some(j => ['FAILED', 'STALLED', 'ROLLED_BACK'].includes(j.status)) && (
                      <button
                        onClick={handleRetryAll}
                        className="flex items-center gap-2 p-[10px_20px] bg-white border border-[#ef444430] text-[#ef4444] rounded-xl text-[12px] font-700 hover:bg-[#ef444405] transition-all"
                      >
                        Retry All Failed
                      </button>
                    )}
                    <div className="flex items-center gap-3">
                      {workerHealth && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-800 uppercase tracking-wider ${workerHealth.status === 'UP' ? 'bg-[#10b98110] border-[#10b98130] text-[#10b981]' : 'bg-[#ef444410] border-[#ef444430] text-[#ef4444]'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${workerHealth.status === 'UP' ? 'bg-[#10b981] animate-pulse' : 'bg-[#ef4444]'}`} />
                          <span>Worker: {workerHealth.status}</span>
                        </div>
                      )}
                      <button
                        onClick={handleManualSync}
                        disabled={syncing}
                        className="flex items-center gap-2 p-[10px_20px] bg-accent text-white rounded-xl text-[12px] font-700 hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_4px_12px_rgba(45,49,250,0.2)]"
                      >
                        <span>{syncing ? 'Syncing...' : 'Fetch New Payments'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => window.location.href = `${API}/auth/qbo/connect?firmId=${firmId}`}
                    className="flex items-center gap-2 p-[10px_20px] bg-[#22c55e] text-white rounded-xl text-[12px] font-700 hover:opacity-90 transition-all shadow-[0_4px_12px_rgba(34,197,94,0.2)]"
                  >
                    <span>Connect QuickBooks</span>
                  </button>
                )}
              </div>
            </header>

            {/* Metrics Dashboard */}
            <div className="flex flex-col gap-4 mb-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Payments', value: jobs.filter(j => j.status === 'COMPLETE').length, icon: <ActivityIcon className="w-4 h-4" /> },
                  { label: 'Total Split', value: `$${fmt(jobs.filter(j => j.status === 'COMPLETE').reduce((acc, j) => acc + Number(j.totalAmount), 0))}`, icon: <DollarIcon className="w-4 h-4" /> },
                  { label: 'Active Rules', value: rules.filter(r => r.isActive).length, icon: <ScaleIcon className="w-4 h-4" /> },
                  { label: 'Pending', value: jobs.filter(j => ['FAILED', 'STALLED', 'ROLLED_BACK'].includes(j.status)).length, icon: <AlertIcon className="w-4 h-4" />, color: jobs.filter(j => ['FAILED', 'STALLED', 'ROLLED_BACK'].includes(j.status)).length > 0 ? 'text-[#ef4444]' : 'text-text-3' },
                ].map((m, i) => (
                  <div key={i} className="bg-surface border border-border p-5 rounded-[24px]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-800 text-text-3 uppercase tracking-widest">{m.label}</span>
                      <span className="text-text-3 opacity-60">{m.icon}</span>
                    </div>
                    <div className={`text-[20px] font-display font-800 ${m.color || 'text-text'}`}>{m.value}</div>
                  </div>
                ))}
              </div>

              {(jobs.some(j => ['FAILED', 'ROLLED_BACK'].includes(j.status)) || jobs.some(j => j.status === 'STALLED')) && (() => {
                // Find customers with rule-missing failures
                const missingRuleCustomers = Array.from(
                  new Set(
                    jobs
                      .filter(j => j.status === 'FAILED' && j.errorMessage?.includes('No active split rule'))
                      .map(j => {
                        const match = j.errorMessage?.match(/customer\s+(\S+)/)
                        return match ? match[1] : null
                      })
                      .filter(Boolean)
                  )
                )
                const otherFailedCount = jobs.filter(j => ['FAILED', 'ROLLED_BACK'].includes(j.status) && !j.errorMessage?.includes('No active split rule')).length
                const stalledCount = jobs.filter(j => j.status === 'STALLED').length

                return (
                  <div className="flex flex-col gap-3">
                    {/* Missing Rule Alert — per customer */}
                    {missingRuleCustomers.length > 0 && (
                      <div className="p-5 bg-[#f59e0b08] border border-[#f59e0b25] rounded-[20px]">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-9 h-9 rounded-full bg-[#f59e0b15] flex items-center justify-center text-[#f59e0b]">
                            <AlertIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-[13px] font-800 text-text">Customers Missing Allocation Rules</h4>
                            <p className="text-[11px] text-text-3 font-600">These customers have payments that cannot be processed until a split rule is created.</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {missingRuleCustomers.map((cid) => {
                            const customerName = customers.find((c: any) => c.id === cid)?.displayName
                            return (
                              <button
                                key={cid}
                                onClick={() => {
                                  setEditingRule(null)
                                  setRulePrefillId(cid as string)
                                  setShowRuleModal(true)
                                  addToast(`Setting up rule for ${customerName || `customer ${cid}`}...`, 'info')
                                }}
                                className="flex items-center gap-2 p-[8px_14px] bg-[#f59e0b15] border border-[#f59e0b30] rounded-xl text-[12px] font-800 text-[#f59e0b] hover:bg-[#f59e0b25] transition-all"
                              >
                                <span>+</span>
                                <span>{customerName ? `${customerName} (${cid})` : `Customer ${cid}`}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* General Recovery Banner */}
                    {(otherFailedCount > 0 || stalledCount > 0) && (
                      <div className="p-4 bg-surface-2 border border-border rounded-[20px] flex items-center justify-between gap-4 max-[768px]:flex-col">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#ef444410] border border-[#ef444420] flex items-center justify-center text-[#ef4444]">
                            <AlertIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-[13px] font-800 text-text">System Recovery Needed</h4>
                            <p className="text-[11px] text-text-3 font-600 uppercase tracking-wider">
                              {otherFailedCount} failed and {stalledCount} stalled jobs
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 max-[768px]:w-full">
                          {stalledCount > 0 && (
                            <button
                              onClick={handleRetryStalled}
                              className="p-[10px_20px] bg-indigo-500 text-white rounded-xl text-[11px] font-800 uppercase tracking-widest hover:opacity-90 shadow-lg shadow-indigo-500/20 max-[768px]:flex-1"
                            >
                              Retry Stalled
                            </button>
                          )}
                          <button
                            onClick={handleRetryAll}
                            className="p-[10px_20px] bg-accent text-white rounded-xl text-[11px] font-800 uppercase tracking-widest hover:opacity-90 shadow-lg shadow-accent/20 max-[768px]:flex-1"
                          >
                            Retry All Failed
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            <div className="grid grid-cols-1 gap-4">
              {!qboConnected ? (
                <div className="p-20 bg-surface border border-border rounded-[24px] text-center border-dashed">
                  <div className="text-[48px] mb-4">🔌</div>
                  <h3 className="font-display text-[18px] font-800 text-text mb-2">Connect QuickBooks to start splitting</h3>
                  <p className="text-text-3 text-[14px] max-w-[400px] mx-auto mb-8 text-pretty">
                    Once connected, PaySplit will automatically detect incoming payments and allocate them across your locations using your rules.
                  </p>
                  <button
                    onClick={() => window.location.href = `${API}/auth/qbo/connect?firmId=${firmId}`}
                     className="p-[12px_32px] bg-[#22c55e] text-white rounded-xl text-[13px] font-800 hover:opacity-90 transition-all shadow-lg"
                  >
                    Connect QuickBooks
                  </button>
                </div>
              ) : jobs.length === 0 ? (
                <div className="p-20 bg-surface border border-border rounded-[24px] text-center border-dashed">
                  <div className="text-[48px] mb-4 opacity-50">📑</div>
                  <h3 className="font-display text-[16px] font-800 text-text mb-2">No jobs found yet</h3>
                  <p className="text-text-3 text-[14px]">Waiting for payments to arrive in QuickBooks Online. As they come in, they will appear here for splitting.</p>
                </div>
              ) : (
                jobs.map(job => (
                  <div
                    key={job.id}
                    className="group bg-surface border border-border rounded-[20px] overflow-hidden transition-all hover:border-accent/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
                  >
                    <div
                      className="p-6 flex items-center justify-between cursor-pointer relative max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-4"
                      onClick={() => setSelected(selected === job.id ? null : job.id)}
                    >
                      <div className="flex items-center gap-6 max-[1024px]:gap-4 max-[768px]:grid max-[768px]:grid-cols-2 max-[768px]:w-full">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Payment ID</span>
                          <span className="font-mono text-[13px] font-bold text-text underline decoration-accent/20 underline-offset-4 line-clamp-1 break-all">{job.paymentId}</span>
                        </div>
                        <div className="h-8 w-[1px] bg-border/60 max-[768px]:hidden" />
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Total Amount</span>
                          <span className="text-[15px] font-800 text-text tracking-tight">${fmt(job.totalAmount)}</span>
                        </div>
                        <div className="h-8 w-[1px] bg-border/60 max-[768px]:hidden" />
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">
                            {job.status === 'PROCESSING' ? 'Started' : job.status === 'QUEUED' ? 'Queued' : 'Created'}
                          </span>
                          <span className="text-[13px] font-600 text-text-2">
                            {job.status === 'PROCESSING' || job.status === 'QUEUED' ? timeAgo(job.updatedAt) : timeAgo(job.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 max-[768px]:absolute max-[768px]:top-6 max-[768px]:right-4">
                        <StatusBadge status={job.status} errorMessage={job.errorMessage} />
                        <div className={`p-2 rounded-lg bg-surface-2 border border-border text-text-3 transition-all group-hover:border-text-3/30 ${selected === job.id ? 'rotate-90 bg-accent/5 border-accent/20 text-accent' : ''}`}>
                          <Chevron open={selected === job.id} />
                        </div>
                      </div>
                    </div>

                    {selected === job.id && (
                      <div className="px-6 pb-6 animate-slideDown">
                        <div className="pt-6 border-t border-border flex flex-col gap-6">
                          {job.rule && (
                            <div className="bg-surface-2 p-4 rounded-xl border border-border flex items-center justify-between max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-3">
                              <div className="flex items-center gap-3">
                                <span className="p-2 bg-accent/10 text-accent rounded-lg">
                                  <ScaleIcon className="w-4 h-4" />
                                </span>
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

                          {job.status === 'FAILED' || job.status === 'STALLED' || job.status === 'ROLLED_BACK' ? (
                            <div className="flex flex-col gap-4">
                              <div className="p-4 bg-[#ef444410] border border-[#ef444420] rounded-xl flex items-start gap-3">
                                <span className="text-[#ef4444] mt-0.5">
                                  <AlertIcon className="w-4 h-4" />
                                </span>
                                <div className="flex flex-col gap-1 flex-1">
                                  <span className="text-[11px] font-800 text-[#ef4444] uppercase tracking-wider">
                                    {job.status === 'STALLED' ? 'Stalled Connection' : 'Error Details'}
                                  </span>
                                  <span className="text-[13px] font-600 text-[#ef4444] leading-relaxed">
                                    {job.status === 'STALLED' 
                                      ? 'This job has been stuck for over 30 minutes and may have stalled. Please check your QBO connection and retry.'
                                      : (job.errorMessage || 'Unknown processing error.')}
                                  </span>
                                  {job.errorMessage?.includes('No active split rule') && (
                                    <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const match = job.errorMessage.match(/customer\s+([^\s(]+)/);
                                          const cid = match ? match[1] : '';
                                          setEditingRule(null);
                                          setRulePrefillId(cid);
                                          setShowRuleModal(true);
                                          addToast(`Setting up rule for customer ${cid}...`, 'info');
                                        }}
                                      className="mt-2 w-fit p-[6px_12px] bg-[#ef4444] text-white rounded-lg text-[10px] font-800 uppercase hover:opacity-90 transition-all flex items-center gap-1.5"
                                    >
                                      <span>+</span>
                                      <span>Create Allocation Rule</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => handleRetryJob(job.id)}
                                className="w-full p-4 bg-white border border-border rounded-xl text-[12px] font-800 text-text hover:bg-surface-2 transition-all flex items-center justify-center gap-2"
                              >
                                <span>↻</span>
                                <span>Retry This Job</span>
                              </button>
                            </div>
                          ) : (
                              job.status === 'COMPLETE' && (
                                <div className="flex flex-col gap-4 w-full">
                                  <div className="p-4 bg-[#10b98108] border border-[#10b98115] rounded-xl flex items-center gap-3">
                                    <span className="text-[#10b981]">
                                      <CheckIcon className="w-4 h-4" />
                                    </span>
                                    <span className="text-[12px] font-700 text-[#10b981]">All funds successfully allocated in QuickBooks Online.</span>
                                  </div>
                                  
                                  <div className="p-6 bg-surface-2 rounded-2xl border border-border flex flex-col gap-4">
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[10px] font-900 text-text-3 uppercase tracking-widest">Transaction Summary</span>
                                      <div className="flex items-baseline gap-2">
                                        <span className="text-[14px] font-700 text-text">Payment Total:</span>
                                        <span className="text-[18px] font-900 text-text">${fmt(job.totalAmount)}</span>
                                      </div>
                                    </div>
                                    
                                    <div className="h-[1px] bg-border/60" />
                                    
                                    <div className="flex flex-col gap-3">
                                      <span className="text-[10px] font-900 text-text-3 uppercase tracking-widest">Split Distribution</span>
                                      <div className="flex flex-col gap-2">
                                        {job.auditEntries.map((ae, i) => {
                                          const name = customers.find(c => c.id === ae.subLocationId)?.displayName 
                                                    || locations.find(l => l.id === ae.subLocationId)?.name 
                                                    || ae.subLocationId
                                          return (
                                            <div key={i} className="flex items-center justify-between text-[13px]">
                                              <div className="flex items-center gap-2 text-text-2 font-600">
                                                <span>{name}</span>
                                                <span className="text-text-3 opacity-40">→</span>
                                              </div>
                                              <span className="font-800 text-[#10b981]">${fmt(ae.amountApplied)}</span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  </div>
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

        {tab === 'ledger' && (
          <div className="animate-fadeIn">
            <header className="flex items-center justify-between mb-8 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-4">
              <div>
                <h1 className="font-display text-[28px] max-[1024px]:text-[24px] font-800 tracking-tight text-text mb-2">Financial Ledger</h1>
                <p className="text-text-3 text-[14px]">The internal source of truth. Every debit and credit recorded before QBO sync.</p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex items-center gap-4 mr-1">
                  <div className="flex items-center gap-1.5 grayscale opacity-50">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                    <span className="text-[9px] font-800 uppercase tracking-widest">Debit</span>
                  </div>
                  <div className="flex items-center gap-1.5 grayscale opacity-50">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                    <span className="text-[9px] font-800 uppercase tracking-widest">Credit</span>
                  </div>
                </div>
                <div className={`p-[10px_20px] border rounded-xl text-[12.5px] font-800 uppercase tracking-wider flex items-center gap-2.5 transition-all shadow-sm ${ledgerMetadata?.integrity?.balanced ? 'bg-[#10b98108] border-[#10b98120] text-[#10b981]' : 'bg-[#ef444408] border-[#ef444420] text-[#ef4444]'}`}>
                  <ShieldIcon className="w-4 h-4" />
                  <span>Ledger Status: {ledgerMetadata?.integrity?.balanced ? 'Verified Integrity' : 'Imbalanced - Action Required'}</span>
                </div>
                {ledgerMetadata?.integrity?.lastCheck && (
                  <span className="text-[10px] text-text-3 font-700 uppercase tracking-widest mr-1">
                    System Audit Cycle: {timeAgo(ledgerMetadata.integrity.lastCheck)}
                  </span>
                )}
              </div>
            </header>

            {/* Filter Bar */}
            <div className="bg-surface border border-border rounded-[20px] p-4 mb-8 flex flex-wrap items-center gap-4 shadow-sm">
              <div className="flex flex-col gap-1.5 min-w-[140px]">
                <label className="text-[10px] font-800 text-text-3 uppercase tracking-wider ml-1">Search</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ref # or Account..."
                    className="w-full bg-surface-2 border border-border rounded-xl p-[10px_14px_10px_36px] text-[13px] font-600 outline-none focus:border-accent"
                    value={ledgerFilters.search}
                    onChange={(e) => setLedgerFilters(prev => ({ ...prev, search: e.target.value }))}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3 opacity-50">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-[200px]">
                <label className="text-[10px] font-800 text-text-3 uppercase tracking-wider ml-1">Date Range</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="bg-surface-2 border border-border rounded-xl p-[8px_12px] text-[12px] font-600 outline-none focus:border-accent"
                    value={ledgerFilters.startDate}
                    onChange={(e) => setLedgerFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  />
                  <span className="text-text-3 text-[10px] font-bold">─</span>
                  <input
                    type="date"
                    className="bg-surface-2 border border-border rounded-xl p-[8px_12px] text-[12px] font-600 outline-none focus:border-accent"
                    value={ledgerFilters.endDate}
                    onChange={(e) => setLedgerFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <button
                onClick={() => setLedgerFilters({ startDate: '', endDate: '', account: '', jobId: '', search: '' })}
                className="mt-auto mb-1 p-[10px_16px] border border-border rounded-xl text-[12px] font-700 text-text-3 hover:text-text hover:bg-surface-2 transition-all"
              >
                Reset
              </button>
            </div>

            {groupedLedger.length === 0 ? (
               <div className="bg-surface border border-border rounded-[32px] p-20 text-center flex flex-col items-center gap-6 shadow-sm border-dashed">
                <div className="w-20 h-20 bg-accent/5 rounded-[24px] flex items-center justify-center text-[32px] animate-pulse">📖</div>
                <div className="max-w-[400px]">
                  <h3 className="font-display text-[20px] font-800 text-text mb-3 tracking-tight">Financial ledger is empty</h3>
                  <p className="text-text-3 text-[14px] leading-relaxed">
                    Ledger entries are created automatically when payments are processed and split. 
                    Once you connect QuickBooks and process your first payment, you'll see a complete record of debits and credits here.
                  </p>
                </div>
                <button
                  onClick={() => setTab('reconciliation')}
                  className="p-[14px_32px] bg-accent text-white rounded-xl text-[13px] font-800 hover:opacity-90 transition-all shadow-lg shadow-accent/20"
                >
                  Go to Reconciliation
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {groupedLedger.map(group => (
                  <div key={group.jobId} className="bg-surface border border-border rounded-[24px] overflow-hidden shadow-sm transition-all hover:border-accent/30 group">
                    <header className="bg-surface-2/60 p-6 px-8 flex items-center justify-between border-b border-border/60">
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-text-3 uppercase tracking-widest">Transaction Metadata</span>
                          <span className="text-[15px] font-bold text-text tracking-tight">Payment ${fmt(group.totalAmount)} — {group.customerName}</span>
                          <div className="flex flex-col gap-1 mt-1">
                            <span className="text-[11px] font-700 text-accent uppercase tracking-wider">
                              {group.ruleType ? `Rule: ${group.ruleType.replace('_', ' ')}` : 'Rule: Not set'}
                            </span>
                            <span className="text-[10px] font-600 text-text-3 font-mono opacity-50">Txn: {group.jobId}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] font-800 text-text-3 uppercase tracking-widest">Double-Entry Check</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-700 text-text-3">D ${fmt(group.totalAmount)} = C ${fmt(group.totalCredits)}</span>
                            {group.isBalanced ? (
                              <span className="text-[#10b981] text-[12px]">✓</span>
                            ) : (
                              <span className="text-[#ef4444] text-[11px] font-800 animate-pulse">⚠ Mismatch</span>
                            )}
                          </div>
                        </div>
                        <button
                           onClick={() => { setSelected(selected === group.jobId ? null : group.jobId); setTab('reconciliation'); }}
                           className="p-3 bg-surface border border-border rounded-xl text-text-3 hover:text-accent hover:border-accent/20 transition-all shadow-sm group-hover:bg-accent/5"
                           title="View in Reconciliation"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </button>
                      </div>
                    </header>
                    <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                          <tr className="border-b border-border/40">
                            <th className="p-4 pl-8 text-[11px] font-800 text-text-3 uppercase tracking-[1px] w-[350px]">Account / Location</th>
                            <th className="p-4 text-[11px] font-800 text-text-3 uppercase tracking-[1px] text-right w-[150px]">Debit (+)</th>
                            <th className="p-4 text-[11px] font-800 text-text-3 uppercase tracking-[1px] text-right w-[150px]">Credit (─)</th>
                            <th className="p-4 pr-8 text-[11px] font-800 text-text-3 uppercase tracking-[1px] text-right w-[180px]">Remaining Allocation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.entries.map((entry, idx) => {
                            const isPool = entry.account?.includes('POOL')
                            return (
                              <tr key={entry.id} className={`border-b border-border/40 last:border-0 hover:bg-surface-2/30 transition-colors ${isPool ? 'bg-accent/[0.02]' : ''}`}>
                                <td className="p-4 pl-8">
                                  <div className={`flex items-center gap-2.5 ${!isPool ? 'ml-6' : ''}`}>
                                    {!isPool && <span className="text-text-3 opacity-30 text-[14px]">↳</span>}
                                    <div className={`w-1.5 h-1.5 rounded-full ${isPool ? 'bg-accent' : 'bg-[#10b981]'}`} />
                                    <span className={`font-mono text-[12px] uppercase tracking-tight ${isPool ? 'font-bold text-text' : 'font-medium text-text-2'}`}>
                                      {entry.account}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-4 text-right font-mono text-[13px] font-bold text-text/80 tabular-nums">
                                  {entry.debit > 0 ? `$${fmt(entry.debit)}` : '—'}
                                </td>
                                <td className="p-4 text-right font-mono text-[13px] font-bold text-[#10b981] tabular-nums">
                                  {entry.credit > 0 ? `$${fmt(entry.credit)}` : '—'}
                                </td>
                                <td className="p-4 pr-8 text-right font-mono text-[13px] font-bold text-text/60 tabular-nums">
                                  ${fmt(Math.abs(entry.runningPoolBalance))}
                                  {entry.runningPoolBalance > 0.01 && <span className="text-[9px] ml-1.5 p-[1px_4px] bg-accent/10 rounded uppercase font-bold">Allocating</span>}
                                  {Math.abs(entry.runningPoolBalance) <= 0.01 && <span className="text-[9px] ml-1.5 p-[1px_4px] bg-[#10b98115] text-[#10b981] rounded uppercase font-bold">Completed</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {tab === 'rules' && (
          <div className="animate-fadeIn">
            <header className="flex items-center justify-between mb-8 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-4">
              <div>
                <h1 className="font-display text-[28px] max-[768px]:text-[24px] font-800 tracking-tight text-text mb-2">Allocation Rules</h1>
                <p className="text-text-3 text-[14px]">Define how incoming revenue should be distributed across sub-locations.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { /* Template logic could go here */ addToast('Rule Templates coming soon!', 'info') }}
                  className="p-[10px_20px] bg-surface border border-border rounded-xl text-[12px] font-700 text-text-2 hover:bg-surface-2 transition-all max-[768px]:hidden"
                >
                  Use Template
                </button>
                <button
                  onClick={() => { setEditingRule(null); setRulePrefillId(''); setShowRuleModal(true); }}
                  className="flex items-center gap-2 p-[10px_24px] bg-accent text-white rounded-xl text-[12px] font-700 hover:opacity-90 transition-all shadow-[0_4px_12px_rgba(45,49,250,0.2)]"
                >
                  <span>+</span>
                  <span>New Allocation Rule</span>
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rules.length === 0 ? (
                <div className="col-span-full p-20 bg-surface border border-border rounded-[24px] text-center border-dashed group">
                  <div className="text-[48px] mb-4 group-hover:scale-110 transition-transform cursor-default">⚖️</div>
                  <h3 className="font-display text-[18px] font-800 text-text mb-2">Create your first allocation rule</h3>
                  <p className="text-text-3 text-[14px] max-w-[400px] mx-auto mb-8">
                    Allocation rules determine how PaySplit distributes incoming revenue across your locations or clients.
                  </p>
                  <div className="flex flex-col items-center gap-4">
                    <button
                      onClick={() => { setEditingRule(null); setRulePrefillId(''); setShowRuleModal(true); }}
                      className="p-[12px_32px] bg-accent text-white rounded-xl text-[13px] font-800 hover:opacity-90 transition-all shadow-lg"
                    >
                      Create First Rule
                    </button>
                    <div className="flex flex-col items-center gap-2 mt-8 p-6 bg-surface-2 border border-border rounded-2xl max-w-[400px]">
                      <span className="text-[10px] font-800 text-text-3 uppercase tracking-widest mb-2">Example Allocation Rule</span>
                      <div className="w-full flex justify-between items-center text-[12px] font-600 px-2 py-1 text-text-2">
                        <span>Prairie Holdings</span>
                        <span className="text-accent bg-accent/10 px-2 rounded-full text-[10px]">Proportional</span>
                      </div>
                      <div className="w-full flex flex-col gap-1 mt-2 text-[11px] text-text-3 font-medium">
                        <div className="flex justify-between"><span>Location A</span><span>45%</span></div>
                        <div className="flex justify-between"><span>Location B</span><span>35%</span></div>
                        <div className="flex justify-between"><span>Location C</span><span>20%</span></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-6 grayscale opacity-40 hover:grayscale-0 hover:opacity-100 transition-all group-hover:opacity-100 group-hover:grayscale-0">
                      <span className="text-[10px] font-800 text-text-3 uppercase tracking-widest whitespace-nowrap">Suggested Patterns:</span>
                      <span className="p-[4px_10px] border border-border rounded-lg text-[10px] font-bold">Proportional</span>
                      <span className="p-[4px_10px] border border-border rounded-lg text-[10px] font-bold">Waterfall</span>
                      <span className="p-[4px_10px] border border-border rounded-lg text-[10px] font-bold">Priority</span>
                    </div>
                  </div>
                </div>
              ) : (
                rules.map(rule => (
                  <div key={rule.id} className="group bg-surface border border-border rounded-[24px] p-6 flex flex-col gap-6 transition-all hover:border-accent/40 hover:shadow-[0_12px_32px_rgba(0,0,0,0.04)] relative overflow-hidden">
                    <div className="flex items-center justify-between relative z-10 max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-800 text-text-3 uppercase tracking-wider">Parent Customer</span>
                          {rule.isDefault && (
                            <span className="text-[9px] font-900 bg-accent text-white px-1.5 py-0.5 rounded shadow-sm animate-pulse">DEFAULT</span>
                          )}
                        </div>
                        <span className="text-[15px] font-800 text-text tracking-tight line-clamp-1 break-all">
                          {customers.find((c: any) => c.id === rule.parentCustomerId)?.displayName || rule.parentCustomerId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 max-[768px]:absolute max-[768px]:top-0 max-[768px]:right-0">
                        <button
                          onClick={() => { setEditingRule(rule); setRulePrefillId(''); setShowRuleModal(true); }}
                          className="p-2 rounded-lg bg-surface-2 border border-border text-text-3 hover:text-text hover:bg-surface-3 transition-all"
                          title="Edit rule"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                        </button>
                        <button
                          onClick={() => {
                            setPreviewingRule(previewingRule === rule.id ? null : rule.id);
                          }}
                          className={`p-2 rounded-lg border transition-all font-800 text-[10px] flex items-center gap-1 ${previewingRule === rule.id ? 'bg-accent text-white border-accent' : 'bg-surface-2 border-border text-text-3 hover:text-accent hover:bg-accent/5 hover:border-accent/20'}`}
                          title="Test Allocation"
                        >
                          <span>⚡</span>
                          <span className="max-[768px]:hidden px-1">Test Split</span>
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
                    <div className="flex flex-col gap-2">
                      <div className="text-[12px] font-600 text-text-2 leading-relaxed italic">&quot;{getRuleDetails(rule)}&quot;</div>
                      {(() => {
                        const locIds = rule.ruleType === 'proportional' 
                          ? Object.keys(rule.ruleConfig.weights || {}) 
                          : (rule.ruleType === 'oldest_first' ? (rule.ruleConfig.locationIds || []) : (rule.ruleConfig.order || []))
                        const missing = locIds.filter((id: string) => !customers.find((c: any) => c.id === id) && !locations.find((l: any) => l.id === id))
                        if (missing.length > 0) {
                          return (
                            <div className="mt-2 flex items-center gap-2 p-2 bg-[#ef444408] border border-[#ef444415] rounded-lg">
                              <span className="text-[14px]">⚠️</span>
                              <p className="text-[10px] font-700 text-[#ef4444] uppercase tracking-tight">
                                Inactive Location detected ({missing.join(', ')})
                              </p>
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>
                    <div className="flex items-center justify-between mt-2 relative z-10">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${rule.isActive ? 'bg-[#10b981]' : 'bg-text-3'}`} />
                        <span className="text-[11px] font-700 text-text-3 uppercase tracking-wider">{rule.isActive ? 'Active' : 'Paused'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleRule(rule.id, rule.isActive)}
                          className={`p-[6px_16px] rounded-xl text-[11px] font-800 transition-all ${rule.isActive ? 'bg-surface border border-border text-text-2 hover:bg-surface-2' : 'bg-accent text-white hover:opacity-90 shadow-sm'}`}
                        >
                          {rule.isActive ? 'Pause' : 'Activate'}
                        </button>
                      </div>
                    </div>

                    {/* Preview Breakdown */}
                    {previewingRule === rule.id && (
                      <div className="p-5 bg-surface-3 rounded-2xl border border-accent/20 animate-slideDown relative z-10">
                        <div className="flex justify-between items-center mb-4">
                          <span className="text-[10px] font-800 text-text-3 uppercase tracking-widest">Sample Allocation ($1,000.00)</span>
                          <div className="text-[10px] font-700 text-accent bg-accent/10 p-[2px_8px] rounded-full">Simulated</div>
                        </div>
                        <div className="flex flex-col gap-3">
                          {rule.ruleType === 'proportional' && Object.entries((rule.ruleConfig as any).weights || {}).map(([locId, weight]: [string, any]) => {
                            const name = customers.find((c: any) => c.id === locId)?.displayName 
                                      || locations.find((l: any) => l.id === locId)?.name 
                                      || locId
                            return (
                              <div key={locId} className="flex justify-between items-center text-[13px] last:border-t last:border-border last:pt-2 last:mt-1">
                                <span className="text-text-2 font-600">{name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-text-3 font-bold">{weight}%</span>
                                  <span className="font-800 text-[#10b981]">+${(1000 * weight / 100).toFixed(2)}</span>
                                </div>
                              </div>
                            )
                          })}
                          {rule.ruleType !== 'proportional' && (
                            <div className="flex flex-col gap-2">
                               <div className="flex justify-between items-center text-[13px]">
                                 <span className="text-text-2 font-600">Primary Location</span>
                                 <span className="font-800 text-[#10b981]">+$1,000.00</span>
                               </div>
                               <p className="text-[10px] text-text-3 italic mt-1 leading-tight">Waterfalls will prioritize draining invoices in the defined sequence.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

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
            <header className="mb-8 max-[768px]:mb-6 flex flex-col gap-2">
              <h1 className="font-display text-[28px] max-[768px]:text-[24px] font-800 tracking-tight text-text">Audit Registry</h1>
              <div className="flex items-center gap-3 p-[10px_16px] bg-[#10b98108] border border-[#10b98115] rounded-xl max-w-fit">
                <ShieldIcon className="w-4 h-4 text-[#10b981]" />
                <p className="text-text-3 text-[12px] font-600">Every automated action performed by PaySplit is logged here for full financial transparency.</p>
              </div>
            </header>

            <div className="bg-surface border border-border rounded-[24px] overflow-hidden max-w-full">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
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
                              <span className={`text-[10px] font-800 uppercase tracking-widest ${log.severity === 'ERROR' ? 'text-[#ef4444]' : log.severity === 'WARNING' ? 'text-[#f59e0b]' : 'text-[#10b981]'}`}>
                                {log.severity}
                              </span>
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
          <div className="animate-fadeIn">
            <header className="mb-8 max-[768px]:mb-6">
              <h1 className="font-display text-[28px] max-[768px]:text-[24px] font-800 tracking-tight text-text mb-2">Firm Settings</h1>
              <p className="text-text-3 text-[14px]">Manage your firm configuration and billing preferences.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-start">
              {/* Settings Sidebar */}
              <div className="bg-surface border border-border rounded-[24px] p-2 flex flex-col gap-1 sticky top-24 max-[1024px]:static max-[1024px]:flex-row max-[1024px]:overflow-x-auto max-[1024px]:mb-4 no-scrollbar max-[1024px]:p-1">
                {[
                  { id: 'profile', label: 'Organization', icon: <ShieldIcon className="w-4 h-4" /> },
                  { id: 'billing', label: 'Billing & Plan', icon: <DollarIcon className="w-4 h-4" /> },
                  { id: 'security', label: 'Security & SSO', icon: <LockIcon className="w-4 h-4" />, locked: true },
                  { id: 'notifications', label: 'Notifications', icon: <ActivityIcon className="w-4 h-4" />, locked: true },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => !item.locked && setSettingsSubTab(item.id as any)}
                    className={`flex items-center justify-between p-3 rounded-xl transition-all max-[1024px]:shrink-0 max-[1024px]:p-[10px_20px] ${settingsSubTab === item.id ? 'bg-accent text-white shadow-md' : 'text-text-3 hover:bg-surface-2 hover:text-text'}`}
                    disabled={item.locked}
                  >
                    <div className="flex items-center gap-3">
                      <span>{item.icon}</span>
                      <span className="text-[13px] font-700 tracking-tight whitespace-nowrap">{item.label}</span>
                    </div>
                    {!item.locked && <div className="max-[1024px]:hidden" />}
                    {item.locked && <LockIcon className="w-3 h-3 opacity-50 max-[1024px]:ml-2" />}
                  </button>
                ))}
              </div>

              {/* Settings Content */}
              <div className="flex flex-col gap-6">
                {settingsSubTab === 'profile' && (
                  <div className="bg-surface border border-border rounded-[24px] p-8 max-[768px]:p-5 flex flex-col gap-8 animate-fadeIn">
                    <header>
                      <h2 className="font-display text-[20px] font-800 text-text tracking-tight mb-2">Organization Profile</h2>
                      <p className="text-text-3 text-[14px]">Update your firm's administrative and security details.</p>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-[768px]:gap-6">
                      <div className="flex flex-col gap-6">
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

                      {/* Operational Health Card */}
                      <div className="bg-accent/5 border border-accent/10 rounded-2xl p-6 flex flex-col gap-4">
                        <div className="flex items-center gap-3 text-accent">
                          <ActivityIcon className="w-5 h-5" />
                          <span className="font-display font-800 text-[14px] uppercase tracking-tight">Operational Health</span>
                        </div>
                        <div className="flex flex-col gap-3">
                          <div className="flex justify-between items-center text-[12px]">
                            <span className="text-text-3 font-600">QBO Sync Status</span>
                            <span className="text-[#10b981] font-800">Operational</span>
                          </div>
                          <div className="flex justify-between items-center text-[12px]">
                            <span className="text-text-3 font-600">Rule Engine</span>
                            <span className="text-[#10b981] font-800">Healthy (0ms lag)</span>
                          </div>
                          <div className="h-1 bg-border rounded-full overflow-hidden mt-2">
                            <div className="w-[85%] h-full bg-accent rounded-full" />
                          </div>
                          <span className="text-[10px] text-text-3 font-700 uppercase">Usage: 85% of Trial rules used</span>
                        </div>
                      </div>
                    </div>
                    <div className="pt-8 border-t border-border flex flex-col gap-6 max-[768px]:pt-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-display text-[15px] max-[768px]:text-[14px] font-800 text-text">Data Retention Policy</span>
                          <span className="text-[12px] text-text-3 font-500">Keep audit logs for 12 months after job completion.</span>
                        </div>
                        <div className="w-12 h-6 bg-accent rounded-full border border-accent relative shrink-0">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-display text-[15px] max-[768px]:text-[14px] font-800 text-text">Email Notifications</span>
                          <span className="text-[12px] text-text-3 font-500">Receive summaries of payment batches and failures.</span>
                        </div>
                        <div className="w-12 h-6 bg-surface-3 rounded-full border border-border relative shrink-0">
                          <div className="absolute left-1 top-1 w-4 h-4 bg-text-3 rounded-full" />
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#ef444405] border border-[#ef444415] rounded-[24px] p-8 max-[768px]:p-5 flex flex-col gap-6 mt-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="font-display text-[16px] font-800 text-[#ef4444] uppercase tracking-tight">Danger Zone</h3>
                        <p className="text-text-3 text-[13px] font-500">Irreversible actions for your organization data.</p>
                      </div>
                      <div className="flex items-center justify-between gap-6 p-6 max-[768px]:p-4 bg-white border border-[#ef444415] rounded-2xl max-[768px]:flex-col max-[768px]:items-start">
                        <div className="flex flex-col gap-1">
                          <span className="font-display text-[15px] max-[768px]:text-[14px] font-800 text-text">Purge Audit Logs</span>
                          <span className="text-[12px] text-text-3 font-500">Permanently delete all historical activity data.</span>
                        </div>
                        <button
                          onClick={() => {
                            setConfirmation({
                              show: true,
                              title: 'Purge Audit Logs',
                              message: 'This will permanently delete all system activity records. This action is irreversible.',
                              confirmText: 'Empty Registry',
                              type: 'danger',
                              onConfirm: async () => {
                                try {
                                  const res = await fetch(`${API}/api/jobs/activity?firmId=${firmId}`, { method: 'DELETE' })
                                  if (!res.ok) throw new Error('Purge failed')
                                  addToast('Audit logs purged', 'success')
                                  fetchDashboardData(firmId)
                                } catch (e) {
                                  addToast('Failed to purge logs', 'error')
                                }
                                setConfirmation(prev => ({ ...prev, show: false }))
                              }
                            })
                          }}
                          className="p-[8px_16px] border border-[#ef4444] text-[#ef4444] rounded-lg text-[11px] font-800 hover:bg-[#ef4444] hover:text-white transition-all uppercase tracking-wider max-[768px]:w-full text-center"
                        >
                          Empty Registry
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {settingsSubTab === 'billing' && (
                  <div className="flex flex-col gap-6 animate-fadeIn">
                    <div className="bg-surface border border-border rounded-[24px] p-8 max-[768px]:p-5 flex flex-col gap-8">
                      <header>
                        <h2 className="font-display text-[20px] font-800 text-text tracking-tight mb-2">Billing & Plan</h2>
                        <p className="text-text-3 text-[14px]">Manage your subscription and payment methods.</p>
                      </header>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gradient-to-br from-accent/5 to-accent/10 border border-accent/20 rounded-[24px] p-6 flex flex-col gap-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-accent/20 rounded-2xl flex items-center justify-center text-accent">
                              <SparklesIcon className="w-6 h-6" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[11px] font-800 text-accent uppercase tracking-widest">Active Plan</span>
                              <span className="font-display text-[20px] font-800 text-text">{firm?.plan || 'TRIAL'}</span>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-center text-[13px]">
                              <span className="text-text-3 font-600">Status</span>
                              <span className={`font-800 uppercase tracking-tighter ${firm?.subscriptionStatus === 'active' ? 'text-[#10b981]' : 'text-accent'}`}>
                                {firm?.subscriptionStatus || 'Trialing'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[13px]">
                              <span className="text-text-3 font-600">Next Billing Date</span>
                              <span className="text-text font-800">
                                {firm?.currentPeriodEnd ? new Date(firm.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-3 mt-2">
                             <button
                              onClick={handleManageBilling}
                              disabled={syncing}
                              className="w-full p-[12px] bg-text text-bg rounded-xl text-[13px] font-800 hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                              <span>{syncing ? 'Connecting...' : 'Manage via Stripe Portal'}</span>
                              {!syncing && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>}
                            </button>
                            <button
                              onClick={() => setShowPricingModal(true)}
                              className="w-full p-[12px] bg-surface border border-border text-text rounded-xl text-[13px] font-700 hover:bg-surface-2 transition-all"
                            >
                              Change Plan
                            </button>
                          </div>
                        </div>

                        <div className="bg-surface-2 border border-border rounded-[24px] p-6 flex flex-col gap-4">
                          <h4 className="text-[11px] font-800 text-text-3 uppercase tracking-widest">Payment Methods</h4>
                          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">
                             <div className="w-12 h-12 bg-white/50 rounded-full flex items-center justify-center text-text-3 grayscale opacity-30">
                               <DollarIcon className="w-6 h-6" />
                             </div>
                             <p className="text-[12px] text-text-3 font-600 max-w-[150px]">Manage your cards securely in the Stripe Portal.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {showRuleModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 max-[768px]:p-0 max-[768px]:items-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={() => setShowRuleModal(false)} />
          <div className="bg-surface border border-border rounded-[32px] w-full max-w-[600px] shadow-2xl relative z-10 animate-slideUp overflow-hidden max-h-[90vh] flex flex-col max-[768px]:rounded-b-none max-[768px]:rounded-t-[24px]">
            <header className="p-8 max-[768px]:p-5 border-b border-border flex items-center justify-between bg-surface-2/50">
              <div>
                <h2 className="font-display text-[20px] max-[768px]:text-[18px] font-800 tracking-tight text-text">{editingRule ? 'Edit Split Rule' : 'New Split Rule'}</h2>
                <p className="text-[12px] text-text-3 font-600 mt-1 uppercase tracking-wider">Configure your distribution strategy</p>
              </div>
              <button onClick={() => setShowRuleModal(false)} className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-text-3 hover:bg-surface-3 transition-all">✕</button>
            </header>

            <div className="p-8 max-[768px]:p-5 overflow-y-auto flex-1 custom-scrollbar">
              <RuleForm
                editingRule={editingRule}
                prefillId={rulePrefillId}
                customers={customers}
                locations={locations}
                onCancel={() => { setEditingRule(null); setRulePrefillId(''); setShowRuleModal(false); }}
                addToast={addToast}
                firmPlan={firm?.plan || 'TRIAL'}
                firmId={firmId}
                onSave={async (ruleData: any) => {
                  try {
                    const method = editingRule ? 'PATCH' : 'POST'
                    const url = editingRule ? `${API}/api/rules/${editingRule.id}` : `${API}/api/rules`
                    
                    // Strictly construct payload for POST to satisfy createRuleSchema
                    const payload = editingRule 
                      ? ruleData 
                      : { 
                          firmId, 
                          parentCustomerId: ruleData.parentCustomerId, 
                          ruleConfig: ruleData.ruleConfig,
                          isDefault: ruleData.isDefault
                        }

                    const res = await fetch(url, {
                      method,
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    })
                    
                    if (!res.ok) {
                      const errorData = await res.json().catch(() => ({}))
                      throw new Error(errorData.error || 'Save failed')
                    }
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
          addToast={addToast}
        />
      )}

      {confirmation.show && (
        <ConfirmationModal
          {...confirmation}
          onClose={() => setConfirmation(prev => ({ ...prev, show: false }))}
        />
      )}
    </div>
  )
}

// ── Secondary Components ───────────────────────────────────────────────────

function RuleForm({ editingRule, prefillId, customers, locations, onSave, onCancel, addToast, firmPlan, firmId }: any) {
  const [ruleType, setRuleType] = useState<RuleType>(editingRule?.ruleType || 'proportional')
  const [parentCustomerId, setParentCustomerId] = useState(editingRule?.parentCustomerId || prefillId || '')
  const [isDefault, setIsDefault] = useState(editingRule?.isDefault || false)
  
  // Standalone weights state - THE SINGLE SOURCE OF TRUTH (with ghost-weight sanitization)
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const initial = editingRule?.ruleConfig?.weights || {}
    const validIds = new Set([
      ...customers.map((c: any) => String(c.id)),
      ...locations.map((l: any) => String(l.id))
    ])
    const clean: Record<string, number> = {}
    Object.entries(initial).forEach(([id, val]) => {
      if (validIds.has(String(id))) {
        clean[id] = Number(val)
      }
    })
    return clean
  })

  // Get parent display name for UI
  const parentName = customers.find((c: any) => c.id === parentCustomerId)?.displayName || parentCustomerId

  // Local filtering: instead of fetching, find children of the selected parent in the customers list we already have
  const subCustomers = customers.filter((c: any) => c.parentId === parentCustomerId)

  const handleSave = () => {
    // Calculate total at the exact moment of click from the current state
    const currentTotal = Object.values(weights).reduce((s: number, v: any) => s + Number(v || 0), 0)
    const currentTotalNum = Number(currentTotal || 0)
    
    if (!parentCustomerId) {
      addToast('Please select a parent customer', 'error')
      return
    }

    if (ruleType === 'proportional' && Math.abs(currentTotalNum - 100) > 0.01) {
      if (currentTotal === 0) {
        addToast('Please allocate at least one percentage weight to a location', 'error')
      } else {
        addToast(`Total weights must sum to exactly 100% (currently ${currentTotal}%)`, 'error')
      }
      return
    }

    // Fixed: Always use the 'weights' state when constructing finalConfig
    let finalConfig: any = { type: ruleType }
    
    if (ruleType === 'proportional') {
      const filteredWeights: Record<string, number> = {}
      Object.entries(weights).forEach(([loc, val]) => {
        if (Number(val) > 0) filteredWeights[loc] = Number(val)
      })
      finalConfig.weights = filteredWeights
    } else if (ruleType === 'oldest_first') {
      // For oldest_first, we use either sub-customers or global locations as fallback
      const targets = subCustomers.length > 0 ? subCustomers : locations
      finalConfig.locationIds = targets.map((l: any) => l.id)
    } else if (ruleType === 'location_priority') {
      const targets = subCustomers.length > 0 ? subCustomers : locations
      finalConfig.order = targets.map((l: any) => l.id)
    }

    onSave({ parentCustomerId, ruleConfig: finalConfig, isActive: true, isDefault })
  }

  // Derived for UI rendering
  const totalAllocated = Object.values(weights).reduce((s: number, v: any) => s + Number(v || 0), 0)
  const totalAllocatedNum = Number(totalAllocated || 0)

  // Determine which location list to use for UI - use Jobs if they exist, otherwise fallback to Departments if parent is selected
  const targetLocations: any[] = subCustomers.length > 0 ? (subCustomers as any[]) : (parentCustomerId ? (locations as any[]) : [])

  const isBalanced = Math.abs(totalAllocatedNum - 100) < 0.01
  const isOver = totalAllocatedNum > 100
  const canSave = ruleType !== 'proportional' || isBalanced

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
            <option key={c.id} value={c.id}>{c.displayName}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3 p-4 bg-surface-2 border border-border rounded-xl cursor-pointer hover:bg-surface-3 transition-all" onClick={() => setIsDefault(!isDefault)}>
        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${isDefault ? 'bg-accent border-accent text-white' : 'border-border-strong bg-surface'}`}>
          {isDefault && <CheckIcon className="w-3.5 h-3.5" />}
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-700 text-text">Set as default fallback rule</span>
          <span className="text-[11px] text-text-3 font-500 line-clamp-1">Applies to all customers without a specific allocation rule</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-[11px] font-800 text-text-3 uppercase tracking-widest ml-1">Splitting Strategy</label>
        <div className="grid grid-cols-1 gap-3">
          {[
            { id: 'proportional', label: 'Proportional Split', desc: 'Distribute by percentage weights', icon: <BarChartIcon className="w-5 h-5" />, minPlan: 'TRIAL' as const },
            { id: 'oldest_first', label: 'First In, First Out', desc: 'Fill invoices from oldest to newest', icon: <LayersIcon className="w-5 h-5" />, minPlan: 'PROFESSIONAL' as const },
            { id: 'location_priority', label: 'Location Priority', desc: 'Waterfall through locations in order', icon: <ZapIcon className="w-5 h-5" />, minPlan: 'PRACTICE' as const },
          ].map((t) => {
            const isLocked = !isPlanAllowed(t.minPlan, (firmPlan || 'TRIAL') as any);
            return (
              <button
                key={t.id}
                disabled={isLocked}
                onClick={() => setRuleType(t.id as RuleType)}
                className={`p-5 rounded-2xl border text-left flex items-start justify-between gap-4 transition-all ${ruleType === t.id ? 'bg-accent/5 border-accent shadow-sm' : 'bg-surface hover:bg-surface-2 border-border'} ${isLocked ? 'opacity-60 grayscale cursor-not-allowed' : ''}`}
              >
                <div className="flex items-start gap-4">
                  <span className={`mt-1 ${ruleType === t.id ? 'text-accent' : 'text-text-3'}`}>{t.icon}</span>
                  <div className="flex flex-col">
                    <span className={`text-[14px] font-800 tracking-tight ${ruleType === t.id ? 'text-accent' : 'text-text'}`}>{t.label}</span>
                    <span className="text-[11px] text-text-3 font-600 uppercase tracking-tight mt-0.5">{t.desc}</span>
                  </div>
                </div>
                {isLocked && <LockIcon className="w-4 h-4 text-text-3" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="pt-8 border-t border-border">
        {ruleType === 'proportional' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-800 text-text-3 uppercase tracking-widest leading-none">Percentage Distribution</span>
              <div className="flex items-center gap-2">
                <span className={`text-[13px] font-900 ${totalAllocated === 100 ? 'text-accent' : 'text-text-3'}`}>
                  {totalAllocated}%
                </span>
                <span className="text-[11px] text-text-3/50 font-bold uppercase">Allocated</span>
              </div>
            </div>

            {!parentCustomerId ? (
               <div className="p-8 bg-surface-2 rounded-3xl border border-dashed border-border text-center">
                <span className="text-[13px] font-600 text-text-3 italic">Please select a parent customer first.</span>
              </div>
            ) : targetLocations.length === 0 ? (
              <div className="p-12 bg-[#ef444408] rounded-3xl border border-dashed border-[#ef444420] text-center">
                <span className="text-[32px] mb-4 block">⚠️</span>
                <h4 className="text-[15px] font-800 text-text mb-2">No Sub-Locations Found</h4>
                <p className="text-[13px] text-text-3 max-w-[300px] mx-auto leading-relaxed">
                  We couldn't find any Jobs or Sub-Customers under <b>{parentName}</b> in your QuickBooks account.
                </p>
              </div>
            ) : (
              <>
                {/* Distribution Visual Bar */}
                <div className="h-2.5 bg-surface-3 rounded-full overflow-hidden flex border border-border/50">
                  {targetLocations.map((loc: any, idx: number) => {
                    const val = Number(weights[loc.id] || 0);
                    if (val <= 0) return null;
                    const colors = ['bg-accent', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500', 'bg-blue-500'];
                    return (
                      <div 
                        key={loc.id} 
                        className={`${colors[idx % colors.length]} h-full transition-all duration-500`} 
                        style={{ width: `${val}%` }} 
                      />
                    );
                  })}
                </div>
                
                <div className="flex flex-col gap-4">
                  {targetLocations.map((loc: any) => {
                    const currentWeight = Number(weights[loc.id] || 0);
                    return (
                      <div key={loc.id} className="group flex flex-col gap-3 p-5 bg-surface rounded-[24px] border border-border hover:border-accent/30 transition-all shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[14px] font-800 text-text leading-tight">{loc.displayName || loc.name}</span>
                            <span className="text-[10px] text-text-3 font-bold uppercase tracking-wider">Sub-Location</span>
                          </div>
                          <div className="flex items-center gap-2">
                             <input
                              type="number"
                              min="0"
                              max="100"
                              value={weights[loc.id] || ''}
                              placeholder="0"
                              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                              onChange={(e) => setWeights({
                                ...weights,
                                [loc.id]: Number(e.target.value)
                              })}
                              className="w-16 bg-surface-2 border border-border rounded-lg p-1 text-center text-[13px] font-mono font-900 text-text outline-none focus:border-accent transition-all"
                            />
                            <span className="text-[12px] text-text-3 font-bold">%</span>
                          </div>
                        </div>
                        
                        <div className="relative h-6 flex items-center group/slider">
                          <input 
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={currentWeight}
                            onChange={(e) => setWeights({
                              ...weights,
                              [loc.id]: Number(e.target.value)
                            })}
                            className="w-full h-1.5 bg-surface-3 rounded-full appearance-none cursor-pointer accent-accent"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {ruleType === 'proportional' && (
              <div className={`p-4 rounded-2xl flex items-center gap-3 border transition-all ${
                isBalanced 
                  ? 'bg-emerald-500/10 border-emerald-500/20' 
                  : isOver 
                    ? 'bg-rose-500/10 border-rose-500/20' 
                    : 'bg-amber-500/10 border-amber-500/20'
              }`}>
                <div className={`w-2 h-2 rounded-full animate-pulse ${
                  isBalanced ? 'bg-emerald-500' : isOver ? 'bg-rose-500' : 'bg-amber-500'
                }`} />
                <div className="flex flex-col">
                  <span className={`text-[13px] font-900 uppercase tracking-tight ${
                    isBalanced ? 'text-emerald-600' : isOver ? 'text-rose-600' : 'text-amber-600'
                  }`}>
                    {isBalanced ? 'Total: 100% (Balanced!)' : `Total: ${totalAllocated}%`}
                  </span>
                  {!isBalanced && (
                    <span className="text-[10px] font-700 opacity-70 uppercase tracking-wider text-text-3">
                      {isOver 
                        ? `${(totalAllocatedNum - 100).toFixed(0)}% OVER-ALLOCATED` 
                        : `${(100 - totalAllocatedNum).toFixed(0)}% REMAINING`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {ruleType !== 'proportional' && (
          <div className="p-8 text-center bg-surface-2 rounded-2xl border border-border border-dashed">
            <p className="text-text-3 text-[12px] font-600">Additional configuration for this strategy will appear here.</p>
          </div>
        )}
      </div>

      <div className="pt-4 flex gap-3">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`flex-1 p-4 rounded-2xl text-[14px] font-800 transition-all shadow-lg ${
            canSave 
              ? 'bg-accent text-white hover:opacity-90 shadow-accent/20' 
              : 'bg-surface-3 text-text-3 cursor-not-allowed grayscale border border-border'
          }`}
        >
          {editingRule ? 'Update Allocation Rule' : 'Save Allocation Rule'}
        </button>
        <button
          onClick={onCancel}
          className="p-4 bg-surface-2 border border-border text-text-3 rounded-2xl text-[14px] font-800 hover:bg-surface-3 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function PricingModal({ currentPlan, onClose, onUpgrade, addToast }: any) {
  const plans = [
    { id: 'TRIAL', name: 'Trial', price: '$0', features: ['Up to 3 Rules', 'Proportional Strategy', 'Basic Audits'], color: 'text-text-3', accent: 'bg-surface-2' },
    { id: 'STANDARD', name: 'Standard', price: '$19', features: ['Up to 3 Rules', 'Proportional Strategy', 'Manual Syncing'], color: 'text-text', accent: 'bg-surface' },
    { id: 'PROFESSIONAL', name: 'Professional', price: '$49', features: ['Unlimited Rules', 'FIFO Allocation', 'Automated Sync'], color: 'text-accent', accent: 'bg-accent/5', popular: true },
    { id: 'PRACTICE', name: 'Practice', price: '$129', features: ['Multi-Entity Priority', 'Full Automation', 'Priority Support'], color: 'text-indigo-500', accent: 'bg-indigo-500/5' },
  ]

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 max-[768px]:p-0">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
      <div className="bg-surface border border-border rounded-[40px] w-full max-w-[1200px] p-10 relative z-10 shadow-3xl animate-fadeIn max-[1024px]:p-6 max-[1024px]:rounded-[24px] max-h-[95vh] overflow-y-auto custom-scrollbar max-[768px]:rounded-none max-[768px]:h-full max-[768px]:max-h-none">
        <div className="text-center mb-10 max-[768px]:mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-[11px] font-800 uppercase tracking-widest mb-4">
            <SparklesIcon className="w-3.5 h-3.5" />
            Flexible Plans
          </div>
          <h2 className="font-display text-[40px] max-[768px]:text-[28px] font-800 tracking-tight text-text mb-3 leading-tight">Scale Your Operation</h2>
          <p className="text-text-3 text-[16px] max-[768px]:text-[14px]">Choose the tier that matches your firm's volume.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map(p => (
            <div 
              key={p.id} 
              className={`relative p-6 rounded-[32px] border flex flex-col gap-6 transition-all duration-300 hover:scale-[1.02] ${
                currentPlan === p.id 
                  ? 'border-accent ring-1 ring-accent/50 bg-accent/[0.03]' 
                  : 'border-border bg-surface-2 hover:bg-surface hover:border-text/20'
              }`}
            >
              {p.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-accent text-white text-[10px] font-900 uppercase tracking-widest shadow-lg z-20">
                  Most Popular
                </div>
              )}
              
              <div className="flex flex-col">
                <span className={`text-[12px] font-800 uppercase tracking-widest ${p.color}`}>{p.name}</span>
                <div className="flex items-baseline gap-1 mt-3">
                  <span className="text-[32px] font-900 text-text tracking-tight">{p.price}</span>
                  <span className="text-[14px] text-text-3 font-bold">/mo</span>
                </div>
              </div>

              <div className="flex flex-col gap-3.5 flex-1 min-h-[140px]">
                {p.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="mt-1">
                      <CheckIcon className={`w-4 h-4 ${currentPlan === p.id ? 'text-accent' : 'text-text-3/50'}`} />
                    </div>
                    <span className="text-[13.5px] font-600 text-text-2 leading-tight">{f}</span>
                  </div>
                ))}
              </div>

              <button
                disabled={currentPlan === p.id}
                onClick={() => onUpgrade(p.id)}
                className={`w-full p-4 rounded-2xl text-[13px] font-800 transition-all shadow-sm ${
                  currentPlan === p.id 
                    ? 'bg-border/50 text-text-3 cursor-default' 
                    : p.popular 
                      ? 'bg-accent text-white hover:bg-accent-deep shadow-accent/20' 
                      : 'bg-text text-bg hover:bg-text/90'
                }`}
              >
                {currentPlan === p.id ? 'Current Plan' : 'Select Plan'}
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 bg-surface-2 border border-border rounded-full flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-3 transition-all transition-transform hover:scale-110"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function ConfirmationModal({ title, message, confirmText, onConfirm, onClose, type }: any) {
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 max-[480px]:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fadeIn" onClick={onClose} />
      <div className="bg-surface border border-border rounded-[32px] w-full max-w-[420px] p-8 relative z-10 shadow-3xl animate-slideUp max-[480px]:p-6 max-[480px]:rounded-[24px]">
        <div className="flex flex-col items-center text-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-[24px] ${type === 'danger' ? 'bg-[#ef444410] text-[#ef4444] border border-[#ef444420]' : 'bg-accent/10 text-accent border border-accent/20'}`}>
            {type === 'danger' ? <AlertIcon className="w-8 h-8" /> : <InfoIcon className="w-8 h-8" />}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-display text-[20px] font-800 text-text tracking-tight">{title}</h3>
            <p className="text-text-3 text-[14px] leading-relaxed font-500">{message}</p>
          </div>
          <div className="flex flex-col w-full gap-3 mt-4">
            <button
              onClick={onConfirm}
              className={`w-full p-4 rounded-2xl text-[14px] font-800 transition-all shadow-lg ${type === 'danger' ? 'bg-[#ef4444] text-white hover:opacity-90' : 'bg-accent text-white hover:opacity-90'}`}
            >
              {confirmText}
            </button>
            <button
              onClick={onClose}
              className="w-full p-4 bg-surface-2 border border-border text-text-2 rounded-2xl text-[14px] font-800 hover:bg-surface-3 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
