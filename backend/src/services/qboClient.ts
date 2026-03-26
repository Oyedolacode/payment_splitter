import { getValidAccessToken } from './qboAuth'
import { config } from '../lib/config'

const QBO_BASE =
  config.QBO_ENVIRONMENT === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QBOPayment {
  Id: string
  TotalAmt: number
  CustomerRef: { value: string; name: string }
  TxnDate: string
  SyncToken: string
  MetaData?: { CreateTime: string; LastUpdatedTime: string }
  Line: Array<{
    Amount: number
    LinkedTxn: Array<{ TxnId: string; TxnType: string }>
  }>
}

export interface QBOInvoice {
  Id: string
  DocNumber: string
  TxnDate: string
  DueDate: string
  Balance: number
  TotalAmt: number
  CustomerRef: { value: string; name: string }
  ClassRef?: { value: string; name: string }
  DepartmentRef?: { value: string; name: string } // "Location" in QBO UI
}

export interface QBOCustomer {
  Id: string
  DisplayName: string
  CompanyName?: string
  ParentRef?: { value: string; name: string }
  Active: boolean
}

export interface QBOBatchItemRequest {
  bId: string
  operation: 'create' | 'update' | 'delete'
  Payment?: Partial<QBOPayment>
}

export interface QBOBatchResponse {
  BatchItemResponse: Array<{
    bId: string
    Payment?: QBOPayment
    Fault?: { Error: Array<{ Message: string; code: string }> }
  }>
}

// ── API helpers ───────────────────────────────────────────────────────────────

export async function qboRequest<T>(
  firmId: string,
  realmId: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const controller = new globalThis.AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const accessToken = await getValidAccessToken(firmId)
    const url = `${QBO_BASE}/v3/company/${realmId}${path}`
    const response = await globalThis.fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`QBO API error ${response.status} on ${path}: ${body}`)
    }

    return await response.json() as T
  } catch (err: any) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') throw new Error(`QBO API timeout after 30s on ${path}`)
    throw err
  }
}

// ── Public API methods ────────────────────────────────────────────────────────

/**
 * Fetch a single payment by ID.
 */
export async function fetchPayment(
  firmId: string,
  realmId: string,
  paymentId: string
): Promise<QBOPayment> {
  const data = await qboRequest<{ Payment: QBOPayment }>(
    firmId,
    realmId,
    `/payment/${paymentId}`
  )
  return data.Payment
}

/**
 * Fetch all open invoices for a given customer (and optionally sub-customers).
 * Uses QBO's SQL-like query API.
 */
export async function fetchOpenInvoices(
  firmId: string,
  realmId: string,
  customerIds: string[]
): Promise<QBOInvoice[]> {
  const idList = customerIds.map((id) => `'${id}'`).join(', ')
  const query = `SELECT * FROM Invoice WHERE Balance > '0' AND CustomerRef IN (${idList}) MAXRESULTS 1000`

  const data = await qboRequest<{
    QueryResponse: { Invoice?: QBOInvoice[] }
  }>(firmId, realmId, `/query?query=${encodeURIComponent(query)}`)

  return data.QueryResponse.Invoice ?? []
}

/**
 * Fetch all sub-customers of a parent customer.
 */
export async function fetchSubCustomers(
  firmId: string,
  realmId: string,
  parentCustomerId: string
): Promise<QBOCustomer[]> {
  const query = `SELECT * FROM Customer WHERE ParentRef = '${parentCustomerId}' AND Active = true MAXRESULTS 100`

  const data = await qboRequest<{
    QueryResponse: { Customer?: QBOCustomer[] }
  }>(firmId, realmId, `/query?query=${encodeURIComponent(query)}`)

  return data.QueryResponse.Customer ?? []
}

/**
 * Fetch all active customers for a firm (for rule builder UI).
 */
export async function fetchAllCustomers(
  firmId: string,
  realmId: string
): Promise<QBOCustomer[]> {
  const query = `SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000`

  const data = await qboRequest<{
    QueryResponse: { Customer?: QBOCustomer[] }
  }>(firmId, realmId, `/query?query=${encodeURIComponent(query)}`)

  return data.QueryResponse.Customer ?? []
}

/**
 * Fetch recent payments for a firm.
 */
export async function fetchRecentPayments(
  firmId: string,
  realmId: string
): Promise<QBOPayment[]> {
  const query = `SELECT * FROM Payment ORDERBY MetaData.CreateTime DESC MAXRESULTS 100`

  const data = await qboRequest<{
    QueryResponse: { Payment?: QBOPayment[] }
  }>(firmId, realmId, `/query?query=${encodeURIComponent(query)}`)

  return data.QueryResponse.Payment ?? []
}

/**
 * Post a batch of payment operations to QBO.
 * CRITICAL: QBO hard limit is 30 operations per batch call.
 * This function handles a single chunk — chunking is done by the caller.
 */
export async function postBatch(
  firmId: string,
  realmId: string,
  items: QBOBatchItemRequest[]
): Promise<QBOBatchResponse> {
  if (items.length > 30) {
    throw new Error(`Batch size ${items.length} exceeds QBO limit of 30`)
  }

  return qboRequest<QBOBatchResponse>(firmId, realmId, '/batch', {
    method: 'POST',
    body: JSON.stringify({ BatchItemRequest: items }),
  })
}

/**
 * Delete a payment (used in rollback). Requires the SyncToken for optimistic locking.
 */
export async function deletePayment(
  firmId: string,
  realmId: string,
  paymentId: string,
  syncToken: string
): Promise<void> {
  await qboRequest(firmId, realmId, `/payment?operation=delete`, {
    method: 'POST',
    body: JSON.stringify({ Id: paymentId, SyncToken: syncToken }),
  })
}

/**
 * Create a Journal Entry in QBO.
 * This is the preferred method for revenue allocation per TPS v1.0.
 */
export async function createJournalEntry(
  firmId: string,
  realmId: string,
  journal: any
): Promise<any> {
  const data = await qboRequest<{ JournalEntry: any }>(firmId, realmId, '/journalentry', {
    method: 'POST',
    body: JSON.stringify(journal),
  })
  return data.JournalEntry
}

/**
 * Delete a Journal Entry (used in rollback/reversal if necessary).
 */
export async function deleteJournalEntry(
  firmId: string,
  realmId: string,
  id: string,
  syncToken: string
): Promise<void> {
  await qboRequest(firmId, realmId, `/journalentry?operation=delete`, {
    method: 'POST',
    body: JSON.stringify({ Id: id, SyncToken: syncToken }),
  })
}

/**
 * Fetch all locations (Departments in QBO API).
 */
export async function fetchAllLocations(
  firmId: string,
  realmId: string
): Promise<any[]> {
  const query = `SELECT * FROM Department WHERE Active = true MAXRESULTS 1000`
  const data = await qboRequest<{ QueryResponse: { Department?: any[] } }>(
    firmId,
    realmId,
    `/query?query=${encodeURIComponent(query)}`
  )
  return data.QueryResponse.Department ?? []
}

/**
 * Fetch all active accounts.
 */
export async function fetchAllAccounts(
  firmId: string,
  realmId: string
): Promise<any[]> {
  const query = `SELECT * FROM Account WHERE Active = true MAXRESULTS 1000`
  const data = await qboRequest<{ QueryResponse: { Account?: any[] } }>(
    firmId,
    realmId,
    `/query?query=${encodeURIComponent(query)}`
  )
  return data.QueryResponse.Account ?? []
}
