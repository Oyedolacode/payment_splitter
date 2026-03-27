You are working on a production-level fintech system called PaySplit.

⚠️ CRITICAL RULE:
Do NOT break any existing working functionality.
This system handles financial data, so correctness and stability are more important than speed.

---

🧱 SYSTEM CONTEXT

PaySplit is a B2B SaaS that:

* Fetches payments from QuickBooks Online (QBO)
* Splits payments across sub-customers (locations)
* Uses rule-based allocation (proportional, fixed, etc.)
* Processes jobs asynchronously using BullMQ workers
* Stores results in a double-entry financial ledger
* Syncs results back to QBO

Core pipeline:
Payment → Job Queue → Worker → Split Calculator → Ledger → QBO Sync

---

🔒 PROTECTED COMPONENTS (DO NOT MODIFY)

You MUST NOT change or refactor these unless explicitly instructed:

1. splitCalculator.ts
2. Ledger logic (debit/credit calculations, balance logic)
3. paymentWorker core flow
4. Database schema (Prisma models)
5. Job lifecycle states (Queued, Processing, Completed, Failed, Stalled)

If your solution requires modifying any of these, STOP and ask first.

---

🎯 TASK

[Clearly describe ONE specific task here]

Example:
"Fix sub-customer fetch logic in qboClient.ts to correctly retrieve child customers using ParentRef from QBO."

---

📍 SCOPE LIMITATION

You are ONLY allowed to modify:

[List specific files or functions]

Example:

* src/services/qboClient.ts
* fetchSubCustomers()

Do NOT modify anything outside this scope.

---

🧠 BEFORE WRITING CODE

You MUST:

1. Explain the root cause of the issue
2. List exactly which files/functions you will modify
3. Explain why this will NOT break other parts of the system

Wait for approval before proceeding.

---

✂️ IMPLEMENTATION RULES

* Make MINIMAL, surgical changes only
* Do NOT rewrite entire files
* Do NOT refactor unrelated code
* Preserve all existing interfaces and data contracts
* Do NOT rename variables unless necessary

---

🧾 OUTPUT FORMAT

Return ONLY:

1. Code changes (diff format preferred)
2. Short explanation of what changed
3. Any risks or edge cases

---

🧪 SAFETY CHECKS

Ensure the following still work after your change:

* Payment → Split → Ledger → Completed flow
* Ledger remains balanced (debits = credits)
* Existing successful jobs are unaffected
* Retry logic still works

If any of these might break, explain BEFORE coding.

---

🚨 FAILURE HANDLING

If you are unsure about ANY part of the system:

* Do NOT guess
* Ask for clarification

---

Goal:
Make the smallest possible safe change without breaking the financial processing pipeline.
