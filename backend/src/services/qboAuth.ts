import { config } from '../lib/config'
import { encrypt, decrypt } from '../lib/encryption'
import { prisma } from '../lib/prisma'

const QBO_BASE =
  config.QBO_ENVIRONMENT === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com'

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'

const SCOPES = 'com.intuit.quickbooks.accounting'

/**
 * Step 1: Generate the QBO authorization URL.
 * Redirect the user's browser here to start the OAuth flow.
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.QBO_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: config.QBO_REDIRECT_URI,
    response_type: 'code',
    state,
  })
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
}

/**
 * Step 2: Exchange the authorization code for access + refresh tokens.
 * Called from the OAuth callback route.
 */
export async function exchangeCodeForTokens(
  code: string,
  realmId: string
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  console.log(`[QBO Auth] Starting token exchange for realmId: ${realmId}`)
  
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.QBO_REDIRECT_URI,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[QBO Auth Error] Token exchange HTTP ${response.status}:`, errorText)
      throw new Error(`QBO token exchange failed: ${response.status} ${errorText}`)
    }

    const data = (await response.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    console.log('[QBO Auth Success] Tokens exchanged successfully')
    const expiresAt = new Date(Date.now() + data.expires_in * 1000)

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    }
  } catch (err: any) {
    console.error('[QBO Auth Critical Error] Fetch failed during token exchange:', err)
    // Re-throw with more context to help the user identify network issues (e.g. DNS, firewall)
    throw new Error(`Critical: Network fetch failed during QBO token exchange. Error: ${err.message}`)
  }
}

/**
 * Refresh an expired (or nearly expired) access token.
 * QBO access tokens expire after 1 hour. Call this proactively at ~55 minutes.
 */
export async function refreshAccessToken(
  firmId: string
): Promise<string> {
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })

  if (!firm.refreshToken) {
    throw new Error(`Firm ${firmId} has no refresh token stored`)
  }

  const decryptedRefreshToken = decrypt(firm.refreshToken)
  const credentials = Buffer.from(`${config.QBO_CLIENT_ID}:${config.QBO_CLIENT_SECRET}`).toString('base64')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptedRefreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`QBO token refresh failed: ${response.status} ${error}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  // Persist the new tokens (encrypted)
  await prisma.firm.update({
    where: { id: firmId },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: encrypt(data.refresh_token),
      tokenExpiresAt: expiresAt,
    },
  })

  return data.access_token
}

/**
 * Get a valid access token for a firm, auto-refreshing if close to expiry.
 * Use this everywhere you need to make a QBO API call.
 */
export async function getValidAccessToken(firmId: string): Promise<string> {
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } })

  if (!firm.accessToken || !firm.tokenExpiresAt) {
    throw new Error(`Firm ${firmId} is not connected to QBO`)
  }

  // Refresh if token expires within 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)
  if (firm.tokenExpiresAt <= fiveMinutesFromNow) {
    return refreshAccessToken(firmId)
  }

  return decrypt(firm.accessToken)
}
