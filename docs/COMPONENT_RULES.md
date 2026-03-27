# PaySplit Component Rules

## Purpose

Ensure all UI components are consistent, reusable, and aligned with financial clarity.

---

## 1. Core Principle

Components must prioritize:
Clarity → Consistency → Reusability → Safety

---

## 2. Naming Convention

* Use clear, descriptive names:

  * LedgerTable
  * TransactionCard
  * StatusBadge
  * AmountCell

Avoid vague names like:

* Box
* Item
* Thing

---

## 3. Component Structure

Each component must:

1. Be small and focused
2. Accept props (no hardcoded data)
3. Avoid embedding business logic
4. Be reusable across screens

---

## 4. Financial Display Components

### AmountCell

* Always format currency using shared formatter
* Always right-align values
* Never show negative signs for debit/credit
* Accept:

  * value
  * type (debit | credit)

---

### StatusBadge

Allowed values only:

* Allocating
* Completed
* Failed
* Queued
* Processing

Rules:

* Color-coded consistently
* No custom or dynamic labels

---

### TransactionCard

Must display:

* Payment amount
* Customer name (with fallback)
* Rule
* Transaction ID
* Double-entry validation

---

### LedgerTable

Rules:

* Parent row (INCOMING_PAYMENT_POOL) must be bold
* Child rows must be indented (↳)
* Numbers right-aligned
* Always include:

  * Debit
  * Credit
  * Remaining Allocation

---

## 5. Props Rules

* All components must validate props
* No undefined values allowed
* Use fallback values from UI_RULES.md

---

## 6. State Management

Components must:

* Be stateless where possible
* Receive data via props
* Avoid direct API calls

---

## 7. Styling Rules

* Use Tailwind only (no inline styles unless necessary)
* Keep spacing consistent (padding, margins)
* Use shared design tokens (colors, font sizes)

---

## 8. Reusability Rule

Before creating a new component:

Ask:
"Can this be reused elsewhere?"

If YES → make it generic
If NO → keep it scoped but clean

---

## 9. Do NOT

* Mix UI + business logic
* Duplicate components
* Hardcode financial values
* Introduce inconsistent formatting

---

## 10. Enforcement

If a component violates:

* formatting rules
* status rules
* fallback rules

→ STOP and fix before merging
