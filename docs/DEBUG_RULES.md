You are debugging a production-level fintech system called PaySplit.

⚠️ CRITICAL RULE:
Do NOT suggest random fixes or rewrite large parts of the code.
We are diagnosing the issue step-by-step before making changes.

---

🧱 SYSTEM CONTEXT

PaySplit pipeline:
Payment → Job Queue → Worker → Split Calculator → Ledger → QBO Sync

Tech:

* Backend: Fastify (Node.js)
* Queue: BullMQ (Redis)
* DB: PostgreSQL (Prisma)
* Integration: QuickBooks Online (QBO)

---

🚨 ISSUE DESCRIPTION

[Describe the exact issue clearly]

Example:
"Jobs are stuck in STALLED and FAILED. Payments are not splitting even after rules are created."

---

📊 OBSERVED BEHAVIOR

[List what you are seeing]

Example:

* Jobs move to QUEUED
* Some go to STALLED
* Some FAIL with 'No sub-locations found'
* Ledger entries are not created

---

✅ EXPECTED BEHAVIOR

[What should happen]

Example:
Payment → Split → Ledger entries → Job marked COMPLETED

---

🔍 DEBUGGING INSTRUCTIONS

You MUST:

1. Break down the system into stages:

   * Payment ingestion
   * Job creation
   * Worker execution
   * Rule fetching
   * Sub-customer fetching
   * Split calculation
   * Ledger write
   * QBO sync

2. For EACH stage:

   * Explain what could go wrong
   * Suggest EXACT logs or checks to verify it

3. DO NOT write code yet

4. Identify the MOST likely root cause based on symptoms

---

📍 LOGGING PLAN

Provide specific logs to add like:

Example:
console.log({
jobId,
customerId,
subCustomersFound,
ruleFound
});

---

🚫 DO NOT:

* Rewrite full files
* Suggest broad refactors
* Assume missing context
* Jump to conclusions

---

🧠 OUTPUT FORMAT

1. Step-by-step breakdown of where the issue could be
2. Most likely root cause (ranked)
3. Exact logs to add
4. What result each log should show
5. Next action after logs

---

🎯 GOAL

Identify the exact failure point in the pipeline before making ANY code changes.
