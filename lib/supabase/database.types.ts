export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          onboarding_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      business_locations: {
        Row: {
          id: string
          user_id: string
          place_id: string
          name: string
          formatted_address: string | null
          phone_number: string | null
          website: string | null
          rating: number | null
          review_count: number | null
          category: string | null
          categories: string[] | null
          lat: number | null
          lng: number | null
          open_now: boolean | null
          photos: Json | null
          enabled_tools: string[] | null
          location_range: string | null
          facebook_username: string | null
          instagram_username: string | null
          linkedin_username: string | null
          x_username: string | null
          tiktok_username: string | null
          google_location_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          place_id: string
          name: string
          formatted_address?: string | null
          phone_number?: string | null
          website?: string | null
          rating?: number | null
          review_count?: number | null
          category?: string | null
          categories?: string[] | null
          lat?: number | null
          lng?: number | null
          open_now?: boolean | null
          photos?: Json | null
          enabled_tools?: string[] | null
          location_range?: string | null
          facebook_username?: string | null
          instagram_username?: string | null
          linkedin_username?: string | null
          x_username?: string | null
          tiktok_username?: string | null
          google_location_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          place_id?: string
          name?: string
          formatted_address?: string | null
          phone_number?: string | null
          website?: string | null
          rating?: number | null
          review_count?: number | null
          category?: string | null
          categories?: string[] | null
          lat?: number | null
          lng?: number | null
          open_now?: boolean | null
          photos?: Json | null
          enabled_tools?: string[] | null
          location_range?: string | null
          facebook_username?: string | null
          instagram_username?: string | null
          linkedin_username?: string | null
          x_username?: string | null
          tiktok_username?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      connected_accounts: {
        Row: {
          id: string
          user_id: string
          business_location_id: string
          provider: string
          provider_account_id: string | null
          access_token: string | null
          refresh_token: string | null
          expires_at: string | null
          scopes: string[] | null
          display_name: string | null
          avatar_url: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          business_location_id: string
          provider: string
          provider_account_id?: string | null
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          scopes?: string[] | null
          display_name?: string | null
          avatar_url?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          business_location_id?: string
          provider?: string
          provider_account_id?: string | null
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          scopes?: string[] | null
          display_name?: string | null
          avatar_url?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      business_insights: {
        Row: {
          id: string
          location_id: string
          source: string
          scrape_status: string
          scrape_error: string | null
          last_scraped_at: string | null
          next_scheduled_scrape_at: string | null
          gbp_avg_rating: number | null
          gbp_review_count: number | null
          gbp_primary_category: string | null
          gbp_additional_categories: Json | null
          gbp_website_url: string | null
          gbp_phone: string | null
          gbp_address: Json | null
          gbp_last_review_at: string | null
          gbp_total_call_clicks: number
          gbp_total_website_clicks: number
          gbp_total_directions_requests: number
          gbp_metrics_raw: Json | null
          apify_place_id: string | null
          apify_total_score: number | null
          apify_user_ratings_total: number | null
          apify_price_level: number | null
          apify_categories: Json | null
          apify_opening_hours: Json | null
          apify_raw_payload: Json | null
          review_sentiment_summary: Json | null
          top_review_keywords: Json | null
          last_analysis_at: string | null
          apify_competitors: Json | null
          gbp_ai_analysis: Json | null
          gbp_ai_analysis_generated_at: string | null
          instagram_ai_analysis: Json | null
          instagram_ai_analysis_generated_at: string | null
          instagram_username: string | null
          instagram_raw_posts: Json | null
          instagram_raw_comments: Json | null
          instagram_metrics: Json | null
          instagram_data_fetched_at: string | null
          facebook_ai_analysis: Json | null
          facebook_ai_analysis_generated_at: string | null
          facebook_url: string | null
          facebook_raw_posts: Json | null
          facebook_metrics: Json | null
          facebook_data_fetched_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          location_id: string
          source?: string
          scrape_status?: string
          scrape_error?: string | null
          last_scraped_at?: string | null
          next_scheduled_scrape_at?: string | null
          gbp_avg_rating?: number | null
          gbp_review_count?: number | null
          gbp_primary_category?: string | null
          gbp_additional_categories?: Json | null
          gbp_website_url?: string | null
          gbp_phone?: string | null
          gbp_address?: Json | null
          gbp_last_review_at?: string | null
          gbp_total_call_clicks?: number
          gbp_total_website_clicks?: number
          gbp_total_directions_requests?: number
          gbp_metrics_raw?: Json | null
          apify_place_id?: string | null
          apify_total_score?: number | null
          apify_user_ratings_total?: number | null
          apify_price_level?: number | null
          apify_categories?: Json | null
          apify_opening_hours?: Json | null
          apify_raw_payload?: Json | null
          review_sentiment_summary?: Json | null
          top_review_keywords?: Json | null
          last_analysis_at?: string | null
          apify_competitors?: Json | null
          gbp_ai_analysis?: Json | null
          gbp_ai_analysis_generated_at?: string | null
          instagram_ai_analysis?: Json | null
          instagram_ai_analysis_generated_at?: string | null
          instagram_username?: string | null
          instagram_raw_posts?: Json | null
          instagram_raw_comments?: Json | null
          instagram_metrics?: Json | null
          instagram_data_fetched_at?: string | null
          facebook_ai_analysis?: Json | null
          facebook_ai_analysis_generated_at?: string | null
          facebook_url?: string | null
          facebook_raw_posts?: Json | null
          facebook_metrics?: Json | null
          facebook_data_fetched_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          location_id?: string
          source?: string
          scrape_status?: string
          scrape_error?: string | null
          last_scraped_at?: string | null
          next_scheduled_scrape_at?: string | null
          gbp_avg_rating?: number | null
          gbp_review_count?: number | null
          gbp_primary_category?: string | null
          gbp_additional_categories?: Json | null
          gbp_website_url?: string | null
          gbp_phone?: string | null
          gbp_address?: Json | null
          gbp_last_review_at?: string | null
          gbp_total_call_clicks?: number
          gbp_total_website_clicks?: number
          gbp_total_directions_requests?: number
          gbp_metrics_raw?: Json | null
          apify_place_id?: string | null
          apify_total_score?: number | null
          apify_user_ratings_total?: number | null
          apify_price_level?: number | null
          apify_categories?: Json | null
          apify_opening_hours?: Json | null
          apify_raw_payload?: Json | null
          review_sentiment_summary?: Json | null
          top_review_keywords?: Json | null
          last_analysis_at?: string | null
          apify_competitors?: Json | null
          gbp_ai_analysis?: Json | null
          gbp_ai_analysis_generated_at?: string | null
          instagram_ai_analysis?: Json | null
          instagram_ai_analysis_generated_at?: string | null
          instagram_username?: string | null
          instagram_raw_posts?: Json | null
          instagram_raw_comments?: Json | null
          instagram_metrics?: Json | null
          instagram_data_fetched_at?: string | null
          facebook_ai_analysis?: Json | null
          facebook_ai_analysis_generated_at?: string | null
          facebook_url?: string | null
          facebook_raw_posts?: Json | null
          facebook_metrics?: Json | null
          facebook_data_fetched_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      business_reviews: {
        Row: {
          id: string
          location_id: string
          source: string
          rating: number | null
          review_text: string | null
          author_name: string | null
          author_photo_url: string | null
          published_at: string | null
          review_url: string | null
          review_id: string | null
          raw_payload: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          location_id: string
          source: string
          rating?: number | null
          review_text?: string | null
          author_name?: string | null
          author_photo_url?: string | null
          published_at?: string | null
          review_url?: string | null
          review_id?: string | null
          raw_payload?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          location_id?: string
          source?: string
          rating?: number | null
          review_text?: string | null
          author_name?: string | null
          author_photo_url?: string | null
          published_at?: string | null
          review_url?: string | null
          review_id?: string | null
          raw_payload?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
