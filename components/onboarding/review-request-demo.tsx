'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowBack as ArrowBackIcon, Send as SendIcon } from '@mui/icons-material'
import { createClient } from '@/lib/supabase/client'
import { useToast, ToastContainer } from '@/components/ui/toast'
// Normalize South African phone number to E.164 format
const normalizePhoneNumber = (phone: string): string => {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '')
  
  // Handle South African numbers
  if (digits.startsWith('0')) {
    // Convert 0XX to +27XX (remove leading 0)
    digits = '27' + digits.substring(1)
  } else if (digits.startsWith('27')) {
    // Already has country code
    // Keep as is
  } else {
    // If it doesn't start with 27, assume it's a local number (9 or 10 digits)
    // Add country code
    digits = '27' + digits
  }
  
  // Validate final format: +27 followed by 9 or 10 digits
  if (!/^27\d{9,10}$/.test(digits)) {
    throw new Error('Invalid phone number format')
  }
  
  return '+' + digits
}

interface ReviewRequestDemoProps {
  locationId: string
}

export function ReviewRequestDemo({ locationId }: ReviewRequestDemoProps) {
  const [goingBack, setGoingBack] = useState(false)
  const [reviewSent, setReviewSent] = useState(false)
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [customerName, setCustomerName] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [headerImage, setHeaderImage] = useState<File | null>(null)
  const [headerImageUrl, setHeaderImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [businessName, setBusinessName] = useState<string>('')
  const [businessPhone, setBusinessPhone] = useState<string>('')
  const [customBusinessName, setCustomBusinessName] = useState<string>('')
  const [customBusinessPhone, setCustomBusinessPhone] = useState<string>('')
  const [templateName, setTemplateName] = useState('review_temp_1')
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()
  const { toasts, showToast, removeToast } = useToast()

  // Fetch business details on mount
  useEffect(() => {
    if (locationId) {
      fetchBusinessDetails()
    }
  }, [locationId])

  // Always prefill custom fields when business details are fetched or change
  useEffect(() => {
    if (businessName) {
      setCustomBusinessName(businessName)
    }
    if (businessPhone) {
      setCustomBusinessPhone(businessPhone)
    }
  }, [businessName, businessPhone])

  // Check if a review request has already been sent
  useEffect(() => {
    const checkReviewRequest = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: reviewRequests } = await supabase
        .from('review_requests')
        .select('id')
        .eq('business_location_id', locationId)
        .limit(1)
        .maybeSingle()

      if (reviewRequests) {
        setReviewSent(true)
      }
    }
    checkReviewRequest()
  }, [locationId, supabase])

  const fetchBusinessDetails = async () => {
    try {
      const response = await fetch(`/api/business-location?locationId=${locationId}`)
      if (response.ok) {
        const data = await response.json()
        setBusinessName(data.name || '')
        setBusinessPhone(data.phone_number || '')
      }
    } catch (error) {
      console.error('Failed to fetch business details:', error)
    }
  }

  const handleImageSelect = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size must be less than 5MB', 'error')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('businessLocationId', locationId)

      const response = await fetch('/api/review-requests/upload-image', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setHeaderImageUrl(data.publicUrl)
        setHeaderImage(file)
        showToast('Image uploaded successfully', 'success')
      } else {
        const error = await response.json()
        showToast(error.error || 'Failed to upload image', 'error')
      }
    } catch (error) {
      console.error('Failed to upload image:', error)
      showToast('Failed to upload image', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImageSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files[0]
    if (file) {
      handleImageSelect(file)
    }
  }

  const handleSend = async () => {
    if (!customerName.trim()) {
      showToast('Customer name is required', 'error')
      return
    }

    if (activeChannel === 'whatsapp') {
      if (!whatsappNumber.trim()) {
        showToast('WhatsApp number is required', 'error')
        return
      }

      if (!headerImageUrl) {
        showToast('Header image is required', 'error')
        return
      }

      setSending(true)
      try {
        let normalizedPhone: string
        try {
          normalizedPhone = normalizePhoneNumber(whatsappNumber)
        } catch (error: any) {
          showToast(error.message || 'Invalid phone number format', 'error')
          setSending(false)
          return
        }
        
        const response = await fetch('/api/review-requests/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: normalizedPhone,
            customerName: customerName.trim(),
            headerImageUrl,
            businessLocationId: locationId,
            businessName: customBusinessName.trim() || businessName,
            businessPhone: customBusinessPhone.trim() || businessPhone,
          }),
        })

        if (response.ok) {
          // Show success popup
          setShowSuccessPopup(true)
          setReviewSent(true)
          
          // Reset form
          setCustomerName('')
          setWhatsappNumber('')
          setHeaderImage(null)
          setHeaderImageUrl(null)
          setCustomBusinessName(businessName)
          setCustomBusinessPhone(businessPhone)
          
          // Mark onboarding as completed
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            await (supabase
              .from('profiles') as any)
              .update({ onboarding_completed: true })
              .eq('id', user.id)
          }
        } else {
          const error = await response.json()
          showToast(`Failed to send: ${error.error || 'Unknown error'}`, 'error')
        }
      } catch (error) {
        console.error('Failed to send review request:', error)
        showToast('Failed to send review request', 'error')
      } finally {
        setSending(false)
      }
    }
  }

  const handleBack = () => {
    setGoingBack(true)
    router.push('/onboarding/tools?allowBack=true')
  }

  const handleContinue = async () => {
    try {
      // Mark onboarding as completed
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) {
        console.error('Error getting user:', userError)
        showToast('Error: Please try again', 'error')
        return
      }
      
      if (user) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ onboarding_completed: true })
          .eq('id', user.id)
        
        if (updateError) {
          console.error('Error updating profile:', updateError)
          showToast('Error updating profile. Redirecting anyway...', 'error')
        }
      }
      
      router.push('/dashboard')
    } catch (error) {
      console.error('Error in handleContinue:', error)
      showToast('An error occurred. Redirecting...', 'error')
      // Still try to navigate even if there's an error
      setTimeout(() => {
        router.push('/dashboard')
      }, 1000)
    }
  }

  return (
    <div className="onboarding-page">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Success Popup Confirmation */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={() => setShowSuccessPopup(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 text-center mb-2" style={{ fontFamily: 'var(--font-google-sans)' }}>Review Request Sent!</h3>
            <p className="text-sm text-slate-600 text-center mb-6" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Your WhatsApp review request has been sent successfully.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSuccessPopup(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowSuccessPopup(false)
                  // Reset form for another send
                  setCustomerName('')
                  setWhatsappNumber('')
                  setHeaderImage(null)
                  setHeaderImageUrl(null)
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                Send Another
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleBack}
        disabled={goingBack}
        className="flex items-center gap-2 text-[var(--google-grey-600)] hover:text-[var(--google-grey-900)] mb-6 transition-all duration-150 active:scale-95 active:opacity-70 disabled:opacity-70 disabled:cursor-not-allowed"
        style={{ fontFamily: 'var(--font-roboto-stack)' }}
      >
        <ArrowBackIcon sx={{ fontSize: 20 }} />
        <span className="text-sm font-medium">{goingBack ? 'Going back...' : 'Back'}</span>
      </button>

      <h1 className="text-2xl lg:text-3xl font-medium mb-3 text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
        Try our review request feature
      </h1>
      <p className="text-base text-[var(--google-grey-600)] mb-8" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
        Send a test review request to see how easy it is to collect more reviews from your customers. You can send via WhatsApp or Email with a personalized message.
      </p>

      <div className="max-w-5xl">
        <div className="bg-white rounded-lg border-2 border-slate-200 shadow-sm p-6 md:p-8">
          {/* Channel Selector */}
          <div className="mb-6 flex gap-2 border-b border-slate-200 pb-4">
            <button
              onClick={() => setActiveChannel('whatsapp')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeChannel === 'whatsapp'
                  ? 'bg-[#1a73e8] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              style={{ fontFamily: 'var(--font-roboto-stack)' }}
            >
              WhatsApp
            </button>
            <button
              disabled
              className="px-4 py-2 text-sm font-medium rounded-md bg-slate-100 text-slate-400 cursor-not-allowed opacity-50"
              style={{ fontFamily: 'var(--font-roboto-stack)' }}
            >
              Email <span className="text-xs">(Coming soon)</span>
            </button>
          </div>

          {activeChannel === 'whatsapp' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Form */}
              <div className="space-y-4">
                {/* Customer Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    Customer name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter customer name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] text-sm"
                    style={{ fontFamily: 'var(--font-roboto-stack)' }}
                  />
                </div>

                {/* WhatsApp Number */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    WhatsApp number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="0XX XXX XXXX or +27XX XXX XXXX"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] text-sm"
                    style={{ fontFamily: 'var(--font-roboto-stack)' }}
                  />
                  <p className="text-xs text-slate-500 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>South African numbers will be converted to international format</p>
                </div>

                {/* Business Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    Business name
                  </label>
                  <input
                    type="text"
                    value={customBusinessName}
                    onChange={(e) => setCustomBusinessName(e.target.value)}
                    placeholder="Enter business name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] text-sm"
                    style={{ fontFamily: 'var(--font-roboto-stack)' }}
                  />
                  <p className="text-xs text-slate-500 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Defaults to your business name if left empty</p>
                </div>

                {/* Business Phone */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    Business phone
                  </label>
                  <input
                    type="tel"
                    value={customBusinessPhone}
                    onChange={(e) => setCustomBusinessPhone(e.target.value)}
                    placeholder="Enter business phone number"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] text-sm"
                    style={{ fontFamily: 'var(--font-roboto-stack)' }}
                  />
                  <p className="text-xs text-slate-500 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Defaults to your business phone if left empty</p>
                </div>

                {/* Template Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    Template
                  </label>
                  <select
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] text-sm bg-white"
                    style={{ fontFamily: 'var(--font-roboto-stack)' }}
                  >
                    <option value="review_temp_1">General</option>
                  </select>
                </div>

                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    Header image <span className="text-red-500">*</span>
                  </label>
                  {headerImageUrl ? (
                    <div className="space-y-2">
                      <div className="relative w-full h-32 border border-slate-300 rounded-md overflow-hidden bg-slate-50">
                        <Image
                          src={headerImageUrl}
                          alt="Header preview"
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                      <button
                        onClick={() => {
                          setHeaderImage(null)
                          setHeaderImageUrl(null)
                          if (fileInputRef.current) {
                            fileInputRef.current.value = ''
                          }
                        }}
                        className="text-sm text-[#1a73e8] hover:text-[#1557b0]"
                        style={{ fontFamily: 'var(--font-roboto-stack)' }}
                      >
                        Replace image
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className="border-2 border-dashed border-slate-300 rounded-md p-6 text-center hover:border-[#1a73e8] transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a73e8]"></div>
                          <p className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Uploading...</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Drag and drop an image or click to browse</p>
                          <p className="text-xs text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>PNG, JPG up to 5MB</p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Preview */}
              <div className="lg:sticky lg:top-4 h-fit">
                <div className="bg-[#ECE5DD] rounded-lg p-4">
                  <h3 className="text-sm font-medium text-slate-700 mb-3" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Preview</h3>
                  <div className="bg-white rounded-lg shadow-lg p-4 max-w-sm mx-auto">
                    {/* WhatsApp Message Bubble */}
                    <div className="bg-white rounded-lg shadow-sm p-0 overflow-hidden">
                      {/* Header Image */}
                      {headerImageUrl ? (
                        <div className="relative w-full h-32 bg-slate-200">
                          <Image
                            src={headerImageUrl}
                            alt="Template header"
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-full h-32 bg-slate-200 flex items-center justify-center">
                          <span className="text-xs text-slate-400" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Header image preview</span>
                        </div>
                      )}
                      
                      {/* Message Content */}
                      <div className="p-3 space-y-2">
                        <p className="text-sm text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          Hi {customerName || 'Customer'} 👋
                        </p>
                        <p className="text-sm text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          Thanks again for choosing {customBusinessName || businessName || 'Business'}. Hope you're happy with everything!
                        </p>
                        <p className="text-sm text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          If you have a minute, we'd really appreciate a quick Google review. It helps us a lot 🙏
                        </p>
                        <p className="text-sm text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          If anything wasn't great, just call us on {customBusinessPhone || businessPhone || 'XXX XXX XXXX'} and we'll sort it out right away.
                        </p>
                        
                        {/* Review Button */}
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <button className="w-full px-3 py-2 text-sm text-[#1a73e8] border border-[#1a73e8] rounded-md flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Leave a Review
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Email review requests are coming soon.</p>
            </div>
          )}

          {/* Footer */}
          {activeChannel === 'whatsapp' && (
            <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={handleSend}
                disabled={sending || !customerName.trim() || !whatsappNumber.trim() || !headerImageUrl}
                className="px-6 py-3 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                {sending ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <SendIcon sx={{ fontSize: 18 }} />
                    <span>Send on WhatsApp</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-start">
          <button
            type="button"
            onClick={handleContinue}
            className="px-6 py-3 rounded-lg bg-[#1565B4] text-white text-sm font-medium hover:bg-[#0d47a1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-roboto-stack)' }}
          >
            Continue to dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
