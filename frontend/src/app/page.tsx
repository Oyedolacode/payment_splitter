'use client'

import { useState, useEffect, Fragment } from 'react'
import { ThemeToggle } from '../components/ThemeToggle'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ── Animated split diagram ────────────────────────────────────────────────────

function SplitDiagram() {
  return (
    <div className="bg-surface border border-border rounded-[16px] p-[28px_24px_24px] shadow-[0_24px_80px_rgba(0,0,0,0.05)]">
      <div className="font-mono text-[10px] font-bold tracking-[2.5px] text-text-3 mb-5 opacity-70">LIVE PAYMENT SPLIT</div>
      <div className="text-center mb-2">
        <div className="font-mono text-[28px] font-medium text-text tracking-[-1px] animate-countUp">$50,000.00</div>
        <div className="text-[11px] text-text-3 mt-1">Bulk payment received · 0.3s ago</div>
      </div>
      <div className="h-[80px] mx-[-8px]">
        <svg viewBox="0 0 200 100" fill="none" className="w-full h-full">
          <path d="M100 10 L40 60" stroke="#2d31fa" strokeWidth="1.5" strokeDasharray="4 3" className="animate-dashFlow stroke-accent" />
          <path d="M100 10 L100 60" stroke="#2d31fa" strokeWidth="1.5" strokeDasharray="4 3" className="animate-dashFlow stroke-accent [animation-delay:0.2s]" />
          <path d="M100 10 L160 60" stroke="#2d31fa" strokeWidth="1.5" strokeDasharray="4 3" className="animate-dashFlow stroke-accent [animation-delay:0.4s]" />
          <circle cx="100" cy="10" r="4" fill="#2d31fa" />
          <circle cx="40" cy="60" r="3" fill="#10b981" fillOpacity=".6" />
          <circle cx="100" cy="60" r="3" fill="#10b981" fillOpacity=".6" />
          <circle cx="160" cy="60" r="3" fill="#10b981" fillOpacity=".6" />
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-[10px] mb-5">
        {[
          { label: 'Branch A', amount: '$20,000', pct: '40%', delay: '0s' },
          { label: 'Branch B', amount: '$18,000', pct: '36%', delay: '0.12s' },
          { label: 'Branch C', amount: '$12,000', pct: '24%', delay: '0.24s' },
        ].map(b => (
          <div key={b.label} className="bg-surface-2 border border-border rounded-[10px] py-3 px-[10px] text-center animate-fadeUp transition-colors hover:border-border-strong" style={{ animationDelay: b.delay }}>
            <div className="font-mono text-[11px] text-accent font-bold mb-[5px]">{b.pct}</div>
            <div className="font-display text-[14px] font-bold text-text tracking-[-0.3px] mb-[4px]">{b.amount}</div>
            <div className="text-[10px] text-text-3 uppercase tracking-[0.5px]">{b.label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center border-t border-border pt-4 gap-0">
        <div className="flex-1 text-center flex flex-col gap-[3px]">
          <span className="font-mono text-[13px] text-accent-2 font-bold">0.3s</span>
          <span className="text-[10px] text-text-3 uppercase tracking-[0.4px]">processing</span>
        </div>
        <div className="w-[1px] bg-border h-7" />
        <div className="flex-1 text-center flex flex-col gap-[3px]">
          <span className="font-mono text-[13px] text-accent-2 font-bold">$0.00</span>
          <span className="text-[10px] text-text-3 uppercase tracking-[0.4px]">rounding error</span>
        </div>
        <div className="w-[1px] bg-border h-7" />
        <div className="flex-1 text-center flex flex-col gap-[3px]">
          <span className="font-mono text-[13px] text-accent-2 font-bold">3</span>
          <span className="text-[10px] text-text-3 uppercase tracking-[0.4px]">audit entries</span>
        </div>
      </div>
    </div>
  )
}

// ── Onboarding modal ──────────────────────────────────────────────────────────

function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [firmName, setFirmName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'name' | 'connect'>('name')
  const [firmId, setFirmId] = useState('')

  async function createFirm() {
    if (!firmName.trim()) { setError('Please enter your firm name'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/auth/firms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: firmName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create firm')
      setFirmId(data.id)
      localStorage.setItem('ps_firm_id', data.id)
      setStep('connect')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-[rgba(0,0,0,0.4)] backdrop-blur-[8px] flex items-center justify-center p-6 animate-fadeIn" onClick={onClose}>
      <div className="bg-surface border border-border rounded-[18px] p-9 w-full max-w-[440px] relative animate-slideUp shadow-[0_32px_80px_rgba(0,0,0,0.1)]" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="absolute top-3 right-3 bg-surface-2 border border-border text-[#5a5a72] rounded-[8px] w-[30px] h-[30px] flex items-center justify-center text-[12px] cursor-pointer transition-all hover:text-text hover:bg-surface-3" onClick={onClose} aria-label="Close modal">✕</button>

        {/* Brand mark */}
        <div className="flex items-center gap-2 font-display text-[15px] font-800 text-text tracking-[-0.4px] mb-5">
          <svg width="32" height="32" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="1" width="9" height="9" rx="3" fill="#2d31fa" />
            <rect x="12" y="1" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".25" />
            <rect x="1" y="12" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".25" />
            <rect x="12" y="12" width="9" height="9" rx="3" fill="#10b981" />
          </svg>
          <span>PaySplit</span>
        </div>

        {/* Progress bar */}
        <div className="h-[3px] bg-border rounded-[100px] mb-6 overflow-hidden">
          <div className={`h-full bg-accent rounded-[100px] transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] ${step === 'name' ? 'w-1/2' : 'w-full'}`} />
        </div>

        {/* Steps */}
        <div className="flex items-center gap-0 mb-8 pr-10 mt-1">
          <div className={`flex items-center gap-2 text-[12px] font-600 transition-colors ${step === 'name' ? 'text-text' : 'text-accent-2'}`}>
            <span className={`w-[22px] h-[22px] rounded-full border flex items-center justify-center text-[10px] font-700 flex-shrink-0 ${step === 'connect' ? 'bg-accent-2 border-accent-2 text-white' : 'bg-accent-glow border-accent text-accent'}`}>{step === 'connect' ? '✓' : '1'}</span>
            Firm details
          </div>
          <div className="flex-1 h-[1px] bg-border mx-3 opacity-60" />
          <div className={`flex items-center gap-2 text-[12px] font-600 transition-colors ${step === 'connect' ? 'text-text' : 'text-text-3'}`}>
            <span className={`w-[22px] h-[22px] rounded-full border border-border bg-surface-2 flex items-center justify-center text-[10px] font-700 flex-shrink-0 ${step === 'connect' ? 'bg-accent-glow border-accent text-accent' : ''}`}>2</span>
            Connect QBO
          </div>
        </div>

        {step === 'name' ? (
          <>
            <h2 className="font-display text-[22px] font-800 text-text tracking-[-0.5px] mb-[6px]" id="modal-title">Start your free trial</h2>
            <p className="text-[13px] text-text-3 mb-6 leading-[1.6]">30 days free · No credit card required</p>
            <div className="mb-2">
              <label className="block text-[12px] font-600 text-text-2 uppercase tracking-[0.6px] mb-2">Firm name</label>
              <input
                className="w-full bg-surface-2 border border-border-strong rounded-[10px] p-[13px_16px] text-[14px] text-text font-body outline-none transition-all focus:border-accent box-border"
                type="text"
                placeholder="e.g. Acme Accounting Partners"
                value={firmName}
                onChange={e => { setFirmName(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && createFirm()}
                autoFocus
              />
            </div>
            {error && <div className="text-[12px] text-[#ff6b6b] mb-3 p-[8px_12px] bg-[rgba(255,77,106,0.06)] border border-[rgba(255,77,106,0.15)] rounded-[8px]">⚠ {error}</div>}
            <button className="w-full mt-4 bg-text text-bg border-none rounded-[11px] p-3.5 font-display text-[14px] font-800 cursor-pointer transition-all hover:opacity-[0.88] hover:-translate-y-px shadow-[0_4px_20px_rgba(0,0,0,0.1)] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none" onClick={createFirm} disabled={loading}>
              {loading ? 'Creating account…' : 'Continue →'}
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display text-[22px] font-800 text-text tracking-[-0.5px] mb-[6px]" id="modal-title">Connect QuickBooks</h2>
            <p className="text-[13px] text-text-3 mb-6 leading-[1.6]">
              Authorize PaySplit to read invoices and post split payments on your behalf.
            </p>
            <div className="bg-surface-2 border border-border rounded-[12px] p-4 mb-5 flex flex-col gap-[11px]">
              {[
                { ok: true, text: 'Read invoices and customer records' },
                { ok: true, text: 'Create split payment entries' },
                { ok: true, text: 'Receive real-time payment webhooks' },
                { ok: false, text: 'Access bank accounts or payroll' },
              ].map(p => (
                <div key={p.text} className="flex items-center gap-2.5 text-[13px]">
                  <span className={`font-bold text-[11px] ${p.ok ? 'text-accent-2' : 'text-text-3'}`}>{p.ok ? '✓' : '✕'}</span>
                  <span className={p.ok ? 'text-text-2' : 'text-text-3'}>{p.text}</span>
                </div>
              ))}
            </div>
            <button
              className="w-full bg-surface border border-accent-2 text-accent-2 rounded-[11px] p-3.5 flex items-center justify-center gap-2.5 font-display text-[13.5px] font-800 cursor-pointer transition-all hover:bg-accent-glow hover:-translate-y-px"
              onClick={() => { 
                const connectUrl = `${API}/auth/qbo/connect?firmId=${firmId}`
                window.location.assign(connectUrl) 
              }}
              aria-label="Connect with QuickBooks Online"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="8" fill="#2CA01C" />
                <path d="M4.5 8.5l2.2 2.2L11.5 5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Connect with QuickBooks Online →
            </button>
            <p className="text-[11.5px] text-text-3 text-center mt-3.5 leading-[1.6]">
              Redirects to Intuit. Takes 30 seconds. Your data is encrypted at rest.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── FAQ Accordion ─────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'Does it work with my existing QuickBooks Online setup?',
    a: 'Yes — PaySplit connects via official QBO OAuth. No data migration, no CSV exports, no QBO reinstall. Your existing chart of accounts, customers, and invoices remain exactly as they are.'
  },
  {
    q: 'What happens if a payment split doesn\'t balance to zero?',
    a: 'PaySplit uses integer arithmetic and distributes any rounding remainder to the largest branch. Every job logs the exact cent allocation so your audit trail always balances. There\'s never a $0.01 gap floating in your books.'
  },
  {
    q: 'Can I change or delete split rules after setup?',
    a: 'Anytime. Rules take effect on the next incoming payment — existing allocations are never retroactively changed. You can toggle a rule off, adjust percentages, or delete it entirely from the dashboard.'
  },
  {
    q: 'Is my QuickBooks data secure?',
    a: 'PaySplit only requests the minimum OAuth scopes needed (read invoices, post payments). We never store your QBO credentials — only the secure OAuth token. All data is encrypted in transit and at rest.'
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from the Settings tab — your subscription ends at the next billing date. No cancellation fees, no lock-in. Your QBO data is never affected by cancellation.'
  },
  {
    q: 'What happens when my 30-day trial ends?',
    a: 'You\'ll receive an email 3 days before trial expiry. If you don\'t upgrade, the webhook listener pauses — QBO still works normally, payments just won\'t be auto-split. You can upgrade and resume anytime without losing your rules.'
  },
]

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section className="relative z-[1] p-[100px_40px] border-t border-border max-[768px]:p-[72px_24px]" id="faq">
      <div className="max-w-[1200px] mx-auto">
        <div className="font-mono text-[10px] tracking-[2.5px] text-accent mb-5 opacity-80">FAQ</div>
        <h2 className="font-display text-[clamp(28px,3.5vw,42px)] font-800 leading-[1.15] tracking-[-1px] text-text mb-[60px]">Everything you need to know.</h2>
        <div className="flex flex-col gap-0 border border-border rounded-[16px] overflow-hidden max-w-[860px]">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className={`border-b border-border transition-colors last:border-b-0 ${open === i ? 'bg-surface-2' : ''}`}>
              <button
                className="w-full flex items-center justify-between gap-5 p-[20px_24px] bg-transparent border-none cursor-pointer text-left text-[14.5px] font-600 text-text font-body transition-colors hover:text-accent"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                aria-controls={`faq-answer-${i}`}
              >
                <span>{item.q}</span>
                <span className={`text-[20px] font-300 text-text-3 shrink-0 leading-none transition-colors ${open === i ? 'text-accent' : ''}`}>{open === i ? '−' : '+'}</span>
              </button>
              {open === i && (
                <div id={`faq-answer-${i}`} className="p-[0_24px_20px] text-[13.5px] leading-[1.7] text-text-2 animate-fadeUp">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: "We used to spend 3 hours every Monday morning splitting payments across our 4 locations in Excel. PaySplit cut that to zero. Literally zero — it just happens.",
    name: "Rebecca Thorn",
    title: "Managing Partner",
    firm: "Thorn & Associates CPAs",
    location: "Toronto, ON",
    stat: "12 hrs/week recovered"
  },
  {
    quote: "The audit trail alone is worth the subscription. When our client had a tax review, I pulled the split history in 30 seconds. The auditor was genuinely impressed.",
    name: "David Okeke",
    title: "Controller",
    firm: "Greenfield Accounting Group",
    location: "Chicago, IL",
    stat: "$0 discrepancies in 8 months"
  },
  {
    quote: "I was skeptical — we've tried 3 other tools that all required full QBO migrations. PaySplit connected to our live company in 4 minutes and worked on the first payment.",
    name: "Sarah Lim",
    title: "Founder",
    firm: "Lim Advisory Services",
    location: "Vancouver, BC",
    stat: "Setup in under 5 minutes"
  },
]

export default function LandingPage() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  // Redirect to dashboard if already onboarded
  useEffect(() => {
    const firmId = localStorage.getItem('ps_firm_id')
    if (firmId && window.location.pathname === '/') {
      // router.push(`/dashboard?id=${firmId}`)
    }
  }, [router])

  return (
    <div className={`min-h-screen bg-bg text-text font-body relative overflow-x-hidden transition-colors duration-300 ${showMobileMenu ? 'overflow-hidden h-screen' : ''}`}>
      <div className="fixed inset-0 bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] bg-[length:52px_52px] pointer-events-none z-0" />
      <div className="hidden" />
      <div className="hidden" />

      {/* Nav */}
      <nav className="sticky top-0 z-[100] bg-header-bg backdrop-blur-[24px] border-b border-border">
        <div className="max-w-[1200px] mx-auto px-10 h-[60px] flex items-center gap-8 max-[480px]:px-5">
          <div className="flex items-center gap-[9px] font-display text-[15px] font-800 text-text tracking-[-0.6px] shrink-0 no-underline -translate-y-[0.5px]" aria-label="PaySplit logo">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" rx="3" fill="#2d31fa" />
              <rect x="12" y="1" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".2" />
              <rect x="1" y="12" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".2" />
              <rect x="12" y="12" width="9" height="9" rx="3" fill="#10b981" />
            </svg>
            PaySplit
          </div>
          <nav id="mobile-menu-links" className={`flex items-center gap-1 flex-1 max-[768px]:fixed max-[768px]:top-[60px] max-[768px]:inset-0 max-[768px]:bg-bg max-[768px]:flex-col max-[768px]:p-[32px_24px] max-[768px]:gap-2 max-[768px]:z-[100] max-[768px]:transition-transform max-[768px]:duration-300 max-[768px]:ease-[cubic-bezier(0.4,0,0.2,1)] max-[768px]:items-stretch ${showMobileMenu ? 'max-[768px]:translate-x-0' : 'max-[768px]:translate-x-full'}`} aria-label="Main navigation">
            <Link href="#how" className="text-[13px] font-500 text-text-2 px-[13px] py-[6px] rounded-lg no-underline transition-all hover:text-text hover:bg-surface-2 max-[768px]:text-[18px] max-[768px]:p-[16px_20px] max-[768px]:bg-surface max-[768px]:border max-[768px]:border-border max-[768px]:font-600" onClick={() => setShowMobileMenu(false)}>How it works</Link>
            <Link href="#pricing" className="text-[13px] font-500 text-text-2 px-[13px] py-[6px] rounded-lg no-underline transition-all hover:text-text hover:bg-surface-2 max-[768px]:text-[18px] max-[768px]:p-[16px_20px] max-[768px]:bg-surface max-[768px]:border max-[768px]:border-border max-[768px]:font-600" onClick={() => setShowMobileMenu(false)}>Pricing</Link>
            <Link href="#faq" className="text-[13px] font-500 text-text-2 px-[13px] py-[6px] rounded-lg no-underline transition-all hover:text-text hover:bg-surface-2 max-[768px]:text-[18px] max-[768px]:p-[16px_20px] max-[768px]:bg-surface max-[768px]:border max-[768px]:border-border max-[768px]:font-600" onClick={() => setShowMobileMenu(false)}>FAQ</Link>
            <Link href="/dashboard" className="text-[13px] font-500 text-text-2 px-[13px] py-[6px] rounded-lg no-underline transition-all hover:text-text hover:bg-surface-2 max-[768px]:text-[18px] max-[768px]:p-[16px_20px] max-[768px]:bg-surface max-[768px]:border max-[768px]:border-border max-[768px]:font-600" onClick={() => setShowMobileMenu(false)}>Sign in</Link>
            <div className="hidden max-[768px]:flex max-[768px]:p-6 max-[768px]:border-t max-[768px]:border-border max-[768px]:mt-auto max-[768px]:justify-center">
              <ThemeToggle />
            </div>
          </nav>

          <div className="flex items-center gap-4 shrink-0 max-[768px]:gap-2">
            <div className="block max-[768px]:hidden">
              <ThemeToggle />
            </div>
            <button className="bg-text text-bg border-none rounded-[9px] p-[9px_20px] font-display text-[13px] font-800 cursor-pointer whitespace-nowrap transition-all hover:opacity-[0.88] hover:-translate-y-px tracking-[-0.1px]" onClick={() => setShowModal(true)}>
              Start free trial
            </button>
            <button
              className="hidden max-[768px]:flex items-center justify-center bg-surface-2 border border-border text-text w-[38px] h-[38px] rounded-[9px] cursor-pointer text-[18px] z-[101]"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
              aria-expanded={showMobileMenu}
              aria-controls="mobile-menu-links"
            >
              {showMobileMenu ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-[1] p-[100px_40px_80px] max-[768px]:px-6 max-[768px]:py-[72px_24px_60px]">
        <div className="max-w-[1200px] mx-auto grid grid-cols-[1fr_480px] gap-[100px] items-center max-[1024px]:grid-cols-1 max-[1024px]:gap-[60px] max-[1024px]:text-center">
          <div className="animate-fadeUp max-[1024px]:flex max-[1024px]:flex-col max-[1024px]:items-center">
            <div className="inline-flex items-center gap-[7px] text-[11px] font-700 uppercase tracking-[1px] text-accent bg-accent-glow border border-accent rounded-[20px] p-[5px_13px] mb-7">
              <span className="w-[6px] h-[6px] rounded-full bg-accent animate-pulseDot" />
              Built for multi-entity accounting firms
            </div>
            <h1 className="font-display text-[clamp(42px,5.5vw,68px)] font-800 leading-[1.06] tracking-[-2.5px] text-text mb-6 max-[480px]:text-[32px] max-[480px]:tracking-[-1px] max-[768px]:text-[38px]">
              Your $50K payment,<br />split in{' '}
              <em className="not-italic text-accent">300ms.</em>
            </h1>
            <p className="text-[16px] leading-[1.7] text-text-2 max-w-[480px] mb-9 max-[1024px]:mx-auto">
              PaySplit intercepts your QuickBooks payments and automatically routes them
              across branch locations — proportionally, oldest-first, or by priority.
              Full audit trail. Zero manual work.
            </p>
            <div className="flex items-center gap-0 mb-10 bg-surface border border-border rounded-[12px] py-[18px] w-fit shadow-[0_4px_20px_rgba(0,0,0,0.02)] max-[1024px]:mx-auto max-[768px]:flex-col max-[768px]:w-full">
              {[
                { val: '$42K', key: 'avg. annual labor saved' },
                { val: '3–5d', key: 'A/R delay eliminated' },
                { val: '100%', key: 'audit-ready records' },
              ].map((s, i) => (
                <Fragment key={s.val}>
                  {i > 0 && <div className="w-[1px] bg-border self-stretch max-[768px]:w-full max-[768px]:h-[1px]" />}
                  <div className="flex flex-col gap-1 px-7 text-center">
                    <span className="font-mono text-[22px] font-500 text-accent tracking-[-0.5px]">{s.val}</span>
                    <span className="text-[11px] text-text-3 uppercase tracking-[0.5px]">{s.key}</span>
                  </div>
                </Fragment>
              ))}
            </div>
            <div className="flex items-center gap-4 mb-4 flex-wrap max-[1024px]:justify-center">
              <button className="bg-text text-bg border-none rounded-[11px] p-[14px_28px] font-display text-[14px] font-800 cursor-pointer tracking-[-0.2px] transition-all hover:opacity-90 hover:-translate-y-[2px] shadow-[0_4px_24px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.15)]" onClick={() => setShowModal(true)}>
                Start 30-day free trial →
              </button>
              <Link href="#how" className="text-[14px] font-600 text-text-3 no-underline p-[14px_4px] transition-colors hover:text-text-2">See how it works ↓</Link>
            </div>
            <p className="text-[12px] text-text-3">No credit card · Works with existing QBO · Setup in 2 min</p>
          </div>
          <div className="animate-fadeUp [animation-delay:0.1s] max-[1024px]:max-w-[480px] max-[1024px]:mx-auto">
            <SplitDiagram />
          </div>
        </div>
      </section>

      {/* Trusted By */}
      <div className="border-t border-b border-border p-[28px_40px] relative z-[1] max-[768px]:p-[20px_24px]">
        <div className="max-w-[1200px] mx-auto flex items-center gap-10 flex-wrap max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-4">
          <span className="text-[11px] font-700 uppercase tracking-[1.2px] text-text-3 shrink-0">Used by accounting firms across North America</span>
          <div className="flex items-center gap-[32px] flex-wrap">
            {['Firm A', 'Firm B', 'Firm C', 'Firm D', 'Firm E'].map((name) => (
              <div key={name} className="text-text-3 opacity-50 transition-opacity hover:opacity-80">
                <svg width="80" height="24" viewBox="0 0 80 24" fill="none">
                  <rect x="0" y="6" width="20" height="12" rx="2" fill="currentColor" fillOpacity="0.15" />
                  <rect x="24" y="9" width="40" height="6" rx="2" fill="currentColor" fillOpacity="0.15" />
                  <rect x="68" y="6" width="12" height="12" rx="2" fill="currentColor" fillOpacity="0.1" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <section className="relative z-[1] p-[100px_40px] border-t border-border max-[768px]:p-[72px_24px]" id="how">
        <div className="max-w-[1200px] mx-auto">
          <div className="font-mono text-[10px] tracking-[2.5px] text-accent mb-5 opacity-80">HOW IT WORKS</div>
          <h2 className="font-display text-[clamp(28px,3.5vw,42px)] font-800 leading-[1.15] tracking-[-1px] text-text mb-[60px]">Connected in 2 minutes.<br />Runs forever after.</h2>
          <div className="grid grid-cols-3 gap-8 max-[1024px]:grid-cols-1 max-[1024px]:gap-4">
            {[
              { num: '01', title: 'Connect QBO', body: 'Authorize PaySplit with one click. We connect to your existing QuickBooks Online company — no migration, no data export.' },
              { num: '02', title: 'Configure split rules', body: 'Set proportional weights, oldest-first waterfall, or location priority rules per client. Change anytime without touching QBO.' },
              { num: '03', title: 'Payments split automatically', body: 'When a bulk payment hits QBO, PaySplit intercepts it via webhook, calculates the split, posts allocations, and logs the audit trail — in under a second.' },
            ].map((s, i) => (
              <div key={s.num} className="p-8 bg-surface border border-border rounded-[14px] transition-all duration-200 animate-fadeUp hover:border-accent hover:-translate-y-[2px] hover:shadow-[0_8px_32px_rgba(0,0,0,0.03)]" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="font-mono text-[11px] tracking-[1px] text-accent mb-[16px] opacity-70">{s.num}</div>
                <h3 className="font-display text-[17px] font-bold text-text mb-[12px] tracking-[-0.3px]">{s.title}</h3>
                <p className="text-[14px] leading-[1.7] text-text-2">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative z-[1] p-[100px_40px] border-t border-border max-[768px]:p-[72px_24px]" id="testimonials">
        <div className="max-w-[1200px] mx-auto">
          <div className="font-mono text-[10px] tracking-[2.5px] text-accent mb-5 opacity-80">TESTIMONIALS</div>
          <h2 className="font-display text-[clamp(28px,3.5vw,42px)] font-800 leading-[1.15] tracking-[-1px] text-text mb-[60px]">Trusted by firms who can&apos;t afford<br />to get payments wrong.</h2>
          <div className="grid grid-cols-3 gap-5 max-[1024px]:grid-cols-1 max-[1024px]:max-w-[540px]">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-surface border border-border rounded-[16px] p-8 transition-all duration-200 flex flex-col gap-5 hover:border-border-strong hover:shadow-[0_8px_32px_rgba(0,0,0,0.04)]">
                <div className="inline-block text-[11px] font-800 uppercase tracking-[0.8px] text-accent-2 bg-accent-2-glow border border-accent-2 p-[4px_10px] rounded-[20px] self-start">{t.stat}</div>
                <p className="text-[14.5px] leading-[1.75] text-text-2 flex-1 italic">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3 pt-4 border-t border-border">
                  <div className="w-10 h-10 rounded-full bg-accent-glow border border-accent text-accent text-[13px] font-800 flex items-center justify-center shrink-0 font-display">
                    {t.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="text-[13px] font-700 text-text mb-[2px]">{t.name}</div>
                    <div className="text-[11.5px] text-text-2">{t.title} · {t.firm}</div>
                    <div className="text-[11px] text-text-3 mt-[2px]">{t.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative z-[1] p-[100px_40px] border-t border-border max-[768px]:p-[72px_24px]" id="pricing">
        <div className="max-w-[1200px] mx-auto">
          <div className="font-mono text-[10px] tracking-[2.5px] text-accent mb-5 opacity-80">PRICING</div>
          <h2 className="font-display text-[clamp(28px,3.5vw,42px)] font-800 leading-[1.15] tracking-[-1px] text-text mb-[60px]">Built to scale with your practice.<br />Start free.</h2>
          <div className="grid grid-cols-3 gap-5 mb-7 items-start max-[1024px]:grid-cols-1 max-[1024px]:max-w-[440px] max-[1024px]:mx-auto">
            {[
              {
                name: 'Standard',
                price: '$149',
                desc: 'For small firms & single entities',
                features: ['Up to 3 active rules', 'Proportional splitting (%)', 'Real-time QBO Sync', 'Basic Audit Trail', 'Email support'],
                featured: false
              },
              {
                name: 'Professional',
                price: '$349',
                desc: 'For growing multi-location firms',
                features: ['Unlimited split rules', 'Waterfall (Oldest First) logic', 'Full Audit Panels', 'Rollback protection', 'Priority support', 'Dedicated webhook queue'],
                featured: true
              },
              {
                name: 'Practice',
                price: '$799',
                desc: 'For high-volume accounting groups',
                features: ['Multi-client dashboard', 'Priority Split Logic', 'White-label reporting', 'Custom rule consulting', 'Dedicated account manager', 'API & Webhook Access'],
                featured: false
              },
            ].map(plan => (
              <div key={plan.name} className={`bg-surface border border-border rounded-[16px] p-8 relative transition-all duration-200 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:border-border-strong hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] ${plan.featured ? 'border-accent shadow-[0_20px_60px_var(--accent-glow)]' : ''}`}>
                {plan.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-[10px] font-800 uppercase tracking-[0.8px] p-[4px_14px] rounded-[20px] whitespace-nowrap">MOST POPULAR</div>}
                <div className="font-display text-[13px] font-700 uppercase tracking-[1px] text-text-3 mb-3">{plan.name}</div>
                <div className="font-display text-[40px] font-800 text-text tracking-[-2px] leading-none mb-[6px]">{plan.price}<span className="text-[16px] font-500 text-text-3 tracking-normal">/mo</span></div>
                <div className="text-[13px] text-text-3 mb-5">{plan.desc}</div>
                <div className="h-[1px] bg-border mb-5" />
                <ul className="list-none mb-7 flex flex-col gap-[10px]">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-[10px] text-[13.5px] text-text-2">
                      <span className="text-[11px] text-accent font-700 shrink-0">✓</span>{f}
                    </li>
                  ))}
                </ul>
                <button
                  className={plan.featured ? "w-full bg-text text-bg border-none rounded-[10px] p-[13px] font-display text-[13px] font-800 cursor-pointer transition-all hover:opacity-[0.88] hover:-translate-y-px shadow-[0_4px_20px_rgba(0,0,0,0.1)]" : "w-full bg-surface-2 border border-border-strong text-text-2 rounded-[10px] p-3 font-display text-[13px] font-700 cursor-pointer transition-all hover:border-text-3 hover:text-text hover:bg-surface-3"}
                  onClick={() => setShowModal(true)}
                >
                  Start 30-day Free Trial
                </button>
              </div>
            ))}
          </div>
          <p className="text-center text-[13px] text-text-3">All plans include a 30-day free trial · Monthly billing · No credit card required</p>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection />

      {/* Footer */}
      <footer className="border-t border-border p-[32px_40px] relative z-[1] max-[768px]:p-[28px_24px]">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between max-[768px]:flex-col max-[768px]:gap-3 max-[768px]:text-center">
          <div className="flex items-center gap-[9px] font-display text-[13px] font-extrabold text-text tracking-[-0.6px] shrink-0 translate-y-[-0.5px]">
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="9" height="9" rx="3" fill="#2d31fa" />
              <rect x="12" y="1" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".35" />
              <rect x="1" y="12" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".35" />
              <rect x="12" y="12" width="9" height="9" rx="3" fill="#10b981" />
            </svg>
            PaySplit
          </div>
          <div className="flex items-center gap-5 max-[768px]:hidden">
            <Link href="#how" className="text-[12px] text-text-3 no-underline transition-colors hover:text-text-2">How it works</Link>
            <Link href="#pricing" className="text-[12px] text-text-3 no-underline transition-colors hover:text-text-2">Pricing</Link>
            <Link href="#faq" className="text-[12px] text-text-3 no-underline transition-colors hover:text-text-2">FAQ</Link>
            <Link href="/dashboard" className="text-[12px] text-text-3 no-underline transition-colors hover:text-text-2">Sign in</Link>
          </div>
          <div className="text-[12px] text-text-3">
            © {new Date().getFullYear()} PaySplit · Not affiliated with Intuit, Inc.
          </div>
        </div>
      </footer>

      {showModal && <OnboardingModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
