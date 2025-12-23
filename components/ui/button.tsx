'use client'

import { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'text'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'font-medium rounded transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
  // Google Material Design uses 4px border radius (0.25rem = rounded in Tailwind)

  const variantStyles = {
    primary:
      'bg-[#1565B4] text-white hover:bg-[#0d4a7a] focus:ring-[#1565B4] shadow-sm',
    secondary:
      'bg-white text-[var(--google-grey-700)] border border-[var(--google-grey-300)] hover:bg-[var(--google-grey-50)] focus:ring-[var(--google-grey-300)]',
    outline:
      'bg-transparent text-[#1565B4] border border-[#1565B4] hover:bg-[#1565B4] hover:text-white focus:ring-[#1565B4]',
    text: 'bg-transparent text-[#1565B4] hover:bg-[var(--google-grey-100)] focus:ring-[#1565B4]',
  }

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}

