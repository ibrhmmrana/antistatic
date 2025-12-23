'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { Business as BusinessIcon, Star as StarIcon, LocationOn as LocationOnIcon, Phone as PhoneIcon, Language as LanguageIcon, Store as StoreIcon, ArrowBack as ArrowBackIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material'
import { Database } from '@/lib/supabase/database.types'

type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
type BusinessLocationInsert = Database['public']['Tables']['business_locations']['Insert']

interface Suggestion {
  place_id: string
  primaryText: string
  secondaryText: string
}

interface BusinessPreview {
  name: string
  formatted_address: string | null
  phone_number: string | null
  website: string | null
  rating: number | null
  review_count: number | null
  category: string | null
  categories: string[]
  open_now: boolean | null
  photo_url: string | null
  photo_urls: string[] // All photo URLs
  lat: number | null
  lng: number | null
  photo_reference: string | null
}

interface BusinessSearchProps {
  userName?: string
}

const COMMON_INDUSTRIES = [
  'Accounting',
  'Advertising',
  'Agriculture',
  'Architecture',
  'Automotive',
  'Beauty & Personal Care',
  'Construction',
  'Consulting',
  'Education',
  'Entertainment',
  'Finance',
  'Food & Beverage',
  'Healthcare',
  'Hospitality',
  'Legal Services',
  'Manufacturing',
  'Marketing',
  'Real Estate',
  'Retail',
  'Technology',
  'Transportation',
  'Travel & Tourism',
  'Wholesale',
]

