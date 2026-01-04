'use client'

import { useState } from 'react'
import { mockPosts, mockQueueItems } from '@/lib/social-studio/mock'
import { useToast, ToastContainer } from '@/components/ui/toast'
import Image from 'next/image'
import type { PostPillar } from '@/lib/social-studio/mock'

interface LibraryTabProps {
  businessLocationId: string
}

type LibraryType = 'templates' | 'media' | 'hashtag-sets' | 'brand-kit' | 'campaigns'

export function LibraryTab({ businessLocationId }: LibraryTabProps) {
  const { toasts, showToast, removeToast } = useToast()
  const [selectedType, setSelectedType] = useState<LibraryType>('templates')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedPillar, setSelectedPillar] = useState<PostPillar | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)

  const allTags = Array.from(new Set([...mockPosts.flatMap(p => p.tags), ...mockQueueItems.flatMap(q => q.tags)]))
  const allPillars: (PostPillar | 'all')[] = ['all', 'proof', 'offer', 'education', 'culture']

  const libraryItems = selectedType === 'templates' 
    ? [...mockPosts, ...mockQueueItems]
    : selectedType === 'media'
    ? mockPosts
    : selectedType === 'hashtag-sets'
    ? []
    : selectedType === 'brand-kit'
    ? []
    : []

  const filteredItems = libraryItems.filter(item => {
    if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    if (selectedTags.length > 0 && !selectedTags.some(tag => item.tags.includes(tag))) {
      return false
    }
    if (selectedPillar !== 'all' && 'pillar' in item && item.pillar !== selectedPillar) {
      return false
    }
    return true
  })

  const selectedItemData = filteredItems.find(item => item.id === selectedItem)

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleUseInPost = () => {
    showToast('Opening Create tab with selected item', 'info')
  }

  const handleDuplicate = () => {
    showToast('Item duplicated', 'success')
  }

  const handleEditTags = () => {
    showToast('Tag editor would open here', 'info')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Left: Filters */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm sticky top-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Filters</h3>

          {/* Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
            <div className="space-y-2">
              {(['templates', 'media', 'hashtag-sets', 'brand-kit', 'campaigns'] as LibraryType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`w-full text-left px-3 py-2 text-sm font-medium rounded transition-colors ${
                    selectedType === type
                      ? 'bg-[#1a73e8] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Pillar */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Pillar</label>
            <div className="flex flex-wrap gap-2">
              {allPillars.map((pillar) => (
                <button
                  key={pillar}
                  onClick={() => setSelectedPillar(pillar)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors capitalize ${
                    selectedPillar === pillar
                      ? 'bg-[#1a73e8] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {pillar}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Tags</label>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-[#1a73e8] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Middle: Grid/List */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <div className="mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search library..."
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
            />
          </div>
          {selectedType === 'hashtag-sets' && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Hashtag sets coming soon
            </div>
          )}
          {selectedType === 'brand-kit' && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Brand kit coming soon
            </div>
          )}
          {selectedType === 'campaigns' && (
            <div className="text-center py-8 text-slate-500 text-sm">
              Campaign bundles coming soon
            </div>
          )}
          {(selectedType === 'templates' || selectedType === 'media') && (
            <div className="grid grid-cols-2 gap-4">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item.id)}
                  className={`text-left border rounded-lg overflow-hidden transition-colors ${
                    selectedItem === item.id
                      ? 'border-[#1a73e8] ring-2 ring-blue-200'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="relative w-full h-32">
                    <Image
                      src={item.mediaUrl}
                      alt={item.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 50vw, 25vw"
                    />
                  </div>
                  <div className="p-3">
                    <h4 className="font-medium text-slate-900 text-sm mb-1 line-clamp-1">{item.title}</h4>
                    <div className="flex flex-wrap gap-1">
                      {'pillar' in item && item.pillar && (
                        <span className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-700 rounded capitalize">
                          {item.pillar}
                        </span>
                      )}
                      {item.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-700 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {filteredItems.length === 0 && (selectedType === 'templates' || selectedType === 'media') && (
            <div className="text-center py-8 text-slate-500 text-sm">
              No items found matching your filters
            </div>
          )}
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className="lg:col-span-1">
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm sticky top-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Details</h3>
          {selectedItemData ? (
            <div className="space-y-4">
              <div className="relative w-full h-48 rounded-lg overflow-hidden">
                <Image
                  src={selectedItemData.mediaUrl}
                  alt={selectedItemData.title}
                  fill
                  className="object-cover"
                  sizes="100%"
                />
              </div>
              <div>
                <h4 className="font-medium text-slate-900 mb-2">{selectedItemData.title}</h4>
                {'variants' in selectedItemData && selectedItemData.variants[0] && (
                  <p className="text-sm text-slate-600 mb-3">{selectedItemData.variants[0].caption}</p>
                )}
                {'caption' in selectedItemData && (
                  <p className="text-sm text-slate-600 mb-3">{selectedItemData.caption}</p>
                )}
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedItemData.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="space-y-2">
                  <button
                    onClick={handleUseInPost}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors"
                  >
                    Use in Post
                  </button>
                  <button
                    onClick={handleDuplicate}
                    className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={handleEditTags}
                    className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    Edit Tags
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              Select an item to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
