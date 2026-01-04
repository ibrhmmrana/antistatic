'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/components/ui/toast'

interface Topic {
  title: string
  reason: string
  pillar: 'proof' | 'offer' | 'education' | 'culture' | 'local'
}

interface GeneratedCaption {
  topic: string
  caption: string
  hashtags: string[]
  imageSuggestions: string[]
  cta: {
    type: 'call' | 'whatsapp' | 'book' | 'visit' | 'directions' | 'website' | 'none'
    text: string
  }
}

interface AiPostIdeasDrawerProps {
  open: boolean
  onClose: () => void
  businessLocationId: string
  platform: 'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok' | null
  selectedChannels?: Array<'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok'>
  onInsert: (caption: string) => void
  connectedChannels?: Array<{ platform: string; connected: boolean }>
}

export function AiPostIdeasDrawer({
  open,
  onClose,
  businessLocationId,
  platform,
  selectedChannels = [],
  onInsert,
  connectedChannels = [],
}: AiPostIdeasDrawerProps) {
  const { showToast } = useToast()
  const [topics, setTopics] = useState<Topic[]>([])
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)
  const [generatedCaption, setGeneratedCaption] = useState<GeneratedCaption | null>(null)
  const [displayedCaption, setDisplayedCaption] = useState('')
  const [isAnimating, setIsAnimating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [includeEmojis, setIncludeEmojis] = useState(true)
  const [includeHashtags, setIncludeHashtags] = useState(true)
  const [includeImageSuggestions, setIncludeImageSuggestions] = useState(false)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch topics when drawer opens
  useEffect(() => {
    if (open && topics.length === 0 && !loadingTopics) {
      fetchTopics()
    }
  }, [open])

  // Reset state when drawer closes
  useEffect(() => {
    if (!open) {
      setSelectedTopic(null)
      setGeneratedCaption(null)
      setDisplayedCaption('')
      setIsAnimating(false)
      setCustomPrompt('')
      // Clear any pending animation
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
      // Keep topics and toggles state for better UX
    }
  }, [open])

  // Typewriter animation effect
  useEffect(() => {
    if (!generatedCaption || generating) {
      setDisplayedCaption('')
      setIsAnimating(false)
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
      return
    }

    const fullText = generatedCaption.caption
    if (fullText === displayedCaption) {
      setIsAnimating(false)
      return
    }

    setIsAnimating(true)
    setDisplayedCaption('')

    let currentIndex = 0
    const speed = 15 // milliseconds per character (fast but readable)

    const animate = () => {
      if (currentIndex < fullText.length) {
        setDisplayedCaption(fullText.slice(0, currentIndex + 1))
        currentIndex++
        animationTimeoutRef.current = setTimeout(animate, speed)
      } else {
        setIsAnimating(false)
        animationTimeoutRef.current = null
      }
    }

    // Start animation after a tiny delay to ensure state is ready
    animationTimeoutRef.current = setTimeout(animate, 10)

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
        animationTimeoutRef.current = null
      }
    }
  }, [generatedCaption, generating])

  const fetchTopics = async () => {
    if (!businessLocationId) {
      showToast('Business location not found', 'error')
      return
    }

    setLoadingTopics(true)
    try {
      const response = await fetch('/api/social-studio/ai/post-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessLocationId,
          platform,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch topics')
      }

      const data = await response.json()
      setTopics(data.topics || [])
    } catch (error: any) {
      console.error('Error fetching topics:', error)
      showToast(error.message || 'Failed to load topics', 'error')
      // Set fallback topics
      setTopics([
        {
          title: 'Share a customer success story',
          reason: 'Highlight positive customer experiences',
          pillar: 'proof',
        },
        {
          title: 'Behind the scenes content',
          reason: 'Show the human side of your business',
          pillar: 'culture',
        },
        {
          title: 'Tips and helpful information',
          reason: 'Educate your audience about your services',
          pillar: 'education',
        },
      ])
    } finally {
      setLoadingTopics(false)
    }
  }

  const handleTopicSelect = async (topic: Topic) => {
    if (!businessLocationId) {
      showToast('Business location not found', 'error')
      return
    }

    setSelectedTopic(topic)
    setGenerating(true)
    setGeneratedCaption(null)

    try {
      const response = await fetch('/api/social-studio/ai/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessLocationId,
          platform,
          topic: topic.title,
          includeEmojis,
          includeHashtags,
          includeImageSuggestions,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate caption')
      }

      const data = await response.json()
      setGeneratedCaption(data)
      setDisplayedCaption('') // Reset displayed text for animation
    } catch (error: any) {
      console.error('Error generating caption:', error)
      showToast(error.message || 'Failed to generate caption', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleCustomPrompt = async () => {
    if (!customPrompt.trim()) return

    if (!businessLocationId) {
      showToast('Business location not found', 'error')
      return
    }

    setGenerating(true)
    setGeneratedCaption(null)
    setSelectedTopic(null)

    try {
      const response = await fetch('/api/social-studio/ai/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessLocationId,
          platform,
          topic: customPrompt,
          includeEmojis,
          includeHashtags,
          includeImageSuggestions,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate caption')
      }

      const data = await response.json()
      setGeneratedCaption(data)
      setDisplayedCaption('') // Reset displayed text for animation
    } catch (error: any) {
      console.error('Error generating caption:', error)
      showToast(error.message || 'Failed to generate caption', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleRegenerate = async () => {
    if (selectedTopic) {
      await handleTopicSelect(selectedTopic)
    } else if (customPrompt) {
      await handleCustomPrompt()
    }
  }

  const handleGenerateForPlatform = async (targetPlatform: 'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok') => {
    if (!businessLocationId) {
      showToast('Business location not found', 'error')
      return
    }

    // Use the same topic/prompt that was used for the current caption
    const topicToUse = selectedTopic?.title || customPrompt || generatedCaption?.topic || ''
    if (!topicToUse) {
      showToast('No topic available to regenerate', 'error')
      return
    }

    setGenerating(true)
    setGeneratedCaption(null)
    setDisplayedCaption('')

    try {
      const response = await fetch('/api/social-studio/ai/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessLocationId,
          platform: targetPlatform,
          topic: topicToUse,
          includeEmojis,
          includeHashtags,
          includeImageSuggestions,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate caption')
      }

      const data = await response.json()
      setGeneratedCaption(data)
      setDisplayedCaption('') // Reset displayed text for animation
    } catch (error: any) {
      console.error('Error generating caption:', error)
      showToast(error.message || 'Failed to generate caption', 'error')
    } finally {
      setGenerating(false)
    }
  }

  // Get other selected channels (excluding current platform)
  const otherSelectedChannels = selectedChannels.filter(
    (ch) => ch !== platform && ch !== 'youtube'
  ) as Array<'instagram' | 'facebook' | 'google_business' | 'linkedin' | 'tiktok'>

  const getPlatformDisplayName = (p: string) => {
    if (p === 'google_business') return 'Google Business'
    return p.charAt(0).toUpperCase() + p.slice(1)
  }

  const handleInsert = () => {
    if (generatedCaption) {
      let fullText = generatedCaption.caption

      if (generatedCaption.hashtags.length > 0) {
        fullText += '\n\n' + generatedCaption.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')
      }

      if (generatedCaption.cta.type !== 'none' && generatedCaption.cta.text) {
        fullText += '\n\n' + generatedCaption.cta.text
      }

      onInsert(fullText)
      showToast('Caption inserted', 'success')
      onClose()
    }
  }

  const getPillarColor = (pillar: string) => {
    const colors: Record<string, string> = {
      proof: 'bg-blue-100 text-blue-700',
      offer: 'bg-green-100 text-green-700',
      education: 'bg-purple-100 text-purple-700',
      culture: 'bg-orange-100 text-orange-700',
      local: 'bg-pink-100 text-pink-700',
    }
    return colors[pillar] || 'bg-slate-100 text-slate-700'
  }

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-xl z-50 flex flex-col transform transition-transform">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Post ideas</h2>
              {platform ? (
                <p className="text-xs text-slate-500 mt-0.5">
                  For {platform === 'google_business' ? 'Google Business' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5">Multi-platform</p>
              )}
            </div>
          </div>
          <button
            onClick={handleInsert}
            disabled={!generatedCaption}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              generatedCaption
                ? 'bg-[#1a73e8] text-white hover:bg-[#1557b0]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            Insert
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Warning Banner for Disconnected Accounts */}
          {connectedChannels.length === 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-yellow-800">
                    <strong>Connect accounts to publish directly.</strong> You can still generate content and copy it manually.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Custom Prompt Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tell Antistatic what you want to create
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleCustomPrompt()
                  }
                }}
                placeholder="e.g., Share our new menu items"
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
              />
              <button
                onClick={handleCustomPrompt}
                disabled={!customPrompt.trim() || generating}
                className="px-4 py-2 bg-[#1a73e8] text-white rounded-lg hover:bg-[#1557b0] transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>

          {/* Suggested Topics */}
          {!generatedCaption && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Suggested topics</h3>
              {loadingTopics ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-4 animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-slate-100 rounded w-full"></div>
                    </div>
                  ))}
                </div>
              ) : topics.length > 0 ? (
                <div className="space-y-3">
                  {topics.map((topic, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleTopicSelect(topic)}
                      disabled={generating}
                      className={`w-full text-left border border-slate-200 rounded-lg p-4 hover:border-[#1a73e8] hover:bg-blue-50 transition-colors ${
                        generating ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium text-slate-900">{topic.title}</h4>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getPillarColor(topic.pillar)}`}>
                              {topic.pillar}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">{topic.reason}</p>
                        </div>
                        {generating && selectedTopic?.title === topic.title && (
                          <div className="w-5 h-5 border-2 border-[#1a73e8] border-t-transparent rounded-full animate-spin"></div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <p className="text-sm">No topics available. Try the custom prompt above.</p>
                </div>
              )}
            </div>
          )}

          {/* Generated Caption */}
          {generatedCaption && (
            <div className="space-y-4">
              {/* Toggles */}
              <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeEmojis}
                    onChange={(e) => setIncludeEmojis(e.target.checked)}
                    className="w-4 h-4 text-[#1a73e8] rounded focus:ring-[#1a73e8]"
                  />
                  <span className="text-sm text-slate-700">Include Emojis</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeHashtags}
                    onChange={(e) => setIncludeHashtags(e.target.checked)}
                    className="w-4 h-4 text-[#1a73e8] rounded focus:ring-[#1a73e8]"
                  />
                  <span className="text-sm text-slate-700">Hashtags</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeImageSuggestions}
                    onChange={(e) => setIncludeImageSuggestions(e.target.checked)}
                    className="w-4 h-4 text-[#1a73e8] rounded focus:ring-[#1a73e8]"
                  />
                  <span className="text-sm text-slate-700">Image suggestions</span>
                </label>
              </div>

              {/* Caption Card */}
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Generated caption</h3>
                  <button
                    onClick={handleRegenerate}
                    disabled={generating}
                    className="text-sm text-[#1a73e8] hover:text-[#1557b0] disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {generating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
                {generating ? (
                  <div className="py-8 text-center">
                    <div className="w-8 h-8 border-4 border-[#1a73e8] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-slate-600">Generating caption...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {displayedCaption}
                      {isAnimating && (
                        <span className="inline-block w-0.5 h-4 bg-[#1a73e8] ml-1 animate-pulse" />
                      )}
                    </p>
                    {generatedCaption.hashtags.length > 0 && (
                      <div className="pt-2 border-t border-slate-200">
                        <p className="text-xs text-slate-500 mb-1">Hashtags:</p>
                        <p className="text-sm text-slate-600">
                          {generatedCaption.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
                        </p>
                      </div>
                    )}
                    {generatedCaption.imageSuggestions.length > 0 && (
                      <div className="pt-2 border-t border-slate-200">
                        <p className="text-xs text-slate-500 mb-1">Image suggestions:</p>
                        <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                          {generatedCaption.imageSuggestions.map((suggestion, idx) => (
                            <li key={idx}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {generatedCaption.cta.type !== 'none' && (
                      <div className="pt-2 border-t border-slate-200">
                        <p className="text-xs text-slate-500 mb-1">Call to action:</p>
                        <p className="text-sm font-medium text-[#1a73e8]">{generatedCaption.cta.text}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Generate for other platforms */}
              {otherSelectedChannels.length > 0 && generatedCaption && !generating && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500 mb-3 text-slate-600">Generate for other platforms:</p>
                  <div className="flex flex-wrap gap-2">
                    {otherSelectedChannels.map((targetPlatform) => (
                      <button
                        key={targetPlatform}
                        onClick={() => handleGenerateForPlatform(targetPlatform)}
                        disabled={generating}
                        className="px-4 py-2 text-sm font-medium text-[#1a73e8] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Generate for {getPlatformDisplayName(targetPlatform)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

