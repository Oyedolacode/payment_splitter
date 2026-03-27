# PaySplit Frontend Architecture

## Purpose

Define a scalable, maintainable structure for the PaySplit frontend.

---

## 1. Core Principle

Separate:
UI → State → Logic → Data

Never mix these layers.

---

## 2. Folder Structure

/app
/dashboard
/components
/hooks
/utils
page.tsx

/components
/common
/ledger
/reconciliation
/audit

/lib
/api
/formatters

---

## 3. Layer Responsibilities

### UI Layer (Components)

* Responsible for rendering only
* No business logic
* Receives props

---

### Hooks Layer

* Handles state and data transformation
* Example:

  * useLedgerData
  * useReconciliationJobs

---

### Utils Layer

* Pure functions only
* Example:

  * formatCurrency
  * deriveStatus

---

### API Layer

* Handles all backend communication
* No UI logic

---

## 4. Data Flow

Backend → API → Hooks → Components

Example:

fetchPayments() → useLedgerData() → LedgerTable

---

## 5. State Rules

* Use React hooks (useState, useMemo, useEffect)
* Avoid global state unless necessary
* Derived values must use useMemo

---

## 6. Derived Logic Rules

Never compute inside JSX.

Bad:
{remaining > 0 ? "Allocating" : "Completed"}

Good:
const status = deriveStatus(remaining)

---

## 7. Formatting Rules

All formatting must use shared utilities:

* formatCurrency()
* formatDate()

Never inline formatting.

---

## 8. API Rules

* All API calls go through /lib/api
* No direct fetch inside components
* Handle errors centrally

---

## 9. Error Handling

* Always show user-friendly messages
* Never expose raw errors
* Log errors for debugging

---

## 10. Performance Rules

* Use useMemo for derived data
* Avoid unnecessary re-renders
* Keep components lightweight

---

## 11. UI Consistency

All UI must follow:
UI_RULES.md

---

## 12. AI Enforcement

Any AI-generated code must:

* Follow this architecture
* Respect component boundaries
* Avoid mixing layers

If violated:
→ STOP and refactor before proceeding
