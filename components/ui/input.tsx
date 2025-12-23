'use client'

import { forwardRef, InputHTMLAttributes, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, className = '', placeholder, ...props }, ref) => {
    // Remove placeholder from props to avoid duplication
    const { placeholder: _, ...inputProps } = props as any
    
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--google-grey-700)] mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--google-grey-500)] pointer-events-none flex items-center justify-center" style={{ fontSize: '20px', width: '20px', height: '20px' }}>
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full px-4 py-2.5 rounded-lg border transition-colors
              ${icon ? 'pl-10' : ''}
              ${
                error
                  ? 'border-[var(--google-red)] focus:border-[var(--google-red)] focus:ring-[var(--google-red)]'
                  : 'border-[var(--google-grey-300)] focus:border-[var(--google-blue)] focus:ring-2 focus:ring-[var(--google-blue)]'
              }
              focus:outline-none
              bg-white text-[var(--google-grey-900)]
              placeholder:text-[var(--google-grey-500)]
              ${className}
            `}
            placeholder={placeholder}
            {...inputProps}
          />
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-[var(--google-red)]">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-[var(--google-grey-600)]">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

