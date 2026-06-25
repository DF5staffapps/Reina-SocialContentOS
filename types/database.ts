export interface Brand {
  id: string
  name: string
  brand_colors: { primary?: string; accent?: string } | null
  icp: {
    audience?: string
    pain_points?: string
    demographics?: string
  } | null
  voice_tone: string | null
  pillars: Array<{ name: string; description: string }> | null
  offers: Array<{ name: string; description: string }> | null
  platforms: string[]
  created_at: string
}

export interface ContentWeek {
  id: string
  brand_id: string
  week_start: string
  status: 'draft' | 'pending_approval' | 'approved' | 'live'
  created_at: string
}

export interface Post {
  id: string
  content_week_id: string
  brand_id: string
  day_of_week: number | null
  platform: string | null
  pillar: string | null
  concept: string | null
  caption: string | null
  creative_brief: string | null
  status: 'idea' | 'drafted' | 'designed' | 'scheduled' | 'posted'
  scheduled_date: string | null
  post_time: string | null
  media_url: string | null
  hashtags: string | null
  cta_url: string | null
  ghl_post_id: string | null
  created_at: string
  updated_at: string
}

export interface KpiWeekly {
  id: string
  brand_id: string
  post_id: string | null
  week_start: string
  platform: string | null
  impressions: number | null
  reach: number | null
  engagement: number | null
  clicks: number | null
  followers_gained: number | null
  notes: string | null
  created_at: string
}
