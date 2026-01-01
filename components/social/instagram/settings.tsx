'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/lib/supabase/database.types'
import SettingsIcon from '@mui/icons-material/Settings'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import { Button } from '@/components/ui/button'

// Instagram connection type (table may not be in generated types yet)
type InstagramConnection = {
  id: string
  business_location_id: string
  access_token: string
  instagram_user_id: string
  instagram_username: string | null
  scopes: string[] | null
  token_expires_at: string | null
  created_at: string
  updated_at: string
} | null

interface InstagramSettingsProps {
  locationId: string
  instagramConnection: InstagramConnection | null
}

export function InstagramSettings({ locationId, instagramConnection }: InstagramSettingsProps) {
  const [copied, setCopied] = useState(false)
  const [syncState, setSyncState] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const redirectUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://app.antistatic.ai'}/api/integrations/instagram/callback`

  useEffect(() => {
    const fetchSyncState = async () => {
      try {
        const response = await fetch(`/api/social/instagram/profile?locationId=${locationId}`)
        if (response.ok) {
          const data = await response.json()
          setSyncState(data)
        }
      } catch (error) {
        console.error('Error fetching sync state:', error)
      } finally {
        setLoading(false)
      }
    }

    if (instagramConnection) {
      fetchSyncState()
    }
  }, [locationId, instagramConnection])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSync = async () => {
    try {
      const response = await fetch('/api/social/instagram/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      })
      const result = await response.json()
      if (result.success) {
        alert('Sync completed successfully!')
        window.location.reload()
      } else {
        alert(`Sync failed: ${result.error || 'Unknown error'}`)
      }
    } catch (error: any) {
      alert(`Sync failed: ${error.message}`)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Instagram? This will remove all connection data.')) {
      return
    }

    try {
      const response = await fetch(`/api/social/instagram/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      })

      if (response.ok) {
        window.location.reload()
      } else {
        alert('Failed to disconnect. Please try again.')
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
      alert('Failed to disconnect. Please try again.')
    }
  }

  if (!instagramConnection) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-600">Instagram account not connected</p>
      </div>
    )
  }

  const scopes = syncState?.grantedScopes || instagramConnection?.scopes || []
  const grantedScopesList = (syncState?.granted_scopes_list as string[]) || []
  const missingScopesList = (syncState?.missing_scopes_list as string[]) || []
  const requiredScopes = [
    'instagram_business_basic',
    'instagram_business_manage_insights',
    'instagram_manage_comments',
    'instagram_business_manage_comments',
    'instagram_business_manage_messages',
    'instagram_business_content_publish',
  ]

  return (
    <div className="space-y-6">
      {/* Connection Info */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <SettingsIcon sx={{ fontSize: 24 }} />
          Connection Settings
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Connected Account
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-900">@{instagramConnection.instagram_username || 'Unknown'}</span>
              <span className="text-slate-500">({instagramConnection.instagram_user_id})</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              OAuth Redirect URL
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm text-slate-700">
                {redirectUrl}
              </code>
              <button
                onClick={() => copyToClipboard(redirectUrl)}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                title="Copy to clipboard"
              >
                <ContentCopyIcon sx={{ fontSize: 18 }} />
              </button>
            </div>
            {copied && (
              <p className="text-xs text-green-600 mt-1">Copied to clipboard!</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Last Synced
            </label>
            <p className="text-slate-600 text-sm">
              {syncState?.lastSync
                ? new Date(syncState.lastSync).toLocaleString()
                : 'Never synced'}
            </p>
            {syncState?.lastError && (
              <p className="text-red-600 text-xs mt-1">
                Last error: {syncState.lastError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Permissions Status */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Permissions Status</h3>
        
        {grantedScopesList.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Granted Scopes:</p>
            <div className="space-y-1">
              {grantedScopesList.map((scope) => (
                <div key={scope} className="flex items-center gap-2 p-2 bg-green-50 rounded">
                  <CheckCircleIcon sx={{ fontSize: 16 }} className="text-green-600" />
                  <span className="text-sm font-mono text-green-800">{scope}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {missingScopesList.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Missing Scopes:</p>
            <div className="space-y-1">
              {missingScopesList.map((scope) => (
                <div key={scope} className="flex items-center gap-2 p-2 bg-yellow-50 rounded">
                  <WarningIcon sx={{ fontSize: 16 }} className="text-yellow-600" />
                  <span className="text-sm font-mono text-yellow-800">{scope}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {requiredScopes.map((scope) => {
            const hasScope = scopes.some((s: string) => s.includes(scope))
            return (
              <div key={scope} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm font-mono text-slate-700">{scope}</span>
                {hasScope ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircleIcon sx={{ fontSize: 18 }} />
                    <span className="text-xs">Granted</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-yellow-600">
                    <WarningIcon sx={{ fontSize: 18 }} />
                    <span className="text-xs">Missing</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Diagnostics */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Diagnostics</h3>
        <div className="space-y-3">
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm font-medium text-slate-700 mb-1">Connection Status</p>
            <p className="text-sm text-slate-600">
              {instagramConnection.access_token ? 'Token present' : 'No token found'}
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm font-medium text-slate-700 mb-1">Token Expiry</p>
            <p className="text-sm text-slate-600">
              {instagramConnection.token_expires_at
                ? new Date(instagramConnection.token_expires_at).toLocaleString()
                : 'No expiry set'}
            </p>
          </div>
          {syncState?.lastError && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-800 mb-1">Last Sync Error</p>
              <p className="text-sm text-yellow-700">{syncState.lastError}</p>
            </div>
          )}
          <div className="pt-2">
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={loading}
            >
              Run Sync Now
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-lg border border-red-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-red-900 mb-4">Danger Zone</h3>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Disconnecting will remove all Instagram connection data and revoke access tokens.
          </p>
          <Button
            variant="outline"
            onClick={handleDisconnect}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            <DeleteIcon sx={{ fontSize: 16 }} className="mr-1" />
            Disconnect & Delete Data
          </Button>
        </div>
      </div>
    </div>
  )
}

