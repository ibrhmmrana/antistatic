export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong'

export interface PasswordRequirements {
  minLength: boolean
  hasUpperCase: boolean
  hasLowerCase: boolean
  hasNumber: boolean
  hasSpecialChar: boolean
}

export interface PasswordStrengthResult {
  strength: PasswordStrength
  score: number // 0-4
  requirements: PasswordRequirements
  isValid: boolean
}

const MIN_PASSWORD_LENGTH = 8

export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const requirements: PasswordRequirements = {
    minLength: password.length >= MIN_PASSWORD_LENGTH,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  }

  // Calculate score based on requirements met
  const score = Object.values(requirements).filter(Boolean).length

  // Determine strength level
  let strength: PasswordStrength
  if (score <= 2) {
    strength = 'weak'
  } else if (score === 3) {
    strength = 'fair'
  } else if (score === 4) {
    strength = 'good'
  } else {
    strength = 'strong'
  }

  // Password is valid if it meets minimum requirements (at least 4 out of 5)
  const isValid = score >= 4 && requirements.minLength

  return {
    strength,
    score,
    requirements,
    isValid,
  }
}

export function getPasswordStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return 'var(--google-red)'
    case 'fair':
      return '#ff9800' // Orange color
    case 'good':
      return 'var(--google-yellow)'
    case 'strong':
      return 'var(--google-green)'
    default:
      return 'var(--google-grey-300)'
  }
}

export function getPasswordStrengthText(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return 'Weak'
    case 'fair':
      return 'Fair'
    case 'good':
      return 'Good'
    case 'strong':
      return 'Strong'
    default:
      return ''
  }
}

