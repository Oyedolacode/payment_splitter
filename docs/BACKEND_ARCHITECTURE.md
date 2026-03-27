# PaySplit Backend Architecture

## Purpose

Provide a scalable backend structure WITHOUT breaking existing working logic.

---

## Core Principle

DO NOT change behavior.
ONLY improve structure.

---

## 1. System Flow (Do NOT Modify)

Payment → Webhook → Job Queue → Worker → Split → Ledger → QBO Sync

This flow must remain EXACTLY the same.

---

## 2. Current Safe State

The system is currently working.

This means:

* Workers process jobs correctly
* Split logic is correct
* Ledger balances correctly

⚠️ These must NOT be modified.

---

## 3. Safe Refactoring Strategy

We use **Move-Only Refactoring**:

Allowed:

* Moving files into folders
* Renaming folders (not functions)
* Updating import paths

NOT Allowed:

* Changing function logic
* Rewriting services
* Modifying database schema
* Changing API contracts

---

## 4. Service Separation (Gradual)

Current:
services/

Target:
services/
├── qbo/
├── ledger/
├── split/
└── jobs/

---

### Step-by-step migration

Step 1:
Create folders without moving files

Step 2:
Move ONE file at a time

Step 3:
Fix imports

Step 4:
Run system

Step 5:
Verify jobs still process

---

## 5. Worker Safety Rules

Workers are CRITICAL.

Do NOT:

* Change job processing logic
* Change queue names
* Change job payload structure

Only update imports if files move.

---

## 6. Logging Requirement (MANDATORY)

Before migration:

Add logs to confirm system works:

console.log("Worker running")
console.log("Job completed", jobId)

After EACH move:
Verify logs still appear.

---

## 7. Verification Checklist (After EACH Change)

* Can server start? ✅
* Can webhook be received? ✅
* Can job be queued? ✅
* Does worker process job? ✅
* Does split complete? ✅
* Does ledger update? ✅

If ANY fails:
→ revert immediately

---

## 8. Rollback Plan

If something breaks:

git reset --hard HEAD

OR

git checkout main

---

## 9. AI Enforcement

AI must NOT:

* Refactor logic
* Optimize code
* Rename functions
* “Improve” algorithms

AI is ONLY allowed to:

* Move files
* Fix imports

---

## 10. Goal

End result:

Cleaner structure
Same behavior
Zero regression
