import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
// IMPORTANT: global CSS must be imported here or Tailwind/shadcn styling will disappear across the app.
import './globals.css'

const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  variable: '--font-roboto',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Antistatic - Manage Reviews, Messages and Social',
  description: 'Use AI to manage reviews, messages and social from one place',
  icons: {
    icon: '/Antistatic-favicon.png',
    apple: '/Antistatic-favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={roboto.variable}>
      <body className={roboto.variable}>
        {children}
      </body>
    </html>
  )
}