export function BusinessSearch({ userName = 'there' }: BusinessSearchProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null)
  const [businessPreview, setBusinessPreview] = useState<BusinessPreview | null>(null)
  const [locationRange, setLocationRange] = useState<string>('')
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [customKeyword, setCustomKeyword] = useState('')
  const [showIndustryDropdown, setShowIndustryDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [goingBack, setGoingBack] = useState(false)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const [imagesPreloaded, setImagesPreloaded] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const customKeywordInputRef = useRef<HTMLInputElement>(null)
  const industryDropdownRef = useRef<HTMLDivElement>(null)

  // Restore data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('onboarding_business_data')
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        if (parsed.query) setQuery(parsed.query)
        if (parsed.selectedSuggestion) setSelectedSuggestion(parsed.selectedSuggestion)
        if (parsed.businessPreview) setBusinessPreview(parsed.businessPreview)
        if (parsed.locationRange) setLocationRange(parsed.locationRange)
        if (parsed.selectedIndustries) setSelectedIndustries(parsed.selectedIndustries)
        if (parsed.customKeyword) setCustomKeyword(parsed.customKeyword)
      } catch (err) {
        console.error('Failed to restore saved data:', err)
      }
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (industryDropdownRef.current && !industryDropdownRef.current.contains(event.target as Node)) {
        setShowIndustryDropdown(false)
      }
    }

    if (showIndustryDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showIndustryDropdown])

  // Save data to localStorage whenever it changes
  useEffect(() => {
    const dataToSave = {
      query,
      selectedSuggestion,
      businessPreview,
      locationRange,
      selectedIndustries,
      customKeyword,
    }
    localStorage.setItem('onboarding_business_data', JSON.stringify(dataToSave))
  }, [query, selectedSuggestion, businessPreview, locationRange, selectedIndustries, customKeyword])

  // Debounce autocomplete
  useEffect(() => {
    // Don't show suggestions if a business is already selected
    if (selectedSuggestion) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    if (!query.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places/autocomplete?query=${encodeURIComponent(query)}`)
        const data = await response.json()

        if (data.error) {
          setError(data.error)
          return
        }

        setSuggestions(data.suggestions || [])
        setShowSuggestions(true)
        setError(null)
      } catch (err: any) {
        setError('Failed to fetch suggestions')
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, selectedSuggestion])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Preload images function
  const preloadImages = (urls: string[]) => {
    if (urls.length === 0) {
      setImagesPreloaded(true)
      return
    }

    let loadedCount = 0
    const totalImages = urls.length

    urls.forEach((url) => {
      const img = new Image()
      img.onload = () => {
        loadedCount++
        if (loadedCount === totalImages) {
          setImagesPreloaded(true)
        }
      }
      img.onerror = () => {
        loadedCount++
        if (loadedCount === totalImages) {
          setImagesPreloaded(true)
        }
      }
      // Start loading immediately
      img.src = url
    })
  }

  const handleSuggestionClick = async (suggestion: Suggestion) => {
    setSelectedSuggestion(suggestion)
    setQuery(suggestion.primaryText)
    setShowSuggestions(false)
    setBusinessPreview(null)
    setSelectedIndustries([]) // Clear selected industries when new business is selected
    setCustomKeyword('') // Clear custom keyword
    setCurrentPhotoIndex(0) // Reset photo index
    setLoadingPreview(true)
    setError(null)

    try {
      // Fetch place details for preview
      const detailsResponse = await fetch(
        `/api/places/details?place_id=${suggestion.place_id}`
      )
      const detailsData = await detailsResponse.json()

      if (detailsData.error) {
        throw new Error(detailsData.error)
      }

      const details = detailsData.details
      
      // Use photo URLs from API if available, otherwise fallback to static map
      let photoUrls: string[] = details.photoUrls || []
      let photoUrl = details.photoUrl || null
      
      if (photoUrls.length === 0 && details.lat && details.lng) {
        // Fallback to static map if no photos
        photoUrl = `/api/places/staticmap?lat=${details.lat}&lng=${details.lng}`
        photoUrls = [photoUrl] // Add static map as the only photo
      }
      
      setBusinessPreview({
        name: details.name,
        formatted_address: details.formatted_address,
        phone_number: details.phone_number,
        website: details.website,
        rating: details.rating,
        review_count: details.review_count,
        category: details.category,
        categories: details.categories || [],
        open_now: details.open_now,
        photo_url: photoUrl,
        photo_urls: photoUrls,
        lat: details.lat,
        lng: details.lng,
        photo_reference: details.photos?.[0] || null,
      })
      
      // Reset photo index when new business is selected
      setCurrentPhotoIndex(0)
      setImagesPreloaded(false)
      
      // Preload all images in the background
      if (photoUrls.length > 0) {
        preloadImages(photoUrls)
      }
    } catch (err: any) {
      console.error('Failed to load preview:', err)
      // Don't show error for preview, just continue
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleContinue = async () => {
    if (!selectedSuggestion) return

    // Validate: If industry selection is shown (0 or 1 categories), require at least one selection
    if (businessPreview && businessPreview.categories && businessPreview.categories.length <= 1) {
      const hasIndustrySelection = selectedIndustries.length > 0
      const hasCustomKeyword = customKeyword.trim().length > 0
      
      if (!hasIndustrySelection && !hasCustomKeyword) {
        setError('Please select at least one industry or enter a custom keyword')
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch place details
      const detailsResponse = await fetch(
        `/api/places/details?place_id=${selectedSuggestion.place_id}`
      )
      const detailsData = await detailsResponse.json()

      if (detailsData.error) {
        throw new Error(detailsData.error)
      }

      const details = detailsData.details

      // Get current user
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('User not authenticated')
      }

      // Ensure profile exists before creating business location
      // This fixes the foreign key constraint violation
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!existingProfile) {
        // Create profile if it doesn't exist
        const profileData: ProfileInsert = {
          id: user.id,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || null,
          onboarding_completed: false,
        }
        const { error: profileError } = await supabase.from('profiles').insert(profileData as any)

        if (profileError) {
          // If profile creation fails (e.g., unique violation), that's OK - it might have been created concurrently
          // But if it's a different error, throw it
          if (profileError.code !== '23505') {
            throw new Error(`Failed to create user profile: ${profileError.message}`)
          }
        }
      }

      // Create business location
      // Combine user-selected industries with Places categories
      const placesCategories = details.categories || []
      const allUserSelections = [...selectedIndustries]
      
      // Add custom keyword if provided
      if (customKeyword.trim()) {
        allUserSelections.push(customKeyword.trim())
      }
      
      // Combine all categories: User selections first, then Places categories
      const allCategories = [...allUserSelections, ...placesCategories]
      const categoryString = allCategories.length > 0 
        ? allCategories.join(', ') 
        : null
      
      const locationData: BusinessLocationInsert = {
        user_id: user.id,
        place_id: details.place_id,
        name: details.name,
        formatted_address: details.formatted_address,
        phone_number: details.phone_number,
        website: details.website,
        rating: details.rating,
        review_count: details.review_count,
        category: categoryString, // Store all categories as comma-separated string
        categories: allCategories, // Also store as array for structured access
        lat: details.lat,
        lng: details.lng,
        open_now: details.open_now,
        photos: details.photos,
        location_range: locationRange || null,
      }
      const { data: location, error: insertError } = await supabase
        .from('business_locations')
        .insert(locationData as any)
        .select()
        .single()

      if (insertError) {
        throw insertError
      }

      // Redirect to connect channels page
      router.push('/onboarding/connect')
    } catch (err: any) {
      setError(err.message || 'Failed to save business location')
      setLoading(false)
    }
  }

  const handleBack = () => {
    setGoingBack(true)
    // Use browser back navigation to go to previous page
    if (window.history.length > 1) {
      router.back()
    } else {
      // Fallback to dashboard if no history
      router.push('/dashboard')
    }
  }

  return (
    <div className="onboarding-page">
      <button
        onClick={handleBack}
        disabled={goingBack}
        className="flex items-center gap-2 text-[var(--google-grey-600)] hover:text-[var(--google-grey-900)] mb-6 transition-all duration-150 active:scale-95 active:opacity-70 disabled:opacity-70 disabled:cursor-not-allowed"
        style={{ fontFamily: 'var(--font-roboto-stack)' }}
      >
        <ArrowBackIcon sx={{ fontSize: 20 }} />
        <span className="text-sm font-medium">{goingBack ? 'Going back...' : 'Back'}</span>
      </button>
      <h1 className="text-2xl lg:text-3xl font-medium mb-8 text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
        Hi, {userName}! Let's get you set up on Antistatic
      </h1>

      <div className="bg-white rounded-lg shadow-sm border border-[var(--google-grey-200)] p-6 lg:p-8">
        <h2 className="text-base lg:text-lg font-normal mb-6 text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          What is the name of your business?
        </h2>

        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Your company name"
            value={query}
            onChange={(e) => {
              const newValue = e.target.value
              setQuery(newValue)
              // Clear selection if user types something different
              if (selectedSuggestion && newValue !== selectedSuggestion.primaryText) {
                setSelectedSuggestion(null)
                setBusinessPreview(null)
                setLocationRange('')
              }
            }}
            icon={<BusinessIcon sx={{ fontSize: 20 }} />}
            error={error || undefined}
          />

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && !selectedSuggestion && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-white border border-[var(--google-grey-300)] rounded-lg shadow-[var(--shadow-lg)] max-h-64 overflow-y-auto"
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.place_id}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full text-left px-4 py-3 hover:bg-[var(--google-grey-50)] transition-colors border-b border-[var(--google-grey-200)] last:border-b-0"
                >
                  <div className="font-medium text-[var(--google-grey-900)]">
                    {suggestion.primaryText}
                  </div>
                  {suggestion.secondaryText && (
                    <div className="text-sm text-[var(--google-grey-600)] mt-0.5">
                      {suggestion.secondaryText}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Business Preview */}
        {(businessPreview || loadingPreview) && (
          <div className="mt-6 bg-[var(--google-grey-50)] rounded-lg border border-[var(--google-grey-200)] p-4 w-fit self-start">
              {loadingPreview ? (
                <div className="text-center py-4 text-[var(--google-grey-600)]">
                  Loading preview...
                </div>
              ) : businessPreview ? (
                <div className="space-y-3 w-96">
                  {/* Photo and Name */}
                  {businessPreview.photo_urls && businessPreview.photo_urls.length > 0 && (
                    <div className="relative w-full aspect-[16/10] rounded-lg overflow-hidden bg-[var(--google-grey-200)] group">
                      {/* Preload all images in hidden elements for instant switching */}
                      <div className="hidden">
                        {businessPreview.photo_urls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`${businessPreview.name} - Photo ${idx + 1}`}
                            loading="eager"
                            onError={(e) => {
                              // Fallback to static map if photo fails
                              const target = e.target as HTMLImageElement
                              if (businessPreview.lat && businessPreview.lng && !url.includes('staticmap')) {
                                target.src = `/api/places/staticmap?lat=${businessPreview.lat}&lng=${businessPreview.lng}`
                              }
                            }}
                          />
                        ))}
                      </div>
                      
                      {/* Visible image */}
                      <img
                        src={businessPreview.photo_urls[currentPhotoIndex]}
                        alt={businessPreview.name}
                        className="w-full h-full object-cover transition-opacity duration-200"
                        loading="eager"
                        onError={(e) => {
                          // Fallback to static map if photo fails
                          const target = e.target as HTMLImageElement
                          if (businessPreview.lat && businessPreview.lng && !businessPreview.photo_urls[currentPhotoIndex]?.includes('staticmap')) {
                            target.src = `/api/places/staticmap?lat=${businessPreview.lat}&lng=${businessPreview.lng}`
                          } else {
                            target.style.display = 'none'
                          }
                        }}
                      />
                      
                      {/* Navigation Arrows - Only show if more than 1 photo */}
                      {businessPreview.photo_urls.length > 1 && (
                        <>
                          {/* Previous Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setCurrentPhotoIndex((prev) => 
                                prev === 0 ? businessPreview.photo_urls.length - 1 : prev - 1
                              )
                            }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/50"
                            aria-label="Previous photo"
                          >
                            <ChevronLeftIcon sx={{ fontSize: 24 }} />
                          </button>
                          
                          {/* Next Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setCurrentPhotoIndex((prev) => 
                                prev === businessPreview.photo_urls.length - 1 ? 0 : prev + 1
                              )
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/50"
                            aria-label="Next photo"
                          >
                            <ChevronRightIcon sx={{ fontSize: 24 }} />
                          </button>
                          
                          {/* Photo Counter */}
                          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {currentPhotoIndex + 1} / {businessPreview.photo_urls.length}
                          </div>
                        </>
                      )}
                      
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                        <h3 className="text-white font-semibold text-lg break-words">{businessPreview.name}</h3>
                        {businessPreview.rating && (
                          <div className="flex items-center gap-1 text-white text-sm mt-1">
                            <StarIcon sx={{ fontSize: 16, color: '#fbbf24' }} />
                            <span>{businessPreview.rating.toFixed(1)}</span>
                            {businessPreview.review_count && (
                              <span className="opacity-90">({businessPreview.review_count})</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Details */}
                  <div className="space-y-1.5 w-full">
                    {!businessPreview.photo_url && (
                      <h3 className="font-semibold text-[var(--google-grey-900)] break-words">{businessPreview.name}</h3>
                    )}
                    
                    {businessPreview.formatted_address && (
                      <div className="flex items-start gap-2 text-sm">
                        <LocationOnIcon sx={{ fontSize: 18, color: 'var(--google-grey-500)', mt: 0.5, flexShrink: 0 }} />
                        <span className="text-[var(--google-grey-700)] break-words">{businessPreview.formatted_address}</span>
                      </div>
                    )}

                    {businessPreview.phone_number && (
                      <div className="flex items-center gap-2 text-sm">
                        <PhoneIcon sx={{ fontSize: 18, color: 'var(--google-grey-500)' }} />
                        <span className="text-[var(--google-grey-700)] break-words">{businessPreview.phone_number}</span>
                      </div>
                    )}

                    {businessPreview.website && (
                      <div className="flex items-start gap-2 text-sm">
                        <LanguageIcon sx={{ fontSize: 18, color: 'var(--google-grey-500)', mt: 0.5, flexShrink: 0 }} />
                        <a
                          href={businessPreview.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1565B4] hover:underline break-words break-all"
                        >
                          {businessPreview.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {businessPreview.open_now !== null && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                            businessPreview.open_now
                              ? 'bg-green-50 text-green-700'
                              : 'bg-[var(--google-grey-100)] text-[var(--google-grey-700)]'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              businessPreview.open_now ? 'bg-green-500' : 'bg-[var(--google-grey-400)]'
                            }`}
                          ></span>
                          {businessPreview.open_now ? 'Open now' : 'Closed'}
                        </span>
                      )}
                      {businessPreview.categories && businessPreview.categories.length > 0 && (
                        <>
                          {businessPreview.categories.slice(0, 3).map((category, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-[var(--google-grey-100)] text-[var(--google-grey-700)]"
                            >
                              {category}
                            </span>
                          ))}
                          {businessPreview.categories.length > 3 && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-[var(--google-grey-100)] text-[var(--google-grey-700)]">
                              +{businessPreview.categories.length - 3}
                            </span>
                          )}
                        </>
                      )}
                      {businessPreview.rating && (!businessPreview.photo_urls || businessPreview.photo_urls.length === 0) && (
                        <div className="flex items-center gap-1 text-sm">
                          <StarIcon sx={{ fontSize: 16, color: '#fbbf24' }} />
                          <span className="font-medium text-[var(--google-grey-900)]">
                            {businessPreview.rating.toFixed(1)}
                          </span>
                          {businessPreview.review_count && (
                            <span className="text-[var(--google-grey-600)]">
                              ({businessPreview.review_count})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
          </div>
        )}

        {/* Industry Selection - Only show if 0 or 1 categories from Places */}
        {businessPreview && businessPreview.categories && businessPreview.categories.length <= 1 && (
          <div className="mt-6">
            <label className="block text-sm font-medium text-[var(--google-grey-700)] mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Which industry is your business in?
            </label>
            <div className="mt-4">
              <label className="block text-sm font-medium text-[var(--google-grey-700)] mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                Add a custom keyword <span className="text-[var(--google-grey-500)] font-normal">(or select from the list below)</span>
              </label>
              <Input
                ref={customKeywordInputRef}
                type="text"
                value={customKeyword}
                onChange={(e) => setCustomKeyword(e.target.value)}
                placeholder="e.g., Consulting, Marketing, etc."
                className="w-full"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customKeyword.trim()) {
                    e.preventDefault()
                    if (!selectedIndustries.includes(customKeyword.trim())) {
                      setSelectedIndustries((prev) => [...prev, customKeyword.trim()])
                      setCustomKeyword('')
                    }
                  }
                }}
              />
              {customKeyword.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedIndustries.includes(customKeyword.trim())) {
                      setSelectedIndustries((prev) => [...prev, customKeyword.trim()])
                      setCustomKeyword('')
                    }
                  }}
                  className="mt-2 text-sm text-[#1565B4] hover:underline"
                  style={{ fontFamily: 'var(--font-roboto-stack)' }}
                >
                  Add "{customKeyword.trim()}"
                </button>
              )}
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-[var(--google-grey-700)] mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                Or select from common industries
              </label>
              <div className="relative" ref={industryDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowIndustryDropdown(!showIndustryDropdown)}
                  className="w-full px-4 py-2.5 rounded-lg border transition-all duration-200
                    border-[var(--google-grey-300)] 
                    hover:border-[var(--google-grey-400)] 
                    focus:border-[var(--google-blue)] focus:ring-2 focus:ring-[var(--google-blue)] focus:ring-offset-0
                    focus:outline-none 
                    bg-white
                    shadow-sm hover:shadow-[var(--shadow-sm)]
                    text-left flex items-center justify-between"
                  style={{ 
                    fontFamily: 'var(--font-roboto-stack)',
                    fontSize: '14px',
                    lineHeight: '20px'
                  }}
                >
                  <span className={selectedIndustries.length > 0 ? 'text-[var(--google-grey-900)]' : 'text-[var(--google-grey-500)]'}>
                    {selectedIndustries.length > 0 
                      ? `${selectedIndustries.length} ${selectedIndustries.length === 1 ? 'industry' : 'industries'} selected`
                      : 'Select industries...'}
                  </span>
                  <svg 
                    className={`w-5 h-5 text-[var(--google-grey-500)] transition-transform ${showIndustryDropdown ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showIndustryDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-[var(--google-grey-300)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2">
                      {COMMON_INDUSTRIES.map((industry) => (
                        <label
                          key={industry}
                          className="flex items-center px-3 py-2 hover:bg-[var(--google-grey-50)] rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIndustries.includes(industry)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIndustries((prev) => [...prev, industry])
                              } else {
                                setSelectedIndustries((prev) => prev.filter((i) => i !== industry))
                              }
                            }}
                            className="w-4 h-4 text-[#1565B4] border-[var(--google-grey-300)] rounded focus:ring-[#1565B4] focus:ring-2"
                          />
                          <span className="ml-3 text-sm text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                            {industry}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {selectedIndustries.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-[var(--google-grey-600)] mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  Selected industries:
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedIndustries.map((industry, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-[#EDF5FD] text-[#1565B4] border border-[#1565B4]"
                      style={{ fontFamily: 'var(--font-roboto-stack)' }}
                    >
                      {industry}
                      <button
                        type="button"
                        onClick={() => setSelectedIndustries((prev) => prev.filter((i) => i !== industry))}
                        className="ml-1 hover:text-[#0d47a1]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Number of Locations Field - Only show after preview loads */}
        {businessPreview && (
          <div className="mt-6">
            <label className="block text-sm font-medium text-[var(--google-grey-700)] mb-1.5" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              How many locations do you have?
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--google-grey-500)] pointer-events-none flex items-center justify-center z-10" style={{ fontSize: '20px', width: '20px', height: '20px' }}>
                <StoreIcon sx={{ fontSize: 20 }} />
              </div>
              <select
                value={locationRange}
                onChange={(e) => setLocationRange(e.target.value)}
                required
                className={`w-full px-4 py-2.5 pl-10 pr-10 rounded-lg border transition-all duration-200
                  border-[var(--google-grey-300)] 
                  hover:border-[var(--google-grey-400)] 
                  focus:border-[var(--google-blue)] focus:ring-2 focus:ring-[var(--google-blue)] focus:ring-offset-0
                  focus:outline-none 
                  bg-white
                  appearance-none cursor-pointer
                  shadow-sm hover:shadow-[var(--shadow-sm)]
                  disabled:bg-[var(--google-grey-50)] disabled:text-[var(--google-grey-500)] disabled:cursor-not-allowed
                  disabled:border-[var(--google-grey-200)]
                  ${locationRange ? 'text-[var(--google-grey-900)]' : 'text-[var(--google-grey-500)]'}`}
                style={{ 
                  fontFamily: 'var(--font-roboto-stack)',
                  fontSize: '14px',
                  lineHeight: '20px'
                }}
              >
                <option value="" disabled className="text-[var(--google-grey-500)]">Select range</option>
                <option value="1" className="text-[var(--google-grey-900)]">1 location</option>
                <option value="2-5" className="text-[var(--google-grey-900)]">2-5 locations</option>
                <option value="6-10" className="text-[var(--google-grey-900)]">6-10 locations</option>
                <option value="11-20" className="text-[var(--google-grey-900)]">11-20 locations</option>
                <option value="21-50" className="text-[var(--google-grey-900)]">21-50 locations</option>
                <option value="51-100" className="text-[var(--google-grey-900)]">51-100 locations</option>
                <option value="100+" className="text-[var(--google-grey-900)]">100+ locations</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                <svg 
                  className="w-5 h-5 text-[var(--google-grey-500)] transition-colors duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  style={{ strokeWidth: 2.5 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Button
            variant="primary"
            size="md"
            onClick={handleContinue}
            disabled={!selectedSuggestion || !locationRange || loading}
          >
            {loading ? 'Loading...' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  )
}

