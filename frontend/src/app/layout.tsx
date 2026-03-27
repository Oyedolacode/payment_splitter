import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '../components/common/ThemeProvider'

export const metadata: Metadata = {
  title: 'PaySplit — Automated Payment Splitting for QBO',
  description: 'PaySplit intercepts your QuickBooks Online payments and automatically routes them across branch locations. Full audit trail, zero manual work.',
  keywords: 'QuickBooks payment splitting, multi-location accounting, automated payment reconciliation, QBO automation',
  openGraph: {
    title: 'PaySplit — Automated Payment Splitting for QBO',
    description: 'Stop splitting payments in Excel. PaySplit intercepts QuickBooks payments and routes them across branch locations automatically.',
    type: 'website',
    siteName: 'PaySplit',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PaySplit — Automated Payment Splitting for QBO',
    description: 'Stop splitting payments in Excel. Connect to QBO in 2 minutes.',
  },
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'><rect x='1' y='1' width='9' height='9' rx='3' fill='%232d31fa'/><rect x='12' y='1' width='9' height='9' rx='3' fill='%232d31fa' fill-opacity='.3'/><rect x='1' y='12' width='9' height='9' rx='3' fill='%232d31fa' fill-opacity='.3'/><rect x='12' y='12' width='9' height='9' rx='3' fill='%2310b981'/></svg>",
        type: 'image/svg+xml',
      }
    ],
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
