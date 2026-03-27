/**
 * Shared formatting utilities for PaySplit Frontend.
 * Rules: UI_RULES.md, FRONTEND_ARCHITECTURE.md
 */

/**
 * Formats a number as currency.
 * Always 2 decimal places, with shared comma/period grouping.
 * Consistent with UI_RULES.md: $1,000.00
 */
export const fmt = (amt: string | number) => 
  Number(amt).toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })

/**
 * Derive status label from remaining balance.
 * Strict compliance with UI_RULES.md: Allocating vs Completed
 */
export const deriveStatus = (remaining: number) => {
  if (remaining > 0.01) return 'Allocating'
  return 'Completed'
}
