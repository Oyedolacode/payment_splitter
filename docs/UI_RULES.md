# PaySplit UI Consistency System

## Core Principle

Every dollar must be:
Visible → Traceable → Explained → Verified

---

## Currency Rules

* Always format as: $1,000.00
* Always 2 decimal places
* Always right-aligned
* Use shared formatter (fmt)

---

## Status System (STRICT)

Allowed statuses only:

* Allocating → remaining > 0
* Completed → remaining === 0
* Failed
* Queued
* Processing

Do NOT use:

* Held
* Split
* Any custom labels

---

## Status Logic

Status must be derived from data:

if (remaining > 0) → Allocating
if (remaining === 0) → Completed

Never hardcode status labels.

---

## Data Fallback Rules

Never show undefined or empty values.

* Customer → "Customer not synced"
* Rule → "Rule: Not set"
* Location → "Unknown location"

---

## Ledger Rules

* Always show double-entry validation:
  D $X = C $X ✓

* Debits and Credits must always be positive values

* Direction is defined by column, not sign

---

## Transaction Structure

Payment $1,000.00 — Customer Name
Rule: Proportional
Txn: abc123

✔ D $1,000.00 = C $1,000.00

INCOMING_PAYMENT_POOL   $1,000.00
↳ Location A          $300.00
↳ Location B          $200.00
↳ Location C          $500.00

---

## Visual Hierarchy

* Parent rows must be bold
* Child rows must be indented (↳)
* Numbers must be right-aligned
* Important info must appear first

---

## UI Behavior Rules

* Never hide system state
* Always explain failures clearly
* Never silently succeed — show validation

---

## Consistency Enforcement

Any UI change must follow these rules.

If a change introduces:

* inconsistent formatting
* new status labels
* missing fallbacks

→ STOP and fix before proceeding.
