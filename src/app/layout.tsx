import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/theme-provider'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  // Keeps the fallback metrics close to Inter's so swapping the font in does
  // not shift the layout.
  adjustFontFallback: true,
})

export const metadata: Metadata = {
  title: {
    default: 'CreditSense AI',
    template: '%s · CreditSense AI',
  },
  description:
    'AI-powered credit risk and financial inclusion platform. Turns wallet, top-up and utility payment behaviour into an explainable credit decision for thin-file applicants in Pakistan.',
  applicationName: 'CreditSense AI',
  // This is an internal lending tool holding applicant financial data — it
  // should never appear in a search index.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never block pinch-zoom: capping it fails WCAG 1.4.4 and takes away the
  // one tool a low-vision user has for reading a dense figure on a phone.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfcfd' },
    { media: '(prefers-color-scheme: dark)', color: '#161a22' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint — see THEME_INIT_SCRIPT. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
