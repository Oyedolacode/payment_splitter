import { QBOInvoice } from '../qbo/qboClient'

// ── Rule config types ─────────────────────────────────────────────────────────

export interface ProportionalConfig {
  type: 'proportional'
  // key = QBO Customer.Id (sub-location), value = percentage (must sum to 100)
  weights: Record<string, number>
}

export interface OldestFirstConfig {
  type: 'oldest_first'
  // Ordered list of sub-location customer IDs to drain in sequence
  locationIds: string[]
}

export interface LocationPriorityConfig {
  type: 'location_priority'
  // Fully clear each location before moving to the next
  order: string[]
}

export type RuleConfig = ProportionalConfig | OldestFirstConfig | LocationPriorityConfig

// ── Allocation result ─────────────────────────────────────────────────────────

export interface Allocation {
  invoiceId: string
  locationCustomerId: string
  amountApplied: number
}

export interface SplitResult {
  allocations: Allocation[]
  totalAllocated: number
  remainingUnapplied: number
}

// ── Main split calculator ─────────────────────────────────────────────────────

/**
 * Calculate how a payment should be split across open invoices.
 *
 * INVARIANT: sum(allocations.amountApplied) === paymentAmount (within $0.01 rounding)
 * This is asserted before any batch API call is made. If it fails, the job halts.
 */
export function calculateSplit(
  paymentAmount: number,
  openInvoices: QBOInvoice[],
  rule: RuleConfig
): SplitResult {
  switch (rule.type) {
    case 'proportional':
      return proportionalSplit(paymentAmount, openInvoices, rule)
    case 'oldest_first':
      return oldestFirstSplit(paymentAmount, openInvoices, rule)
    case 'location_priority':
      return locationPrioritySplit(paymentAmount, openInvoices, rule)
  }
}

// ── Proportional split ────────────────────────────────────────────────────────

function proportionalSplit(
  paymentAmount: number,
  openInvoices: QBOInvoice[],
  rule: ProportionalConfig
): SplitResult {
  const totalWeight = Object.values(rule.weights).reduce((sum, w) => sum + w, 0)
  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new Error(`Proportional weights must sum to 100. Got ${totalWeight}`)
  }

  const allocations: Allocation[] = []
  let totalAllocated = 0

  // For each location, apply its percentage slice to oldest invoices
  const locationEntries = Object.entries(rule.weights)
  for (let i = 0; i < locationEntries.length; i++) {
    const [locationId, weight] = locationEntries[i]
    const locationInvoices = openInvoices
      .filter((inv) => inv.CustomerRef.value === locationId)
      .sort((a, b) => new Date(a.TxnDate).getTime() - new Date(b.TxnDate).getTime())

    // Last location absorbs any rounding remainder
    const isLast = i === locationEntries.length - 1
    let locationBudget = isLast
      ? round2(paymentAmount - totalAllocated)
      : round2((paymentAmount * weight) / 100)

    for (const invoice of locationInvoices) {
      if (locationBudget <= 0) break
      const apply = round2(Math.min(invoice.Balance, locationBudget))
      if (apply <= 0) continue

      allocations.push({ invoiceId: invoice.Id, locationCustomerId: locationId, amountApplied: apply })
      locationBudget = round2(locationBudget - apply)
      totalAllocated = round2(totalAllocated + apply)
    }
  }

  return buildResult(allocations, paymentAmount, totalAllocated)
}

// ── Oldest-first (waterfall) split ────────────────────────────────────────────

function oldestFirstSplit(
  paymentAmount: number,
  openInvoices: QBOInvoice[],
  rule: OldestFirstConfig
): SplitResult {
  // Filter to only the configured locations, then sort all by date (oldest first)
  const relevant = openInvoices
    .filter((inv) => rule.locationIds.includes(inv.CustomerRef.value))
    .sort((a, b) => new Date(a.TxnDate).getTime() - new Date(b.TxnDate).getTime())

  return applyWaterfall(paymentAmount, relevant)
}

// ── Location-priority split ───────────────────────────────────────────────────

function locationPrioritySplit(
  paymentAmount: number,
  openInvoices: QBOInvoice[],
  rule: LocationPriorityConfig
): SplitResult {
  // Drain each location completely before moving to the next
  const sorted = rule.order.flatMap((locationId) =>
    openInvoices
      .filter((inv) => inv.CustomerRef.value === locationId)
      .sort((a, b) => new Date(a.TxnDate).getTime() - new Date(b.TxnDate).getTime())
  )

  return applyWaterfall(paymentAmount, sorted)
}

// ── Shared waterfall algorithm ────────────────────────────────────────────────

function applyWaterfall(paymentAmount: number, sortedInvoices: QBOInvoice[]): SplitResult {
  const allocations: Allocation[] = []
  let remaining = paymentAmount

  for (const invoice of sortedInvoices) {
    if (remaining <= 0) break
    const apply = round2(Math.min(invoice.Balance, remaining))
    if (apply <= 0) continue

    allocations.push({
      invoiceId: invoice.Id,
      locationCustomerId: invoice.CustomerRef.value,
      amountApplied: apply,
    })
    remaining = round2(remaining - apply)
  }

  const totalAllocated = round2(paymentAmount - remaining)
  return buildResult(allocations, paymentAmount, totalAllocated)
}

// ── Invariant assertion ───────────────────────────────────────────────────────

/**
 * Assert that the split result is mathematically valid before writing to QBO.
 * Throws if the invariant is violated — never writes a partial split to the ledger.
 */
export function assertSplitInvariant(result: SplitResult, paymentAmount: number): void {
  const sum = result.allocations.reduce((acc, a) => round2(acc + a.amountApplied), 0)
  const diff = Math.abs(sum - paymentAmount)

  // Allow up to $0.01 tolerance for floating point rounding
  if (diff > 0.01) {
    throw new Error(
      `Split invariant violated: allocations sum to $${sum} but payment is $${paymentAmount} (diff: $${diff})`
    )
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildResult(
  allocations: Allocation[],
  paymentAmount: number,
  totalAllocated: number
): SplitResult {
  return {
    allocations,
    totalAllocated,
    remainingUnapplied: round2(paymentAmount - totalAllocated),
  }
}
