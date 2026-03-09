'use client'

import { useState, useEffect } from 'react'
import styles from './landing.module.css'
import { ThemeToggle } from '../components/ThemeToggle'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ── Animated split diagram ────────────────────────────────────────────────────

function SplitDiagram() {
  return (
    <div className={styles.diagram}>
      <div className={styles.diagramLabel}>LIVE PAYMENT SPLIT</div>
      <div className={styles.diagramSource}>
        <div className={styles.diagramSourceAmount}>$50,000.00</div>
        <div className={styles.diagramSourceLabel}>Bulk payment received · 0.3s ago</div>
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
            <div className="font-mono text-[11px] text-accent font-bold mb-[5px]">{b.pct}</div>
            <div className="font-display text-[14px] font-bold text-text tracking-[-0.3px] mb-[4px]">{b.amount}</div>
            <div className="text-[10px] text-text-3 uppercase tracking-[0.5px]">{b.label}</div>
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
      <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className={styles.modalClose} onClick={onClose} aria-label="Close modal">✕</button>

        {/* Brand mark */}
        <div className={styles.modalBrand}>
          <svg width="32" height="32" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="1" width="9" height="9" rx="3" fill="#2d31fa" />
            <rect x="12" y="1" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".25" />
            <rect x="1" y="12" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".25" />
            <rect x="12" y="12" width="9" height="9" rx="3" fill="#10b981" />
          </svg>
          <span>PaySplit</span>
        </div>

        {/* Progress bar */}
        <div className={styles.modalProgressBar}>
          <div className="h-full bg-accent transition-all duration-300 rounded-full" style={{ width: step === 'name' ? '50%' : '100%' }} />
        </div>

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
            <h2 className={styles.modalTitle} id="modal-title">Start your free trial</h2>
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
            <h2 className={styles.modalTitle} id="modal-title">Connect QuickBooks</h2>
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
                  <span className={p.ok ? 'text-text-2' : 'text-text-3'}>{p.text}</span>
                </div>
              ))}
            </div>
            <button
              className={styles.modalBtnQBO}
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
            <p className={styles.modalNote}>
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
    <section className={styles.section} id="faq">
      <div className={styles.sectionInner}>
        <div className={styles.sectionLabel}>FAQ</div>
        <h2 className={styles.sectionTitle}>Everything you need to know.</h2>
        <div className={styles.faqList}>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className={`${styles.faqItem} ${open === i ? styles.faqItemOpen : ''}`}>
              <button
                className={styles.faqQuestion}
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                aria-controls={`faq-answer-${i}`}
              >
                <span>{item.q}</span>
                <span className={styles.faqChevron}>{open === i ? '−' : '+'}</span>
              </button>
              {open === i && (
                <div id={`faq-answer-${i}`} className={styles.faqAnswer}>{item.a}</div>
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
    <div className={`${styles.root} ${showMobileMenu ? styles.menuOpen : ''}`}>
      <div className={styles.gridBg} />
      <div className={styles.glowTL} />
      <div className={styles.glowBR} />

      {/* Nav */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo} aria-label="PaySplit logo">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" rx="3" fill="#2d31fa" />
              <rect x="12" y="1" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".2" />
              <rect x="1" y="12" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".2" />
              <rect x="12" y="12" width="9" height="9" rx="3" fill="#10b981" />
            </svg>
            PaySplit
          </div>
          <nav id="mobile-menu-links" className={`${styles.navLinks} ${showMobileMenu ? styles.navLinksMobile : ''}`} aria-label="Main navigation">
            <Link href="#how" className={styles.navLink} onClick={() => setShowMobileMenu(false)}>How it works</Link>
            <Link href="#pricing" className={styles.navLink} onClick={() => setShowMobileMenu(false)}>Pricing</Link>
            <Link href="#faq" className={styles.navLink} onClick={() => setShowMobileMenu(false)}>FAQ</Link>
            <Link href="/dashboard" className={styles.navLink} onClick={() => setShowMobileMenu(false)}>Sign in</Link>
            <div className={styles.navMobileFooter}>
              <ThemeToggle />
            </div>
          </nav>

          <div className={styles.navActions}>
            <div className={styles.hideMobile}>
              <ThemeToggle />
            </div>
            <button className={styles.navCta} onClick={() => setShowModal(true)}>
              Start free trial
            </button>
            <button
              className={styles.menuToggle}
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
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              Built for multi-entity accounting firms
            </div>
            <h1 className={styles.heroTitle}>
              Your $50K payment,<br />split in{' '}
              <em className={styles.heroAccent}>300ms.</em>
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
              <Link href="#how" className={styles.ctaSecondary}>See how it works ↓</Link>
            </div>
            <p className={styles.heroNote}>No credit card · Works with existing QBO · Setup in 2 min</p>
          </div>
          <div className={styles.heroRight}>
            <SplitDiagram />
          </div>
        </div>
      </section>

      {/* Trusted By */}
      <div className={styles.trustedBy}>
        <div className={styles.trustedByInner}>
          <span className={styles.trustedByLabel}>Used by accounting firms across North America</span>
          <div className={styles.trustedByLogos}>
            {['Firm A', 'Firm B', 'Firm C', 'Firm D', 'Firm E'].map((name) => (
              <div key={name} className={styles.trustedByLogo}>
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
                <div className="font-mono text-[11px] tracking-[1px] text-accent mb-[16px] opacity-70">{s.num}</div>
                <h3 className="font-display text-[17px] font-bold text-text mb-[12px] tracking-[-0.3px]">{s.title}</h3>
                <p className="text-[14px] leading-[1.7] text-text-2">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className={styles.section} id="testimonials">
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>TESTIMONIALS</div>
          <h2 className={styles.sectionTitle}>Trusted by firms who can&apos;t afford<br />to get payments wrong.</h2>
          <div className={styles.testimonials}>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className={styles.testimonialCard}>
                <div className={styles.testimonialStat}>{t.stat}</div>
                <p className={styles.testimonialQuote}>&ldquo;{t.quote}&rdquo;</p>
                <div className={styles.testimonialAuthor}>
                  <div className={styles.testimonialAvatar}>
                    {t.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className={styles.testimonialName}>{t.name}</div>
                    <div className={styles.testimonialMeta}>{t.title} · {t.firm}</div>
                    <div className={styles.testimonialLocation}>{t.location}</div>
                  </div>
                </div>
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
                {plan.featured && <div className={styles.planBadge}>MOST POPULAR</div>}
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
          <p className={styles.pricingNote}>All plans include a 30-day free trial · Monthly billing · No credit card required</p>
        </div>
      </section>

      {/* FAQ */}
      <FAQSection />

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className="flex items-center gap-[9px] font-display text-[13px] font-extrabold text-text tracking-[-0.6px] shrink-0 translate-y-[-0.5px]">
            <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="9" height="9" rx="3" fill="#2d31fa" />
              <rect x="12" y="1" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".35" />
              <rect x="1" y="12" width="9" height="9" rx="3" fill="#2d31fa" fillOpacity=".35" />
              <rect x="12" y="12" width="9" height="9" rx="3" fill="#10b981" />
            </svg>
            PaySplit
          </div>
          <div className={styles.footerLinks}>
            <Link href="#how" className={styles.footerLink}>How it works</Link>
            <Link href="#pricing" className={styles.footerLink}>Pricing</Link>
            <Link href="#faq" className={styles.footerLink}>FAQ</Link>
            <Link href="/dashboard" className={styles.footerLink}>Sign in</Link>
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
