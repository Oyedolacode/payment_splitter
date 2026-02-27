import type { Metadata } from 'next'
import './globals.css'
import '../components/ThemeProvider'
import { ThemeProvider } from '../components/ThemeProvider'

export const metadata: Metadata = {
  title: 'Payment Splitter',
  description: 'Multi-branch payment reconciliation engine',
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
