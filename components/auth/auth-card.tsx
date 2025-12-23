'use client'

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Person as PersonIcon, Mail as MailIcon, Lock as LockIcon } from '@mui/icons-material'
import { checkPasswordStrength, getPasswordStrengthColor, getPasswordStrengthText } from '@/lib/utils/password-strength'
import { Database } from '@/lib/supabase/database.types'

type ProfileInsert = Database['public']['Tables']['profiles']['Insert']

interface AuthCardProps {
  showVerifiedMessage?: boolean
}

export function AuthCard({ showVerifiedMessage: initialShowVerified = false }: AuthCardProps = {}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false)
  const [showVerifiedMessage, setShowVerifiedMessage] = useState(initialShowVerified)
  const [userEmail, setUserEmail] = useState<string>('')
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
  })
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Check for verified parameter in URL
  useEffect(() => {
    if (searchParams.get('verified') === 'true') {
      setShowVerifiedMessage(true)
      // Remove the query parameter from URL without reload
      router.replace('/auth', { scroll: false })
    }
  }, [searchParams, router])

  // Calculate password strength
  const passwordStrength = useMemo(() => {
    if (mode === 'signup' && formData.password) {
      return checkPasswordStrength(formData.password)
    }
    return null
  }, [formData.password, mode])

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === 'signup') {
        // Validate password strength before signup
        if (passwordStrength && !passwordStrength.isValid) {
          setError('Please create a stronger password that meets all requirements.')
          setLoading(false)
          return
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })

        if (signUpError) throw signUpError

        if (!data.user) {
          throw new Error('Sign up failed. Please try again.')
        }

        // Check if email confirmation is required
        // Supabase returns a user but no session when email confirmation is enabled
        if (!data.session) {
          // Email confirmation is required - show confirmation message
          setUserEmail(formData.email)
          setShowEmailConfirmation(true)
          setLoading(false)
          return
        }

        // Create profile (only if we have a session, meaning email confirmation is not required)
        const profileData: ProfileInsert = {
          id: data.user.id,
          full_name: formData.fullName,
          onboarding_completed: false,
        }
        const { error: profileError } = await supabase.from('profiles').insert(profileData as any)

        if (profileError && profileError.code !== '23505') {
          // 23505 is unique violation, which means profile already exists (shouldn't happen on signup)
          throw profileError
        }

        // Wait a bit for session to be established
        await new Promise(resolve => setTimeout(resolve, 150))

        // Verify session is available
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.warn('Session error on signup:', sessionError)
        }

        // If no session, try to refresh (might be needed if email confirmation is disabled)
        if (!session) {
          const { error: refreshError } = await supabase.auth.refreshSession()
          if (refreshError) {
            console.warn('Session refresh warning:', refreshError)
            // If refresh also fails, user likely needs to confirm email
            const { data: { session: refreshedSession } } = await supabase.auth.getSession()
            if (!refreshedSession) {
              // Show email confirmation message
              setUserEmail(formData.email)
              setShowEmailConfirmation(true)
              setLoading(false)
              return
            }
          }
        }

        // Check session one more time after refresh attempt
        const { data: { session: finalSession } } = await supabase.auth.getSession()
        if (!finalSession) {
          // Show email confirmation message
          setUserEmail(formData.email)
          setShowEmailConfirmation(true)
          setLoading(false)
          return
        }

        // Use window.location for reliable navigation after signup
        // This ensures cookies are properly set before navigation
        window.location.href = '/onboarding/business'
      } else {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        })

        if (signInError) throw signInError

        if (!signInData.user) {
          throw new Error('Sign in failed. Please try again.')
        }

        // Verify session is available
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Session error:', sessionError)
          throw new Error('Failed to establish session. Please try again.')
        }

        if (!session) {
          // Try refreshing the session
          const { error: refreshError } = await supabase.auth.refreshSession()
          if (refreshError) {
            console.error('Session refresh error:', refreshError)
            throw new Error('Session could not be established. Please try again.')
          }
        }

        // Wait a moment for session to be fully established
        await new Promise(resolve => setTimeout(resolve, 150))

        // Check if user has completed onboarding
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', signInData.user.id)
          .maybeSingle()

        if (profileError) {
          console.error('Profile fetch error:', profileError)
          // Continue anyway - profile might not exist yet
        }

        // Use window.location for reliable navigation after signin
        // This ensures cookies are properly set before navigation
        if (profile?.onboarding_completed) {
          window.location.href = '/dashboard'
        } else {
          window.location.href = '/onboarding/business'
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err)
      setError(err.message || 'An error occurred. Please try again.')
      setLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    setLoading(true)
    setError(null)

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (oauthError) throw oauthError
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setLoading(false)
    }
  }

  const handleResendConfirmation = async () => {
    setLoading(true)
    setError(null)

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: userEmail,
      })

      if (resendError) throw resendError

      // Show success message
      setError(null)
      // You could add a success state here if needed
    } catch (err: any) {
      setError(err.message || 'Failed to resend confirmation email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl lg:text-4xl font-bold mb-4 lg:mb-6 text-[var(--google-grey-900)] text-center" style={{ lineHeight: '1.1', width: '460px' }}>
        See How You Stack Up Against Competitors - Free
      </h1>

      {/* Email Verified Success Message */}
      {showVerifiedMessage && (
        <div className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-800 mb-1">
                Email verified successfully!
              </h3>
              <p className="text-sm text-green-700">
                Your email has been confirmed. You can now sign in to your account.
              </p>
            </div>
            <button
              onClick={() => setShowVerifiedMessage(false)}
              className="flex-shrink-0 text-green-600 hover:text-green-800 transition-colors"
              aria-label="Close message"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Email Confirmation Message */}
      {showEmailConfirmation ? (
        <div className="space-y-4">
          <div className="p-6 rounded-lg bg-blue-50 border border-blue-200">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[var(--google-grey-900)] mb-2">
                  Check your email
                </h2>
                <p className="text-sm text-[var(--google-grey-700)] mb-3">
                  We've sent a confirmation link to <strong>{userEmail}</strong>. Please check your email and click the link to verify your account.
                </p>
                <p className="text-xs text-[var(--google-grey-600)] mb-4">
                  Didn't receive the email? Check your spam folder or click the button below to resend.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleResendConfirmation}
                    disabled={loading}
                    className="flex-1"
                  >
                    {loading ? 'Sending...' : 'Resend confirmation email'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      setShowEmailConfirmation(false)
                      setFormData({ fullName: '', email: '', password: '' })
                      setError(null)
                    }}
                    disabled={loading}
                    className="flex-1"
                  >
                    Back to sign up
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-sm text-[var(--google-red)] border border-red-200">
              {error}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Toggle */}
          <div className="flex gap-2 mb-4 lg:mb-6 p-1 bg-[var(--google-grey-100)] rounded-lg">
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors ${
                mode === 'signup'
                  ? 'bg-white text-[#1565B4] shadow-sm'
                  : 'text-[var(--google-grey-600)] hover:text-[var(--google-grey-900)]'
              }`}
            >
              Sign up
            </button>
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors ${
                mode === 'signin'
                  ? 'bg-white text-[#1565B4] shadow-sm'
                  : 'text-[var(--google-grey-600)] hover:text-[var(--google-grey-900)]'
              }`}
            >
              Sign in
            </button>
          </div>

          {/* Form */}
      <form onSubmit={handleEmailAuth} className="space-y-3 lg:space-y-4">
        {mode === 'signup' && (
          <Input
            type="text"
            placeholder="Full name"
            value={formData.fullName}
            onChange={(e) =>
              setFormData({ ...formData, fullName: e.target.value })
            }
            icon={<PersonIcon sx={{ fontSize: 20 }} />}
            required
          />
        )}
        <Input
          type="email"
          placeholder={mode === 'signup' ? 'Work email' : 'Email'}
          value={formData.email}
          onChange={(e) =>
            setFormData({ ...formData, email: e.target.value })
          }
          icon={<MailIcon sx={{ fontSize: 20 }} />}
          required
        />
        <div>
          <Input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            icon={<LockIcon sx={{ fontSize: 20 }} />}
            required
            error={mode === 'signup' && passwordStrength && !passwordStrength.isValid && formData.password ? 'Password does not meet requirements' : undefined}
          />
          
          {/* Password Strength Indicator - Only show on signup */}
          {mode === 'signup' && formData.password && passwordStrength && (
            <div className="mt-2">
              {/* Strength Bar */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1.5 bg-[var(--google-grey-200)] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ 
                      width: `${(passwordStrength.score / 5) * 100}%`,
                      backgroundColor: getPasswordStrengthColor(passwordStrength.strength)
                    }}
                  />
                </div>
                <span className={`text-xs font-medium ${passwordStrength.isValid ? 'text-green-600' : 'text-[var(--google-grey-600)]'}`}>
                  {getPasswordStrengthText(passwordStrength.strength)}
                </span>
              </div>

              {/* Requirements Checklist */}
              <div className="space-y-1.5">
                <div className={`flex items-center gap-2 text-xs ${passwordStrength.requirements.minLength ? 'text-green-600' : 'text-[var(--google-grey-600)]'}`}>
                  <span className={passwordStrength.requirements.minLength ? 'text-green-600' : 'text-[var(--google-grey-400)]'}>
                    {passwordStrength.requirements.minLength ? '✓' : '○'}
                  </span>
                  <span>At least 8 characters</span>
                </div>
                <div className={`flex items-center gap-2 text-xs ${passwordStrength.requirements.hasUpperCase ? 'text-green-600' : 'text-[var(--google-grey-600)]'}`}>
                  <span className={passwordStrength.requirements.hasUpperCase ? 'text-green-600' : 'text-[var(--google-grey-400)]'}>
                    {passwordStrength.requirements.hasUpperCase ? '✓' : '○'}
                  </span>
                  <span>One uppercase letter</span>
                </div>
                <div className={`flex items-center gap-2 text-xs ${passwordStrength.requirements.hasLowerCase ? 'text-green-600' : 'text-[var(--google-grey-600)]'}`}>
                  <span className={passwordStrength.requirements.hasLowerCase ? 'text-green-600' : 'text-[var(--google-grey-400)]'}>
                    {passwordStrength.requirements.hasLowerCase ? '✓' : '○'}
                  </span>
                  <span>One lowercase letter</span>
                </div>
                <div className={`flex items-center gap-2 text-xs ${passwordStrength.requirements.hasNumber ? 'text-green-600' : 'text-[var(--google-grey-600)]'}`}>
                  <span className={passwordStrength.requirements.hasNumber ? 'text-green-600' : 'text-[var(--google-grey-400)]'}>
                    {passwordStrength.requirements.hasNumber ? '✓' : '○'}
                  </span>
                  <span>One number</span>
                </div>
                <div className={`flex items-center gap-2 text-xs ${passwordStrength.requirements.hasSpecialChar ? 'text-green-600' : 'text-[var(--google-grey-600)]'}`}>
                  <span className={passwordStrength.requirements.hasSpecialChar ? 'text-green-600' : 'text-[var(--google-grey-400)]'}>
                    {passwordStrength.requirements.hasSpecialChar ? '✓' : '○'}
                  </span>
                  <span>One special character</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {mode === 'signin' && (
          <div className="text-right">
            <a
              href="#"
              className="text-sm text-[#1565B4] hover:underline"
            >
              Forgot your password?
            </a>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-sm text-[var(--google-red)]">
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="md"
          className="w-full"
          disabled={loading || (mode === 'signup' && passwordStrength ? !passwordStrength.isValid : false)}
        >
          {loading
            ? 'Loading...'
            : mode === 'signup'
              ? 'Create account'
              : 'Sign in'}
        </Button>

        {mode === 'signup' && (
          <p className="text-xs text-[var(--google-grey-600)] text-center">
            By creating an account you agree to Antistatic's{' '}
            <a href="#" className="text-[#1565B4] hover:underline">
              Terms
            </a>{' '}
            and{' '}
            <a href="#" className="text-[#1565B4] hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        )}
      </form>

      {/* Divider */}
      <div className="flex items-center my-4 lg:my-6">
        <div className="flex-1 border-t border-[var(--google-grey-300)]"></div>
        <span className="px-4 text-sm text-[var(--google-grey-600)]">or</span>
        <div className="flex-1 border-t border-[var(--google-grey-300)]"></div>
      </div>

      {/* Google Button */}
      <Button
        variant="secondary"
        size="md"
        className="w-full flex items-center justify-center gap-2"
        onClick={handleGoogleAuth}
        disabled={loading}
        type="button"
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continue with Google
      </Button>
        </>
      )}

    </div>
  )
}

