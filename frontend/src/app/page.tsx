'use client'

import { useState } from 'react'
import styles from './landing.module.css'
import { ThemeToggle } from '../components/ThemeToggle'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ── Animated split diagram ────────────────────────────────────────────────────

function SplitDiagram() {
  return (
    <div className={styles.diagram}>
      <div className={styles.diagramLabel}>LIVE PAYMENT SPLIT</div>
      <div className={styles.diagramSource}>
        <div className={styles.diagramSourceAmount}>$50,000.00</div>
        <div className={styles.diagramSourceLabel}>Bulk payment received</div>
      </div>
      <div className={styles.diagramLines}>
        <svg viewBox="0 0 200 100" fill="none" className={styles.diagramSvg}>
          <path d="M100 10 L40 60" stroke="#2d31fa" strokeWidth="1.5" strokeDasharray="4 3" className={styles.svgLine1} />
          <path d="M100 10 L100 60" stroke="#2d31fa" strokeWidth="1.5" strokeDasharray="4 3" className={styles.svgLine2} />
          <path d="M100 10 L160 60" stroke="#2d31fa" strokeWidth="1.5" strokeDasharray="4 3" className={styles.svgLine3} />
          <circle cx="100" cy="10" r="4" fill="#2d31fa" />
          <circle cx="40" cy="60" r="3" fill="#10b981" fillOpacity=".6" />
          <circle cx="100" cy="60" r="3" fill="#10b981" fillOpacity=".6" />
          <circle cx="160" cy="60" r="3" fill="#10b981" fillOpacity=".6" />
        </svg>
      </div>
      <div className={styles.diagramBranches}>
        {[
          { label: 'Branch A', amount: '$20,000', pct: '40%', delay: '0s' },
          { label: 'Branch B', amount: '$18,000', pct: '36%', delay: '0.12s' },
          { label: 'Branch C', amount: '$12,000', pct: '24%', delay: '0.24s' },
        ].map(b => (
          <div key={b.label} className={styles.diagramBranch} style={{ animationDelay: b.delay }}>
            <div className={styles.branchPct}>{b.pct}</div>
            <div className={styles.branchAmount}>{b.amount}</div>
            <div className={styles.branchLabel}>{b.label}</div>
          </div>
        ))}
      </div>
      <div className={styles.diagramStats}>
        <div className={styles.diagramStat}>
          <span className={styles.diagramStatVal}>0.3s</span>
          <span className={styles.diagramStatKey}>processing</span>
        </div>
        <div className={styles.diagramStatDiv} />
        <div className={styles.diagramStat}>
          <span className={styles.diagramStatVal}>$0.00</span>
          <span className={styles.diagramStatKey}>rounding error</span>
        </div>
        <div className={styles.diagramStatDiv} />
        <div className={styles.diagramStat}>
          <span className={styles.diagramStatVal}>3</span>
          <span className={styles.diagramStatKey}>audit entries</span>
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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose} aria-label="Close">✕</button>

        {/* Steps */}
        <div className={styles.modalSteps}>
          <div className={`${styles.modalStep} ${step === 'name' ? styles.modalStepActive : styles.modalStepDone}`}>
            <span className={styles.modalStepNum}>{step === 'connect' ? '✓' : '1'}</span>
            Firm details
          </div>
          <div className={styles.modalStepLine} />
          <div className={`${styles.modalStep} ${step === 'connect' ? styles.modalStepActive : ''}`}>
            <span className={styles.modalStepNum}>2</span>
            Connect QBO
          </div>
        </div>

        {step === 'name' ? (
          <>
            <h2 className={styles.modalTitle}>Start your free trial</h2>
            <p className={styles.modalSub}>30 days free · No credit card required</p>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Firm name</label>
              <input
                className={styles.fieldInput}
                type="text"
                placeholder="e.g. Acme Accounting Partners"
                value={firmName}
                onChange={e => { setFirmName(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && createFirm()}
                autoFocus
              />
            </div>
            {error && <div className={styles.fieldError}>⚠ {error}</div>}
            <button className={styles.modalBtn} onClick={createFirm} disabled={loading}>
              {loading ? 'Creating account…' : 'Continue →'}
            </button>
          </>
        ) : (
          <>
            <h2 className={styles.modalTitle}>Connect QuickBooks</h2>
            <p className={styles.modalSub}>
              Authorize PaySplit to read invoices and post split payments on your behalf.
            </p>
            <div className={styles.qboPerms}>
              {[
                { ok: true, text: 'Read invoices and customer records' },
                { ok: true, text: 'Create split payment entries' },
                { ok: true, text: 'Receive real-time payment webhooks' },
                { ok: false, text: 'Access bank accounts or payroll' },
              ].map(p => (
                <div key={p.text} className={styles.qboPerm}>
                  <span className={p.ok ? styles.permOk : styles.permNo}>{p.ok ? '✓' : '✕'}</span>
                  <span style={{ color: p.ok ? '#c0c0d8' : '#5a5a72' }}>{p.text}</span>
                </div>
              ))}
            </div>
            <button
              className={styles.modalBtnQBO}
              onClick={() => { window.location.href = `${API}/auth/qbo/connect?firmId=${firmId}` }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="8" fill="#2CA01C" />
                <path d="M4.5 8.5l2.2 2.2L11.5 5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Connect with QuickBooks Online →
            </button>
            <p className={styles.modalNote}>
              Redirects to Intuit. Takes 30 seconds. Your data is encrypted at rest.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className={styles.root}>
      <div className={styles.gridBg} />
      <div className={styles.glowTL} />
      <div className={styles.glowBR} />

      {/* Nav */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="9" height="9" rx="3" fill="#2d31fa" />
              <rect x="12" y="1" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".2" />
              <rect x="1" y="12" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".2" />
              <rect x="12" y="12" width="9" height="9" rx="3" fill="#10b981" />
            </svg>
            PaySplit
          </div>
          <div className={styles.navLinks}>
            <a href="#how" className={styles.navLink}>How it works</a>
            <a href="#pricing" className={styles.navLink}>Pricing</a>
            <a href="/dashboard" className={styles.navLink}>Sign in</a>
            <ThemeToggle />
          </div>
          <button className={styles.navCta} onClick={() => setShowModal(true)}>
            Start free trial
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              Built for multi-entity accounting firms
            </div>
            <h1 className={styles.heroTitle}>
              Stop splitting<br />payments<br />
              <em className={styles.heroAccent}>in Excel.</em>
            </h1>
            <p className={styles.heroBody}>
              PaySplit intercepts your QuickBooks payments and automatically routes them
              across branch locations — proportionally, oldest-first, or by priority.
              Full audit trail. Zero manual work.
            </p>
            <div className={styles.heroStats}>
              {[
                { val: '$42K', key: 'avg. annual labor saved' },
                { val: '3–5d', key: 'A/R delay eliminated' },
                { val: '100%', key: 'audit-ready records' },
              ].map((s, i) => (
                <>
                  {i > 0 && <div key={`div-${i}`} className={styles.heroStatDiv} />}
                  <div key={s.val} className={styles.heroStat}>
                    <span className={styles.heroStatVal}>{s.val}</span>
                    <span className={styles.heroStatKey}>{s.key}</span>
                  </div>
                </>
              ))}
            </div>
            <div className={styles.heroCtas}>
              <button className={styles.ctaPrimary} onClick={() => setShowModal(true)}>
                Start 30-day free trial →
              </button>
              <a href="#how" className={styles.ctaSecondary}>See how it works ↓</a>
            </div>
            <p className={styles.heroNote}>No credit card · Works with existing QBO · Setup in 2 min</p>
          </div>
          <div className={styles.heroRight}>
            <SplitDiagram />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.section} id="how">
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>HOW IT WORKS</div>
          <h2 className={styles.sectionTitle}>Connected in 2 minutes.<br />Runs forever after.</h2>
          <div className={styles.howSteps}>
            {[
              { num: '01', title: 'Connect QBO', body: 'Authorize PaySplit with one click. We connect to your existing QuickBooks Online company — no migration, no data export.' },
              { num: '02', title: 'Configure split rules', body: 'Set proportional weights, oldest-first waterfall, or location priority rules per client. Change anytime without touching QBO.' },
              { num: '03', title: 'Payments split automatically', body: 'When a bulk payment hits QBO, PaySplit intercepts it via webhook, calculates the split, posts allocations, and logs the audit trail — in under a second.' },
            ].map((s, i) => (
              <div key={s.num} className={styles.howStep} style={{ animationDelay: `${i * 0.1}s` }}>
                <div className={styles.howNum}>{s.num}</div>
                <h3 className={styles.howTitle}>{s.title}</h3>
                <p className={styles.howBody}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className={styles.section} id="pricing">
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>PRICING</div>
          <h2 className={styles.sectionTitle}>Built to scale with your practice.<br />Start free.</h2>
          <div className={styles.plans}>
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
              <div key={plan.name} className={`${styles.plan} ${plan.featured ? styles.planFeatured : ''}`}>
                {plan.featured && <div className={styles.planBadge}>RECOMMENDED</div>}
                <div className={styles.planName}>{plan.name}</div>
                <div className={styles.planPrice}>{plan.price}<span className={styles.planPer}>/mo</span></div>
                <div className={styles.planDesc}>{plan.desc}</div>
                <div className={styles.planDivider} />
                <ul className={styles.planFeatures}>
                  {plan.features.map(f => (
                    <li key={f} className={styles.planFeature}>
                      <span className={styles.planCheck}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <button
                  className={plan.featured ? styles.planCtaFeatured : styles.planCta}
                  onClick={() => setShowModal(true)}
                >
                  Start 30-day Free Trial
                </button>
              </div>
            ))}
          </div>
          <p className={styles.pricingNote}>All plans includes a 30-day free trial · Monthly billing · No credit card required</p>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.logo} style={{ fontSize: 13 }}>
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="9" height="9" rx="3" fill="#00e5a0" />
              <rect x="12" y="1" width="9" height="9" rx="3" fill="#00e5a0" fillOpacity=".35" />
              <rect x="1" y="12" width="9" height="9" rx="3" fill="#00e5a0" fillOpacity=".35" />
              <rect x="12" y="12" width="9" height="9" rx="3" fill="#e8ff5a" />
            </svg>
            PaySplit
          </div>
          <div className={styles.footerNote}>
            © {new Date().getFullYear()} PaySplit · Not affiliated with Intuit, Inc.
          </div>
        </div>
      </footer>

      {showModal && <OnboardingModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
