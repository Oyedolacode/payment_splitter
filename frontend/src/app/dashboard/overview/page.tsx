'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { CashSummaryCards } from '../../../components/insights/CashSummaryCards'
import { ClientTable } from '../../../components/insights/ClientTable'
import { AlertsPanel } from '../../../components/insights/AlertsPanel'
import { LogoIcon, SparklesIcon, Chevron, InfoIcon } from '../../../components/common/Icons'
import { ThemeToggle } from '../../../components/common/ThemeToggle'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function OverviewPage() {
  const [summary, setSummary] = useState<any>(null)
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [secondsAgo, setSecondsAgo] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      const [summRes, alRes] = await Promise.all([
        fetch(`${API_URL}/api/insights/dashboard`),
        fetch(`${API_URL}/api/insights/alerts`)
      ])

      if (summRes.ok) setSummary(await summRes.json())
      if (alRes.ok) setAlerts(await alRes.json())
      
      setLastUpdated(new Date())
      setSecondsAgo(0)
    } catch (err) {
      console.error('Failed to fetch overview data', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const pollInterval = setInterval(fetchData, 45000) // 45 seconds refresh
    const timerInterval = setInterval(() => {
        setSecondsAgo(prev => prev + 1)
    }, 1000)
    
    return () => {
        clearInterval(pollInterval)
        clearInterval(timerInterval)
    }
  }, [fetchData])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-text-3 font-display font-800 text-[12px] tracking-widest uppercase">Fetching Operations Overview...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-accent/20">
      <nav className="fixed top-0 left-0 right-0 h-16 bg-surface/60 backdrop-blur-xl border-b border-border z-[100] px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-accent/10 rounded-xl flex items-center justify-center border border-accent/20 text-accent">
            <LogoIcon />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-800 text-[14px] leading-tight tracking-tight uppercase">PaySplit Operations</span>
            <span className="text-[9px] text-text-3 font-extrabold uppercase tracking-widest bg-surface-2 px-1.5 py-0.5 rounded border border-border">Management Console</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-2/60 border border-border rounded-xl">
            <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-[10px] font-bold text-text-3 uppercase">Live Operations</span>
          </div>
          <ThemeToggle />
          <button 
            onClick={() => window.location.href = '/dashboard'}
            className="flex items-center gap-2 p-[6px_16px] bg-accent text-white rounded-xl text-[11px] font-800 hover:opacity-90 transition-all shadow-lg shadow-accent/20"
          >
            Terminal View
          </button>
        </div>
      </nav>

      <main className="pt-24 pb-16 px-12 max-[1200px]:px-6 max-w-[1600px] mx-auto">
        <header className="flex items-end justify-between mb-10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-1">
                <SparklesIcon className="w-4 h-4 text-accent" />
                <span className="text-[11px] font-bold text-accent uppercase tracking-widest">Financial Ops Layer</span>
            </div>
            <h1 className="font-display text-[42px] max-[768px]:text-[32px] font-800 tracking-tight text-text leading-tight">Entity Overview</h1>
            <p className="text-text-3 text-[15px] max-w-[500px] font-medium">Real-time health monitoring and automated reconciliation metrics across your entire fleet.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-accent uppercase tracking-[0.15em]">Auto-refreshing</span>
            </div>
            <div className="flex items-center gap-3 bg-surface-2 px-4 py-2.5 rounded-[20px] border border-border shadow-sm">
                <span className="text-[10px] font-bold text-text-3 uppercase tracking-widest border-r border-border pr-3">Last Updated</span>
                <span className="text-[13px] font-800 text-text tracking-tight">
                    {secondsAgo < 5 ? 'Just now' : `${secondsAgo} seconds ago`}
                </span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-8">
          {/* Main Dashboard Section */}
          <div className="col-span-12 xl:col-span-8">
            <CashSummaryCards stats={summary?.global} />
            
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-800 text-[18px] text-text tracking-tight">Active Clients</h3>
                <div className="flex items-center gap-2">
                    <div className="px-3 py-1 bg-[#10b98110] border border-[#10b98120] rounded-full text-[10px] font-bold text-[#10b981] uppercase tracking-wider">
                        {summary?.global?.healthyCount} Healthy
                    </div>
                </div>
            </div>
            
            <ClientTable firms={summary?.firms || []} />
          </div>

          {/* Sidebar / Alerts Section */}
          <div className="col-span-12 xl:col-span-4 flex flex-col gap-8">
            <div className="bg-surface/60 backdrop-blur-xl border border-border rounded-[32px] p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-display font-800 text-[18px] text-text tracking-tight">Operational Alerts</h3>
                    <div className="px-2 py-0.5 bg-[#ef444410] border border-[#ef444420] rounded-full text-[10px] font-black text-[#ef4444] uppercase">
                        {alerts.length}
                    </div>
                </div>
                <AlertsPanel alerts={alerts} />
            </div>

            <div className="bg-gradient-to-br from-accent/5 to-transparent border border-accent/15 rounded-[32px] p-8 flex flex-col gap-4 relative overflow-hidden group">
                <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-accent/5 rounded-full blur-3xl group-hover:scale-125 transition-transform" />
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-accent/20 text-accent mb-2 shadow-xl">
                    <SparklesIcon className="w-6 h-6" />
                </div>
                <h4 className="font-display font-800 text-[20px] text-text tracking-tight leading-tight">Upgrade to Professional for Unlimited Entities</h4>
                <p className="text-[13px] text-text-3 font-medium leading-relaxed">Scale your operations with advanced white-label reports and automated audit trails for every sub-location.</p>
                <button className="flex items-center justify-center gap-2 w-full py-3.5 bg-accent text-white rounded-2xl text-[13px] font-800 mt-2 hover:opacity-90 shadow-xl shadow-accent/20 transition-all">
                    Unlock Premium Controls
                    <Chevron className="w-4 h-4 rotate-[-90deg]" />
                </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Empty State Fallback Info */}
      <footer className="py-12 px-12 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-accent rounded-full" />
                <span className="text-[11px] font-bold text-text-3 uppercase tracking-widest">PaySplit Engine v2.4</span>
            </div>
            <div className="flex items-center gap-2 opacity-50 grayscale hover:opacity-100 hover:grayscale-0 transition-all cursor-help group">
                <InfoIcon className="w-4 h-4" />
                <span className="text-[11px] font-bold text-text-3 uppercase tracking-widest group-hover:text-accent">Data derivation logic</span>
            </div>
        </div>
        <p className="text-[11px] font-bold text-text-3 uppercase tracking-[0.2em] opacity-40">© 2026 Financial Operations Layer</p>
      </footer>
    </div>
  )
}
