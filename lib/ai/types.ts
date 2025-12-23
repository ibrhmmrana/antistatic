/**
 * AI Analysis Types
 */

import { AntistaticModuleId } from '@/lib/modules/catalog'

export interface GBPAnalysisInput {
  business: {
    name: string
    locationLabel: string // e.g. "Greenside, South Africa"
    totalReviews: number
    positiveReviews: number
    negativeReviews: number
    avgRating: number | null
  }
  competitors: Array<{
    name: string // e.g. "Dentist Tree"
    avgRating: number | null
    totalReviews: number | null
  }>
  // Last N reviews for us and competitors – small sample, not thousands
  yourReviews: Array<{ rating: number; text: string | null }>
  competitorReviews: Array<{
    businessName: string
    rating: number
    text: string | null
  }>
}

export interface GBPWeaknessAnalysisResult {
  headerSummary: {
    line1: string // e.g. "The Happy Dentist, Greenside, South Africa"
    line2: string // e.g. "26 reviews • 20 positive • 6 negative"
  }
  positiveSummary: string // short sentence
  negativeSummary: string // short sentence, focus on weaknesses
  themes: Array<{
    theme: string // "Staff friendliness", "Service quality", "Pricing", etc.
    you: string // describes what YOU are doing badly / weaker
    competitorName: string // e.g. "Dentist Tree"
    competitor: string // describes what competitor is doing better
    prescribedModules?: AntistaticModuleId[] // NEW: 0-2 module IDs recommended for this theme
  }>
}

