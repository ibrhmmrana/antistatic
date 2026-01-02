/**
 * Password Strength Utilities
 * 
 * Functions for checking password strength and displaying strength indicators
 */

export type PasswordStrength = 'very-weak' | 'weak' | 'fair' | 'good' | 'strong'

export interface PasswordStrengthResult {
  score: number // 0-5
  strength: PasswordStrength
  isValid: boolean
  requirements: {
    minLength: boolean
    hasUpperCase: boolean
    hasLowerCase: boolean
    hasNumber: boolean
    hasSpecialChar: boolean
  }
}

/**
 * Check password strength and validate requirements
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const requirements = {
    minLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  }

  // Count how many requirements are met
  const metRequirements = Object.values(requirements).filter(Boolean).length

  // Calculate score (0-5)
  let score = metRequirements

  // Bonus points for length
  if (password.length >= 12) score += 1
  if (password.length >= 16) score += 1
  // Cap at 5
  score = Math.min(score, 5)

  // Determine strength level
  let strength: PasswordStrength
  if (score <= 1) {
    strength = 'very-weak'
  } else if (score === 2) {
    strength = 'weak'
  } else if (score === 3) {
    strength = 'fair'
  } else if (score === 4) {
    strength = 'good'
  } else {
    strength = 'strong'
  }

  // Password is valid if all requirements are met
  const isValid = Object.values(requirements).every(Boolean)

  return {
    score,
    strength,
    isValid,
    requirements,
  }
}

/**
 * Get color for password strength indicator
 */
export function getPasswordStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case 'very-weak':
      return '#dc2626' // red-600
    case 'weak':
      return '#ea580c' // orange-600
    case 'fair':
      return '#ca8a04' // yellow-600
    case 'good':
      return '#16a34a' // green-600
    case 'strong':
      return '#15803d' // green-700
    default:
      return '#9ca3af' // gray-400
  }
}

/**
 * Get text label for password strength
 */
export function getPasswordStrengthText(strength: PasswordStrength): string {
  switch (strength) {
    case 'very-weak':
      return 'Very Weak'
    case 'weak':
      return 'Weak'
    case 'fair':
      return 'Fair'
    case 'good':
      return 'Good'
    case 'strong':
      return 'Strong'
    default:
      return 'Unknown'
  }
}
