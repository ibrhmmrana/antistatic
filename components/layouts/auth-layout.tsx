'use client'

import { ReactNode } from 'react'

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="h-screen flex overflow-hidden bg-white">
      {/* Left Column - Image */}
      <div className="hidden lg:flex lg:w-[55%] rounded-3xl lg:rounded-[2rem] m-2 lg:m-3 overflow-hidden">
        <img
          src="/Antistatic.png"
          alt="Antistatic"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Right Column - Auth Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-4 lg:p-8 bg-white overflow-y-auto">
        <div className="w-full max-w-md py-4">{children}</div>
      </div>
    </div>
  )
}

