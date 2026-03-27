import { describe, it, expect } from 'vitest'
import { calculateSplit, assertSplitInvariant } from './splitCalculator'
import type { QBOInvoice } from '../qbo/qboClient'

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeInvoice(id: string, customerId: string, balance: number, date: string): QBOInvoice {
  return {
    Id: id,
    DocNumber: `INV-${id}`,
    TxnDate: date,
    DueDate: date,
    Balance: balance,
    TotalAmt: balance,
    CustomerRef: { value: customerId, name: `Customer ${customerId}` },
  }
}

const LOC_A = 'cust-loc-a'
const LOC_B = 'cust-loc-b'
const LOC_C = 'cust-loc-c'

const invoices = [
  makeInvoice('inv-1', LOC_A, 20000, '2024-01-01'),
  makeInvoice('inv-2', LOC_A, 5000,  '2024-02-01'),
  makeInvoice('inv-3', LOC_B, 18000, '2024-01-15'),
  makeInvoice('inv-4', LOC_B, 3000,  '2024-03-01'),
  makeInvoice('inv-5', LOC_C, 12000, '2024-01-10'),
]

// ── Proportional split tests ──────────────────────────────────────────────────

describe('proportional split', () => {
  const rule = { type: 'proportional' as const, weights: { [LOC_A]: 40, [LOC_B]: 36, [LOC_C]: 24 } }

  it('splits a $50,000 payment exactly at 40/36/24', () => {
    const result = calculateSplit(50000, invoices, rule)
    expect(result.totalAllocated).toBe(50000)
    expect(result.remainingUnapplied).toBe(0)
    assertSplitInvariant(result, 50000)
  })

  it('allocations sum to payment amount', () => {
    const result = calculateSplit(50000, invoices, rule)
    const sum = result.allocations.reduce((acc, a) => acc + a.amountApplied, 0)
    expect(Math.abs(sum - 50000)).toBeLessThanOrEqual(0.01)
  })

  it('handles payment less than total outstanding (partial payment)', () => {
    const result = calculateSplit(10000, invoices, rule)
    const sum = result.allocations.reduce((acc, a) => acc + a.amountApplied, 0)
    expect(Math.abs(sum - 10000)).toBeLessThanOrEqual(0.01)
    assertSplitInvariant(result, 10000)
  })

  it('handles odd amount with rounding ($33,333.33)', () => {
    const result = calculateSplit(33333.33, invoices, rule)
    const sum = result.allocations.reduce((acc, a) => acc + a.amountApplied, 0)
    expect(Math.abs(sum - 33333.33)).toBeLessThanOrEqual(0.01)
    assertSplitInvariant(result, 33333.33)
  })

  it('throws if weights do not sum to 100', () => {
    const badRule = { type: 'proportional' as const, weights: { [LOC_A]: 50, [LOC_B]: 30 } }
    expect(() => calculateSplit(50000, invoices, badRule)).toThrow(/sum to 100/)
  })

  it('handles $0.01 payment without crashing', () => {
    const result = calculateSplit(0.01, invoices, rule)
    assertSplitInvariant(result, 0.01)
  })
})

// ── Oldest-first split tests ──────────────────────────────────────────────────

describe('oldest_first split', () => {
  const rule = { type: 'oldest_first' as const, locationIds: [LOC_A, LOC_B, LOC_C] }

  it('drains oldest invoices first across all locations', () => {
    const result = calculateSplit(38000, invoices, rule)
    // inv-1 ($20k, Jan 1), inv-5 ($12k, Jan 10), inv-3 ($18k, Jan 15) oldest first
    // 38000 → inv-1 gets $20k, inv-5 gets $12k, inv-3 gets $6k = $38k total
    expect(result.allocations[0].invoiceId).toBe('inv-1')
    expect(result.allocations[0].amountApplied).toBe(20000)
    assertSplitInvariant(result, 38000)
  })

  it('handles exact payment — zero remaining', () => {
    const total = invoices.reduce((sum, inv) => sum + inv.Balance, 0)
    const result = calculateSplit(total, invoices, rule)
    expect(result.remainingUnapplied).toBe(0)
    assertSplitInvariant(result, total)
  })

  it('handles overpayment — unapplied remainder > 0', () => {
    const total = invoices.reduce((sum, inv) => sum + inv.Balance, 0)
    const result = calculateSplit(total + 500, invoices, rule)
    expect(result.remainingUnapplied).toBe(500)
  })

  it('handles single invoice scenario', () => {
    const single = [makeInvoice('only', LOC_A, 1000, '2024-01-01')]
    const result = calculateSplit(750, single, rule)
    expect(result.allocations).toHaveLength(1)
    expect(result.allocations[0].amountApplied).toBe(750)
    assertSplitInvariant(result, 750)
  })

  it('returns empty allocations when no invoices match', () => {
    const result = calculateSplit(1000, [], rule)
    expect(result.allocations).toHaveLength(0)
    expect(result.remainingUnapplied).toBe(1000)
  })

  it('handles payment of exactly one invoice balance', () => {
    const result = calculateSplit(20000, invoices, rule)
    expect(result.allocations).toHaveLength(1)
    expect(result.allocations[0].invoiceId).toBe('inv-1')
    expect(result.allocations[0].amountApplied).toBe(20000)
    assertSplitInvariant(result, 20000)
  })
})

// ── Location-priority split tests ─────────────────────────────────────────────

describe('location_priority split', () => {
  const rule = { type: 'location_priority' as const, order: [LOC_A, LOC_B, LOC_C] }

  it('fully clears LOC_A before touching LOC_B', () => {
    const result = calculateSplit(30000, invoices, rule)
    // LOC_A total: $25k, so first $25k goes to LOC_A, then $5k to LOC_B
    const locATotal = result.allocations
      .filter((a) => a.locationCustomerId === LOC_A)
      .reduce((sum, a) => sum + a.amountApplied, 0)
    expect(locATotal).toBe(25000)
    assertSplitInvariant(result, 30000)
  })

  it('does not touch LOC_C if LOC_A + LOC_B absorbs full payment', () => {
    const result = calculateSplit(40000, invoices, rule)
    const locCAllocations = result.allocations.filter((a) => a.locationCustomerId === LOC_C)
    // LOC_A ($25k) + LOC_B ($21k) = $46k available, so $40k is absorbed in A+B
    expect(locCAllocations).toHaveLength(0)
    assertSplitInvariant(result, 40000)
  })
})

// ── assertSplitInvariant tests ────────────────────────────────────────────────

describe('assertSplitInvariant', () => {
  it('passes when sum matches payment amount exactly', () => {
    const result = {
      allocations: [{ invoiceId: 'x', locationCustomerId: LOC_A, amountApplied: 100 }],
      totalAllocated: 100,
      remainingUnapplied: 0,
    }
    expect(() => assertSplitInvariant(result, 100)).not.toThrow()
  })

  it('passes with $0.005 rounding difference', () => {
    const result = {
      allocations: [{ invoiceId: 'x', locationCustomerId: LOC_A, amountApplied: 99.995 }],
      totalAllocated: 99.995,
      remainingUnapplied: 0.005,
    }
    expect(() => assertSplitInvariant(result, 100)).not.toThrow()
  })

  it('throws when sum is off by more than $0.01', () => {
    const result = {
      allocations: [{ invoiceId: 'x', locationCustomerId: LOC_A, amountApplied: 99.98 }],
      totalAllocated: 99.98,
      remainingUnapplied: 0.02,
    }
    expect(() => assertSplitInvariant(result, 100)).toThrow(/invariant violated/)
  })
})
