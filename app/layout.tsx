import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
// CRITICAL: This import must be in the root layout only. Do not import globals.css elsewhere.
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
      <head>
        {/* Preload Product Sans fonts for faster loading */}
        <link
          rel="preload"
          href="/fonts/product-sans/ProductSans-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/product-sans/ProductSans-Medium.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/product-sans/ProductSans-Bold.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        {/* Material Symbols removed - using MUI icons instead */}
      </head>
      <body className={roboto.variable}>
        {children}
      </body>
    </html>
  )
}

