import { Resend } from 'resend'

// Lazy init — only created when actually needed, prevents crash on missing key
let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

const FROM = 'PaySplit <onboarding@resend.dev>'

interface JobCompleteEmailParams {
  to: string
  firmName: string
  jobId: string
  totalAmount: number
  splitCount: number
  completedAt: Date
  ruleType?: string
}

interface JobFailedEmailParams {
  to: string
  firmName: string
  jobId: string
  errorMessage: string
  failedAt: Date
}

export async function sendJobCompleteEmail(params: JobCompleteEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.log('ℹ️  RESEND_API_KEY not set — skipping email notification')
    return
  }

  const { to, firmName, jobId, totalAmount, splitCount, completedAt, ruleType } = params

  const shortId = jobId.slice(0, 8).toUpperCase()
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalAmount)
  const formattedDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(completedAt)

  try {
    await getResend().emails.send({
      from: FROM,
      to,
      subject: `✅ Payment split complete — ${formattedAmount} across ${splitCount} invoice${splitCount !== 1 ? 's' : ''}`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Payment Split Complete</title>
        </head>
        <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;color:#1a1a1e;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
                <!-- Header -->
                <tr>
                  <td style="background:#2d31fa;padding:28px 36px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.5px;">PaySplit</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:36px 36px 28px;">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#10b981;">Payment Split Complete</p>
                    <h1 style="margin:0 0 24px;font-size:28px;font-weight:800;letter-spacing:-1px;color:#1a1a1e;">${formattedAmount}</h1>
                    <!-- Stats -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;border-radius:10px;margin-bottom:28px;">
                      <tr>
                        <td style="padding:18px 20px;border-right:1px solid #e5e5e7;text-align:center;">
                          <div style="font-size:20px;font-weight:800;color:#1a1a1e;">${splitCount}</div>
                          <div style="font-size:11px;color:#909098;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">Invoices split</div>
                        </td>
                        <td style="padding:18px 20px;border-right:1px solid #e5e5e7;text-align:center;">
                          <div style="font-size:20px;font-weight:800;color:#1a1a1e;">${ruleType || 'Custom'}</div>
                          <div style="font-size:11px;color:#909098;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">Rule type</div>
                        </td>
                        <td style="padding:18px 20px;text-align:center;">
                          <div style="font-size:14px;font-weight:700;color:#1a1a1e;font-family:monospace;">${shortId}</div>
                          <div style="font-size:11px;color:#909098;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">Job ID</div>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 6px;font-size:13.5px;color:#6c6c72;line-height:1.6;">
                      This payment was automatically split and posted to QuickBooks Online at <strong>${formattedDate}</strong>. The full audit trail is available in your PaySplit dashboard.
                    </p>
                  </td>
                </tr>
                <!-- CTA -->
                <tr>
                  <td style="padding:0 36px 36px;">
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#2d31fa;color:#ffffff;text-decoration:none;font-size:13px;font-weight:800;padding:13px 24px;border-radius:9px;letter-spacing:-0.2px;">View Audit Trail →</a>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding:20px 36px;border-top:1px solid #e5e5e7;">
                    <p style="margin:0;font-size:11.5px;color:#909098;">Sent to ${to} · ${firmName} · <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="color:#909098;">Dashboard</a></p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    })
    console.log(`📧 Job complete email sent to ${to} for job ${jobId}`)
  } catch (err) {
    console.error(`📧 Failed to send completion email for job ${jobId}:`, err)
  }
}

export async function sendJobFailedEmail(params: JobFailedEmailParams) {
  if (!process.env.RESEND_API_KEY) return

  const { to, firmName, jobId, errorMessage, failedAt } = params
  const shortId = jobId.slice(0, 8).toUpperCase()
  const formattedDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(failedAt)

  try {
    await getResend().emails.send({
      from: FROM,
      to,
      subject: `⚠️ Payment split failed — Job ${shortId} needs attention`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f7;color:#1a1a1e;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
                <tr>
                  <td style="background:#ef4444;padding:28px 36px;">
                    <p style="margin:0;color:#fff;font-size:18px;font-weight:800;">PaySplit</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:36px;">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#ef4444;">Payment Split Failed</p>
                    <h1 style="margin:0 0 20px;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Job ${shortId} failed at ${formattedDate}</h1>
                    <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                      <p style="margin:0;font-size:13px;color:#ef4444;font-family:monospace;">${errorMessage}</p>
                    </div>
                    <p style="margin:0;font-size:13.5px;color:#6c6c72;line-height:1.6;">
                      If QBO payments were partially posted, PaySplit has automatically rolled them back. Check the dashboard for details.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 36px 36px;">
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;font-size:13px;font-weight:800;padding:13px 24px;border-radius:9px;">View Failed Job →</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 36px;border-top:1px solid #e5e5e7;">
                    <p style="margin:0;font-size:11.5px;color:#909098;">Sent to ${to} · ${firmName}</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    })
    console.log(`📧 Job failed email sent to ${to} for job ${jobId}`)
  } catch (err) {
    console.error(`📧 Failed to send failure email for job ${jobId}:`, err)
  }
}