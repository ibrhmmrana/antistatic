'use client'

import { useState } from 'react'

interface GenerateTabProps {
  businessLocationId: string
}

const templates = [
  {
    id: 'template1',
    name: 'Friendly Request',
    message: 'Hi {{name}}! We loved having you at {{business}}. Would you mind leaving us a quick review? It really helps us out! 🙏',
  },
  {
    id: 'template2',
    name: 'Professional Request',
    message: 'Hello {{name}}, thank you for choosing {{business}}. We\'d appreciate it if you could share your experience with a review. Your feedback helps us serve you better.',
  },
  {
    id: 'template3',
    name: 'Casual Request',
    message: 'Hey {{name}}! Hope you enjoyed your visit to {{business}}. Mind dropping us a review? We\'d love to hear your thoughts! 😊',
  },
]

export function GenerateTab({ businessLocationId }: GenerateTabProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0].id)
  const [reviewUrl, setReviewUrl] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [schedule, setSchedule] = useState<'now' | 'tomorrow' | 'custom'>('now')
  const [customDateTime, setCustomDateTime] = useState('')
  const [sending, setSending] = useState(false)

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate) || templates[0]
  const previewMessage = selectedTemplateData.message
    .replace('{{name}}', customerName || 'Customer')
    .replace('{{business}}', 'our business')

  const handleSend = async () => {
    if (!customerName || !customerPhone) {
      alert('Please enter customer name and phone number')
      return
    }

    setSending(true)
    try {
      const response = await fetch('/api/reputation/review-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessLocationId,
          customerName,
          customerPhone,
          templateId: selectedTemplate,
          reviewUrl,
          businessPhone,
          schedule,
          customDateTime: schedule === 'custom' ? customDateTime : undefined,
        }),
      })

      if (response.ok) {
        alert('Review request sent (stub)')
        setCustomerName('')
        setCustomerPhone('')
      }
    } catch (error) {
      console.error('[GenerateTab] Failed to send review request:', error)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="max-w-2xl space-y-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-google-sans)' }}>
          Send Review Request
        </h2>

        {/* Customer Info */}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Customer Name
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="John Doe"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Customer Phone (WhatsApp)
            </label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+1234567890"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
            />
          </div>

          {/* Template Selector */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Message Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          {/* Preview */}
          <div className="bg-slate-50 rounded-md p-4 border border-slate-200">
            <p className="text-xs text-slate-500 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Preview:
            </p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              {previewMessage}
            </p>
          </div>

          {/* Review URL */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Review URL (optional)
            </label>
            <input
              type="url"
              value={reviewUrl}
              onChange={(e) => setReviewUrl(e.target.value)}
              placeholder="https://g.page/r/..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
            />
          </div>

          {/* Business Phone */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Business Phone (for "Call business" link)
            </label>
            <input
              type="tel"
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
              placeholder="+1234567890"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Schedule
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="schedule"
                  value="now"
                  checked={schedule === 'now'}
                  onChange={() => setSchedule('now')}
                  className="w-4 h-4 text-[#1a73e8]"
                />
                <span className="text-sm text-slate-600">Send now</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="schedule"
                  value="tomorrow"
                  checked={schedule === 'tomorrow'}
                  onChange={() => setSchedule('tomorrow')}
                  className="w-4 h-4 text-[#1a73e8]"
                />
                <span className="text-sm text-slate-600">Tomorrow at 9:00 AM</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="schedule"
                  value="custom"
                  checked={schedule === 'custom'}
                  onChange={() => setSchedule('custom')}
                  className="w-4 h-4 text-[#1a73e8]"
                />
                <span className="text-sm text-slate-600">Custom date & time</span>
              </label>
              {schedule === 'custom' && (
                <input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  className="ml-6 px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
                />
              )}
            </div>
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={sending || !customerName || !customerPhone}
            className="w-full px-4 py-2 bg-[#1a73e8] text-white rounded-md hover:bg-[#1557b0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-google-sans)' }}
          >
            {sending ? 'Sending...' : 'Send Review Request'}
          </button>
        </div>
      </div>

      {/* Activity Feed (Mock) */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-google-sans)' }}>
          Recent Activity
        </h3>
        <div className="space-y-3 text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          <div className="flex items-center justify-between">
            <span>Sent to John Doe</span>
            <span className="text-xs text-slate-400">2 hours ago</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Delivered to Jane Smith</span>
            <span className="text-xs text-slate-400">5 hours ago</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Review link clicked by Mike Johnson</span>
            <span className="text-xs text-slate-400">1 day ago</span>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

