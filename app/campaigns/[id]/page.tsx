'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Campaign = {
  id: string
  brand_id: string
  name: string
  offer_description: string | null
  offer_file_name: string | null
  date_start: string
  date_end: string
  landing_page_url: string | null
  goal: string | null
  target_leads: number | null
  target_sales: number | null
  status: 'draft' | 'plan_generated' | 'approved' | 'posts_created'
  campaign_plan: string | null
  video_context: string | null
  duration_type: 'monthly' | 'quarterly' | 'yearly' | null
  posts_per_week: number | null
}

type Brand = {
  id: string
  name: string
  pillars: Array<{ name: string; description: string }> | null
  platforms: string[] | null
  offers: Array<{ name: string; description: string }> | null
  voice_tone: string | null
  icp: { raw?: string; audience?: string } | null
  brand_voice?: {
    personality_traits?: string[]
    writing_rules?: string[]
    vocab_use?: string[]
    vocab_avoid?: string[]
    example_posts?: string[]
    unique_markers?: string
  } | null
}

type GraphicType = 'photo_asis' | 'photo_overlay' | 'ai_generated' | 'video'
type PostFormat = 'single' | 'carousel' | 'video'

type GeneratedPost = {
  date: string
  day_of_week: number
  platform: string
  pillar: string
  phase: 'why' | 'how' | 'what' | string
  concept: string
  caption: string
  post_format: PostFormat
  graphic_type: GraphicType
  photo_id: string | null
  overlay_headlines: string[] | null
  overlay_placement: string | null
  video_url: string | null
  video_outline: string | null
  video_script: string | null
  testimonial_id?: string | null
  hashtags?: string | null
  cta_url?: string | null
}

type PostState = GeneratedPost & {
  editedCaption: string
  regenerating: boolean
  // graphic state
  graphicDataUrl: string | null   // AI-generated image (base64 data URL)
  graphicGenerating: boolean
  graphicPrompt: string
  selectedOverlayIndex: number    // which of the 3 overlay headlines is active
}

type BrandAsset = {
  id: string
  category: 'photo' | 'style_reference'
  name: string | null
  description: string | null
  style_tags: string[] | null
  file_url: string
  file_path: string
}

type CampaignTestimonial = {
  id: string
  author_name: string | null
  author_title: string | null
  content: string | null
  rating: number | null
  times_used: number
  campaign_id: string | null
}

const PHASE_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  why:  { label: 'WHY',  bg: 'rgba(234,179,8,0.12)',   color: '#a16207' },
  how:  { label: 'HOW',  bg: 'rgba(59,130,246,0.10)',  color: '#1d4ed8' },
  what: { label: 'WHAT', bg: 'rgba(233,30,140,0.10)',  color: '#be185d' },
}

const FORMAT_STYLE: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  single:   { label: 'Single',   icon: '▣', bg: 'rgba(100,116,139,0.10)', color: '#475569' },
  carousel: { label: 'Carousel', icon: '⧉', bg: 'rgba(99,102,241,0.10)',  color: '#4338ca' },
  video:    { label: 'Video',    icon: '▶', bg: 'rgba(16,185,129,0.10)',  color: '#047857' },
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PLATFORM_DOT: Record<string, string> = {
  linkedin: 'bg-blue-400',
  facebook: 'bg-blue-600',
  instagram: 'bg-fuchsia-500',
  twitter: 'bg-sky-400',
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listBuffer: React.ReactNode[] = []

  function flushList() {
    if (listBuffer.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} className="space-y-1 my-2 pl-1">{listBuffer}</ul>)
      listBuffer = []
    }
  }

  lines.forEach((line, i) => {
    if (line.startsWith('# ')) {
      flushList()
      elements.push(<h1 key={i} className="text-xl font-bold text-gray-900 mt-6 mb-2">{renderInline(line.slice(2))}</h1>)
    } else if (line.startsWith('## ')) {
      flushList()
      elements.push(<h2 key={i} className="text-base font-bold text-gray-900 mt-5 mb-2 pb-2 border-b border-gray-100">{renderInline(line.slice(3))}</h2>)
    } else if (line.startsWith('### ')) {
      flushList()
      elements.push(<h3 key={i} className="text-sm font-semibold uppercase tracking-wide mt-4 mb-1" style={{ color: '#e91e8c' }}>{renderInline(line.slice(4))}</h3>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(
        <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#e91e8c' }} />
          <span>{renderInline(line.slice(2))}</span>
        </li>
      )
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\. /)?.[1]
      listBuffer.push(
        <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
          <span className="shrink-0 font-semibold w-5 text-right" style={{ color: '#e91e8c' }}>{num}.</span>
          <span>{renderInline(line.replace(/^\d+\. /, ''))}</span>
        </li>
      )
    } else if (line === '---') {
      flushList(); elements.push(<hr key={i} className="border-gray-100 my-4" />)
    } else if (line === '') {
      flushList(); elements.push(<div key={i} className="h-2" />)
    } else {
      flushList()
      elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed">{renderInline(line)}</p>)
    }
  })
  flushList()
  return <div>{elements}</div>
}

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
      done ? 'text-white' : active ? 'text-white' : 'bg-gray-100 text-gray-400'
    }`} style={done || active ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}>
      {done ? '✓' : n}
    </div>
  )
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [loading, setLoading] = useState(true)

  // Plan generation
  const [plan, setPlan] = useState('')
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [editPlan, setEditPlan] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [planSaved, setPlanSaved] = useState(false)

  const [briefExpanded, setBriefExpanded] = useState(false)

  // Post generation
  const [generatingPosts, setGeneratingPosts] = useState(false)
  const [posts, setPosts] = useState<PostState[]>([])
  const [savingToCal, setSavingToCal] = useState(false)
  const [savedToCal, setSavedToCal] = useState(false)
  const [postError, setPostError] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')  // YYYY-MM for month, or full range

  // Brand assets for graphic generation
  const [brandPhotos, setBrandPhotos] = useState<BrandAsset[]>([])
  const [styleRefs, setStyleRefs] = useState<BrandAsset[]>([])

  // Available testimonials (not on 90-day cooldown)
  const [testimonials, setTestimonials] = useState<CampaignTestimonial[]>([])

  useEffect(() => {
    async function load() {
      const { data: c } = await supabase.from('campaigns').select('*').eq('id', id).single()
      if (!c) { router.push('/campaigns'); return }
      setCampaign(c)
      setPlan(c.campaign_plan ?? '')

      const { data: b } = await supabase.from('brands').select('*').eq('id', c.brand_id).single()
      if (b) setBrand(b)

      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const [{ data: assets }, { data: testimonialsData }] = await Promise.all([
        supabase
          .from('brand_assets')
          .select('id, category, name, description, style_tags, file_url, file_path')
          .eq('brand_id', c.brand_id),
        supabase
          .from('testimonials')
          .select('id, author_name, author_title, content, rating, times_used, campaign_id')
          .eq('brand_id', c.brand_id)
          .or(`last_used_at.is.null,last_used_at.lt.${ninetyDaysAgo}`),
      ])
      if (assets) {
        setBrandPhotos(assets.filter((a: BrandAsset) => a.category === 'photo'))
        setStyleRefs(assets.filter((a: BrandAsset) => a.category === 'style_reference'))
      }
      if (testimonialsData) {
        // Sort: campaign-specific testimonials first, then general ones
        const sorted = [...testimonialsData].sort((a, b) => {
          const aMatch = a.campaign_id === c.id ? -1 : 0
          const bMatch = b.campaign_id === c.id ? -1 : 0
          return aMatch - bMatch
        })
        setTestimonials(sorted)
      }
      setLoading(false)
    }
    load()
  }, [id, router])

  async function generatePlan() {
    if (!campaign || !brand || generatingPlan) return
    setGeneratingPlan(true)
    setPlan('')
    setEditPlan(false)

    const brandContext = `Brand: ${brand.name}
Platforms: ${(brand.platforms ?? []).join(', ')}
Pillars: ${(brand.pillars ?? []).map(p => p.name).join(', ')}
Voice & Tone: ${brand.voice_tone ?? 'not set'}
ICP: ${brand.icp?.raw ?? brand.icp?.audience ?? 'not set'}`

    const durationType = campaign.duration_type ?? 'monthly'
    const durationNote = durationType === 'yearly'
      ? 'This is a YEARLY campaign. Structure the plan month by month — give each month a theme, content focus, and key messaging. The user will generate specific posts one month at a time.'
      : durationType === 'quarterly'
      ? 'This is a QUARTERLY campaign. Structure the plan week by week across the quarter, with a clear theme per month within the quarter.'
      : ''

    const campaignContext = `Campaign: ${campaign.name}
Duration type: ${durationType}
Date range: ${campaign.date_start} to ${campaign.date_end}
Goal: ${campaign.goal ?? 'not specified'}
Landing page: ${campaign.landing_page_url ?? 'not provided'}
Posts per week: ${campaign.posts_per_week ?? '3–5'}
${campaign.target_leads ? `Target leads: ${campaign.target_leads}` : ''}
${campaign.target_sales ? `Target sales: ${campaign.target_sales}` : ''}
Offer details: ${campaign.offer_description ?? 'not provided'}
${durationNote ? `\nNote: ${durationNote}` : ''}`

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], brand, mode: 'campaign-plan', campaignContext, landingPage: campaign.landing_page_url ?? undefined, gdriveContext: campaign.video_context ?? undefined }),
      })
      if (!res.ok) throw new Error(await res.text())

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setPlan(text)
      }

      // Auto-save
      await supabase.from('campaigns').update({ campaign_plan: text, status: 'plan_generated' }).eq('id', id)
      setCampaign(prev => prev ? { ...prev, campaign_plan: text, status: 'plan_generated' } : prev)
    } catch (err) {
      setPlan(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGeneratingPlan(false)
    }
  }

  async function savePlan() {
    if (!plan) return
    setSavingPlan(true)
    await supabase.from('campaigns').update({ campaign_plan: plan }).eq('id', id)
    setCampaign(prev => prev ? { ...prev, campaign_plan: plan } : prev)
    setSavingPlan(false)
    setPlanSaved(true)
    setTimeout(() => setPlanSaved(false), 2000)
  }

  async function downloadPlanPDF() {
    const element = document.getElementById('campaign-plan-content')
    if (!element) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html2pdf = (await import('html2pdf.js')).default as any
    html2pdf().set({
      margin: [12, 14, 12, 14],
      filename: `${campaign?.name ?? 'campaign'}-plan.pdf`,
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(element).save()
  }

  async function approveCampaign() {
    await supabase.from('campaigns').update({ status: 'approved' }).eq('id', id)
    setCampaign(prev => prev ? { ...prev, status: 'approved' } : prev)
  }

  async function generatePosts() {
    if (!campaign || !brand || generatingPosts) return
    setGeneratingPosts(true)
    setPosts([])
    setPostError('')
    setSavedToCal(false)

    // For yearly/quarterly campaigns, use selected month period; otherwise full range
    let postDateStart = campaign.date_start
    let postDateEnd   = campaign.date_end
    if (selectedPeriod && (campaign.duration_type === 'yearly' || campaign.duration_type === 'quarterly')) {
      const [yr, mo] = selectedPeriod.split('-').map(Number)
      const lastDay  = new Date(yr, mo, 0).getDate()
      postDateStart  = `${yr}-${String(mo).padStart(2, '0')}-01`
      postDateEnd    = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    }

    // Parse video URLs from campaign video_context
    const availableVideos: Array<{ url: string; description: string }> = []
    if (campaign.video_context) {
      const urlMatches = [...campaign.video_context.matchAll(/Google Drive video:\s*(https:\/\/[^\s\n]+)/g)]
      const descMatches = [...campaign.video_context.matchAll(/User description:\s*([^\n]+)/g)]
      urlMatches.forEach((m, i) => {
        availableVideos.push({ url: m[1], description: descMatches[i]?.[1] ?? '' })
      })
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [],
          brand,
          mode: 'campaign-posts',
          campaignPlan: plan,
          dateStart: postDateStart,
          dateEnd: postDateEnd,
          goal: campaign.goal,
          landingPage: campaign.landing_page_url,
          gdriveContext: campaign.video_context ?? undefined,
          postsPerWeek: campaign.posts_per_week,
          availablePhotos: brandPhotos.map(p => ({ id: p.id, name: p.name ?? '', description: p.description })),
          availableVideos: availableVideos.length > 0 ? availableVideos : undefined,
          availableTestimonials: testimonials.length > 0 ? testimonials.map(t => ({ id: t.id, author_name: t.author_name, author_title: t.author_title, content: t.content, rating: t.rating, is_campaign_testimonial: t.campaign_id === campaign.id })) : undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setPosts((data.posts ?? []).map((p: GeneratedPost) => ({
        ...p,
        editedCaption: p.caption ?? p.concept ?? '',
        regenerating: false,
        graphicDataUrl: null,
        graphicGenerating: false,
        graphicPrompt: '',
        selectedOverlayIndex: 0,
      })))
    } catch (err) {
      setPostError(err instanceof Error ? err.message : String(err))
    } finally {
      setGeneratingPosts(false)
    }
  }

  async function generateGraphic(index: number) {
    const post = posts[index]
    if (!campaign || !brand || post.graphicGenerating) return
    setPosts(prev => prev.map((p, i) => i === index ? { ...p, graphicGenerating: true, graphicDataUrl: null } : p))
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [], brand, mode: 'generate-graphic',
          graphicConcept: post.concept,
          graphicCaption: post.editedCaption,
          graphicPhase: post.phase,
          graphicPlatform: post.platform,
          styleRefs: styleRefs.map(r => ({ description: r.description, style_tags: r.style_tags })),
          modifyInstructions: post.graphicPrompt || undefined,
        }),
      })
      const data = await res.json()
      if (data.b64) {
        setPosts(prev => prev.map((p, i) => i === index
          ? { ...p, graphicDataUrl: `data:image/png;base64,${data.b64}`, graphicGenerating: false }
          : p
        ))
      } else {
        setPosts(prev => prev.map((p, i) => i === index ? { ...p, graphicGenerating: false } : p))
      }
    } catch {
      setPosts(prev => prev.map((p, i) => i === index ? { ...p, graphicGenerating: false } : p))
    }
  }

  async function regeneratePost(index: number) {
    const post = posts[index]
    if (!campaign || !brand || post.regenerating) return
    setPosts(prev => prev.map((p, i) => i === index ? { ...p, regenerating: true } : p))

    const campaignContext = `Campaign: ${campaign.name}
Date range: ${campaign.date_start} to ${campaign.date_end}
Goal: ${campaign.goal ?? 'not specified'}
Offer: ${campaign.offer_description ?? 'not provided'}`

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [], brand, mode: 'regenerate-post',
          campaignContext,
          landingPage: campaign.landing_page_url ?? undefined,
          postPhase: post.phase,
          postPlatform: post.platform,
          postPillar: post.pillar,
          postConcept: post.concept,
        }),
      })
      const data = await res.json()
      if (data.caption) {
        setPosts(prev => prev.map((p, i) => i === index ? { ...p, editedCaption: data.caption, regenerating: false } : p))
      } else {
        setPosts(prev => prev.map((p, i) => i === index ? { ...p, regenerating: false } : p))
      }
    } catch {
      setPosts(prev => prev.map((p, i) => i === index ? { ...p, regenerating: false } : p))
    }
  }

  async function savePostsToCalendar() {
    if (!campaign || !brand || posts.length === 0) return
    setSavingToCal(true)

    // Get all unique Monday dates from posts
    const weekMap = new Map<string, string>() // weekStart → content_week id

    for (const post of posts) {
      const d = new Date(post.date)
      const dayOfWeek = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      monday.setHours(0, 0, 0, 0)
      const ws = monday.toISOString().split('T')[0]

      if (!weekMap.has(ws)) {
        let { data: week } = await supabase.from('content_weeks').select('id').eq('brand_id', brand.id).eq('week_start', ws).single()
        if (!week) {
          const { data: newWeek } = await supabase.from('content_weeks').insert({ brand_id: brand.id, week_start: ws, status: 'draft' }).select('id').single()
          week = newWeek
        }
        if (week) weekMap.set(ws, week.id)
      }
    }

    // Resolve final graphic URL per post
    const graphicUrls: (string | null)[] = await Promise.all(posts.map(async post => {
      // Video post — use video URL directly
      if (post.graphic_type === 'video') return post.video_url ?? null
      // Photo (as-is or overlay) — look up the photo URL from brand library
      if ((post.graphic_type === 'photo_asis' || post.graphic_type === 'photo_overlay') && post.photo_id) {
        return brandPhotos.find(p => p.id === post.photo_id)?.file_url ?? null
      }
      // AI-generated — upload base64 to storage
      if (post.graphicDataUrl?.startsWith('data:')) {
        try {
          const blob = await fetch(post.graphicDataUrl).then(r => r.blob())
          const path = `${brand.id}/generated/${crypto.randomUUID()}.png`
          const { error } = await supabase.storage.from('brand-assets').upload(path, blob, { contentType: 'image/png' })
          if (error) return null
          const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(path)
          return publicUrl
        } catch { return null }
      }
      return null
    }))

    const toInsert = posts.map((post, idx) => {
      const d = new Date(post.date)
      const dayOfWeek = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      monday.setHours(0, 0, 0, 0)
      const ws = monday.toISOString().split('T')[0]
      const weekId = weekMap.get(ws)
      if (!weekId) return null
      return {
        content_week_id: weekId,
        brand_id: brand.id,
        day_of_week: post.day_of_week,
        platform: post.platform ? [post.platform] : null,
        pillar: post.pillar || null,
        concept: post.concept,
        caption: post.editedCaption || post.caption || null,
        hashtags: post.hashtags || null,
        cta_url: post.cta_url || null,
        media_url: graphicUrls[idx] || null,
        status: 'planning',
        scheduled_date: post.date,
      }
    }).filter(Boolean)

    if (toInsert.length > 0) {
      await supabase.from('posts').insert(toInsert)
    }

    // Update testimonial usage tracking
    const usedTestimonialIds = [...new Set(posts.map(p => p.testimonial_id).filter(Boolean))] as string[]
    if (usedTestimonialIds.length > 0) {
      const now = new Date().toISOString()
      await Promise.all(usedTestimonialIds.map(async (tid) => {
        const { data: tData } = await supabase.from('testimonials').select('times_used').eq('id', tid).single()
        if (tData) {
          await supabase.from('testimonials').update({
            last_used_at: now,
            times_used: (tData.times_used ?? 0) + 1,
          }).eq('id', tid)
        }
      }))
    }

    await supabase.from('campaigns').update({ status: 'posts_created' }).eq('id', id)
    setCampaign(prev => prev ? { ...prev, status: 'posts_created' } : prev)
    setSavingToCal(false)
    setSavedToCal(true)
  }

  if (loading) return <div className="text-sm text-gray-400">Loading…</div>
  if (!campaign || !brand) return <div className="text-sm text-gray-400">Campaign not found.</div>

  const status = campaign.status
  const hasPlan = !!plan
  const isApproved = status === 'approved' || status === 'posts_created'

  const dateRangeLabel = `${new Date(campaign.date_start).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })} – ${new Date(campaign.date_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.push('/campaigns')} className="text-gray-400 hover:text-gray-600 text-sm mt-1">← Back</button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{campaign.name}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{dateRangeLabel}{campaign.goal ? ` · ${campaign.goal}` : ''}</p>
        </div>
      </div>

      {/* Campaign brief summary */}
      <div className="bg-white rounded-2xl border border-pink-50 p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-700 mb-4">Campaign Brief</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Date Range</p>
            <p className="text-gray-800">{dateRangeLabel}</p>
          </div>
          {campaign.goal && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Goal</p>
              <p className="text-gray-800">{campaign.goal}</p>
            </div>
          )}
          {campaign.landing_page_url && (
            <div className="col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Landing Page</p>
              <a href={campaign.landing_page_url} target="_blank" rel="noopener noreferrer" className="text-sm break-all hover:underline" style={{ color: '#e91e8c' }}>
                {campaign.landing_page_url}
              </a>
            </div>
          )}
          {(campaign.target_leads || campaign.target_sales) && (
            <div className="col-span-2 flex gap-4">
              {campaign.target_leads && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: 'rgba(233,30,140,0.08)', color: '#be185d' }}>
                  🎯 {campaign.target_leads.toLocaleString()} leads
                </span>
              )}
              {campaign.target_sales && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: 'rgba(192,38,211,0.08)', color: '#a21caf' }}>
                  💰 {campaign.target_sales.toLocaleString()} sales
                </span>
              )}
            </div>
          )}
          {campaign.offer_description && (
            <div className="col-span-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                Offer Details {campaign.offer_file_name && <span className="normal-case font-normal text-gray-400">· {campaign.offer_file_name}</span>}
              </p>
              <div className={briefExpanded ? '' : 'line-clamp-3'}>
                <MarkdownContent text={campaign.offer_description} />
              </div>
              <button
                onClick={() => setBriefExpanded(e => !e)}
                className="mt-1 text-xs font-medium hover:underline"
                style={{ color: '#e91e8c' }}
              >
                {briefExpanded ? 'Show less' : 'Show more'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* STEP 1: Generate campaign plan */}
      <div className="bg-white rounded-2xl border border-pink-50 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <div className="flex items-center gap-3">
            <StepBadge n={1} active={!hasPlan} done={hasPlan} />
            <div>
              <p className="font-bold text-gray-900 text-sm">Campaign Plan</p>
              <p className="text-xs text-gray-400">AI-generated plan for your date range</p>
            </div>
          </div>
          <button
            onClick={generatePlan}
            disabled={generatingPlan}
            className="px-4 py-2 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition-all hover:shadow-md shrink-0"
            style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}
          >
            {generatingPlan ? 'Generating…' : hasPlan ? 'Regenerate' : 'Generate Plan'}
          </button>
        </div>

        {hasPlan ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-50" style={{ background: '#fff8fb' }}>
              <button
                onClick={() => setEditPlan(e => !e)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${editPlan ? 'text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                style={editPlan ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {editPlan ? 'Done' : 'Edit'}
              </button>
              <button onClick={savePlan} disabled={savingPlan} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {planSaved ? 'Saved!' : savingPlan ? 'Saving…' : 'Save'}
              </button>
              <button onClick={downloadPlanPDF} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </button>
            </div>
            <div id="campaign-plan-content" className="px-6 py-5">
              {editPlan ? (
                <textarea value={plan} onChange={e => setPlan(e.target.value)} rows={25}
                  className="w-full text-sm font-mono text-gray-700 border border-gray-200 rounded-xl px-3 py-3 resize-y focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c]" />
              ) : (
                <MarkdownContent text={plan} />
              )}
            </div>
          </>
        ) : (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            {generatingPlan
              ? <span className="animate-pulse">Building your campaign plan…</span>
              : 'Click Generate Plan to create an AI-powered campaign plan for your date range.'}
          </div>
        )}
      </div>

      {/* STEP 2: Approve */}
      {hasPlan && (
        <div className="bg-white rounded-2xl border border-pink-50 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StepBadge n={2} active={hasPlan && !isApproved} done={isApproved} />
              <div>
                <p className="font-bold text-gray-900 text-sm">Approve Campaign</p>
                <p className="text-xs text-gray-400">Review the plan above, then approve to generate posts</p>
              </div>
            </div>
            {isApproved ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#e91e8c' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Approved
              </span>
            ) : (
              <button
                onClick={approveCampaign}
                className="px-4 py-2 text-white text-xs font-semibold rounded-xl transition-all hover:shadow-md"
                style={{ background: 'linear-gradient(135deg, #c026d3, #a21caf)' }}
              >
                ✓ Approve Campaign
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: Generate posts */}
      {isApproved && (
        <div className="bg-white rounded-2xl border border-pink-50 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <StepBadge n={3} active={isApproved && posts.length === 0} done={savedToCal || status === 'posts_created'} />
              <div>
                <p className="font-bold text-gray-900 text-sm">Generate Posts</p>
                <p className="text-xs text-gray-400">
                  {campaign?.duration_type === 'yearly' ? 'Select a month to generate posts for'
                    : campaign?.duration_type === 'quarterly' ? 'Select a month within the quarter'
                    : 'Create individual post ideas for each day of the campaign'}
                  {campaign?.posts_per_week ? ` · ${campaign.posts_per_week} posts/week` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={generatePosts}
              disabled={generatingPosts || (!selectedPeriod && (campaign?.duration_type === 'yearly' || campaign?.duration_type === 'quarterly'))}
              className="px-4 py-2 text-white text-xs font-semibold rounded-xl disabled:opacity-50 transition-all hover:shadow-md shrink-0"
              style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)' }}
            >
              {generatingPosts ? 'Generating…' : posts.length > 0 ? 'Regenerate' : 'Generate Posts'}
            </button>
          </div>

          {/* Period selector for yearly / quarterly */}
          {(campaign?.duration_type === 'yearly' || campaign?.duration_type === 'quarterly') && (() => {
            const start = new Date(campaign.date_start)
            const end   = new Date(campaign.date_end)
            const months: { value: string; label: string }[] = []
            const cur = new Date(start.getFullYear(), start.getMonth(), 1)
            while (cur <= end) {
              months.push({
                value: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`,
                label: cur.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
              })
              cur.setMonth(cur.getMonth() + 1)
            }
            return (
              <div className="px-5 py-3 border-b border-gray-50 bg-gray-50/40">
                <p className="text-xs font-semibold text-gray-500 mb-2">Generate posts for:</p>
                <div className="flex flex-wrap gap-2">
                  {months.map(m => (
                    <button
                      key={m.value}
                      onClick={() => { setSelectedPeriod(m.value); setPosts([]); setSavedToCal(false) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        selectedPeriod === m.value
                          ? 'text-white border-transparent'
                          : 'border-gray-200 text-gray-600 hover:border-purple-300 hover:text-purple-600'
                      }`}
                      style={selectedPeriod === m.value ? { background: 'linear-gradient(135deg, #a855f7, #7c3aed)' } : {}}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          <div className="px-5 py-4">
            {postError && <p className="text-sm text-red-500 mb-3">{postError}</p>}

            {posts.length === 0 && !generatingPosts && (
              <p className="text-sm text-gray-400 text-center py-4">
                {(campaign?.duration_type === 'yearly' || campaign?.duration_type === 'quarterly') && !selectedPeriod
                  ? 'Select a month above, then click Generate Posts.'
                  : 'Click Generate Posts to create content ideas.'}
              </p>
            )}
            {generatingPosts && (
              <p className="text-sm text-gray-400 text-center py-4 animate-pulse">Creating posts for your campaign dates…</p>
            )}

            {posts.length > 0 && (
              <>
                {/* Group by week */}
                {(() => {
                  const weeks = new Map<string, PostState[]>()
                  posts.forEach(post => {
                    const d = new Date(post.date)
                    const day = d.getDay()
                    const mon = new Date(d)
                    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
                    const ws = mon.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                    if (!weeks.has(ws)) weeks.set(ws, [])
                    weeks.get(ws)!.push(post)
                  })
                  return Array.from(weeks.entries()).map(([weekLabel, weekPosts]) => (
                    <div key={weekLabel} className="mb-5">
                      <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#e91e8c' }}>Week of {weekLabel}</p>
                      <div className="space-y-2">
                        {weekPosts.map((post) => {
                          const globalIndex = posts.indexOf(post)
                          return (
                          <div key={globalIndex} className="rounded-xl border border-gray-100 bg-gray-50/50 overflow-hidden">
                            {/* Post header */}
                            <div className="flex items-center gap-3 px-3 pt-3 pb-2">
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-semibold text-gray-500 w-8">
                                  {new Date(post.date).toLocaleDateString('en-AU', { weekday: 'short' })}
                                </span>
                                <span className={`w-2 h-2 rounded-full ${PLATFORM_DOT[post.platform] ?? 'bg-gray-300'}`} />
                                <span className="text-xs text-gray-500 capitalize">{post.platform}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                                {post.phase && PHASE_STYLE[post.phase] && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide" style={{ background: PHASE_STYLE[post.phase].bg, color: PHASE_STYLE[post.phase].color }}>
                                    {PHASE_STYLE[post.phase].label}
                                  </span>
                                )}
                                {post.post_format && FORMAT_STYLE[post.post_format] && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: FORMAT_STYLE[post.post_format].bg, color: FORMAT_STYLE[post.post_format].color }}>
                                    {FORMAT_STYLE[post.post_format].icon} {FORMAT_STYLE[post.post_format].label}
                                  </span>
                                )}
                                {post.pillar && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(233,30,140,0.08)', color: '#be185d' }}>{post.pillar}</span>
                                )}
                              </div>
                              <button
                                onClick={() => regeneratePost(globalIndex)}
                                disabled={post.regenerating}
                                className="shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-pink-300 hover:text-[#e91e8c] transition-colors disabled:opacity-40"
                              >
                                <svg className={`w-3 h-3 ${post.regenerating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {post.regenerating ? 'Writing…' : 'Rewrite'}
                              </button>
                            </div>
                            {/* Editable caption */}
                            <div className="px-3 pb-2">
                              <textarea
                                value={post.editedCaption}
                                onChange={e => setPosts(prev => prev.map((p, i) => i === globalIndex ? { ...p, editedCaption: e.target.value } : p))}
                                rows={Math.max(4, Math.ceil((post.editedCaption?.length ?? 0) / 60))}
                                className="w-full text-sm text-gray-700 leading-relaxed bg-white border border-gray-100 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-pink-100 focus:border-[#e91e8c] transition-colors"
                                placeholder="Caption will appear here…"
                              />
                              {post.hashtags && (
                                <p className="mt-1 text-[11px] leading-relaxed" style={{ color: '#e91e8c' }}>{post.hashtags}</p>
                              )}
                              {post.cta_url && (
                                <p className="mt-0.5 text-[11px] text-gray-400">🔗 {post.cta_url}</p>
                              )}
                            </div>

                            {/* ── Graphic section ── */}
                            {(() => {
                              const resolvedPhotoUrl = (post.graphic_type === 'photo_asis' || post.graphic_type === 'photo_overlay') && post.photo_id
                                ? brandPhotos.find(p => p.id === post.photo_id)?.file_url ?? null
                                : null
                              const graphicTypeLabels: Record<GraphicType, string> = {
                                photo_asis: '📷 Photo (as-is)',
                                photo_overlay: '📷 Photo + text overlay',
                                ai_generated: '✦ AI generated',
                                video: '🎬 Video',
                              }
                              return (
                              <div className="mx-3 mb-3 rounded-xl border border-gray-200 overflow-hidden">
                                {/* Graphic type header */}
                                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                                  <span className="text-[10px] font-bold text-gray-500">{graphicTypeLabels[post.graphic_type as GraphicType] ?? 'Graphic'}</span>
                                  <div className="flex-1" />
                                  {/* Change type buttons */}
                                  {(['photo_asis', 'photo_overlay', 'ai_generated', 'video'] as GraphicType[]).filter(t => t !== post.graphic_type).map(t => (
                                    <button
                                      key={t}
                                      onClick={() => setPosts(prev => prev.map((p, i) => i === globalIndex ? { ...p, graphic_type: t } : p))}
                                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                                    >
                                      {t === 'photo_asis' ? 'As-is' : t === 'photo_overlay' ? 'Overlay' : t === 'ai_generated' ? 'AI' : 'Video'}
                                    </button>
                                  ))}
                                </div>

                                {/* PHOTO AS-IS */}
                                {post.graphic_type === 'photo_asis' && (
                                  <div className="bg-white">
                                    {resolvedPhotoUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={resolvedPhotoUrl} alt="Selected photo" className="w-full max-h-56 object-cover" />
                                    ) : (
                                      <div className="py-6 text-center text-xs text-gray-300">
                                        {brandPhotos.length === 0 ? 'No photos in asset library' : 'Photo not matched — upload photos in Assets'}
                                      </div>
                                    )}
                                    {resolvedPhotoUrl && (
                                      <p className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-50">
                                        {brandPhotos.find(p => p.id === post.photo_id)?.name ?? 'Brand photo'} · Used as-is
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* PHOTO + OVERLAY */}
                                {post.graphic_type === 'photo_overlay' && (
                                  <div className="bg-white">
                                    {resolvedPhotoUrl && (
                                      <div className="relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={resolvedPhotoUrl} alt="Selected photo" className="w-full max-h-56 object-cover" />
                                        {/* Overlay placement indicator */}
                                        {post.overlay_headlines && post.overlay_headlines[post.selectedOverlayIndex] && (
                                          <div className={`absolute px-3 py-2 left-0 right-0 ${
                                            post.overlay_placement?.includes('top') ? 'top-0' :
                                            post.overlay_placement?.includes('bottom') ? 'bottom-0' : 'top-1/2 -translate-y-1/2'
                                          } ${
                                            post.overlay_placement?.includes('left') ? 'text-left' :
                                            post.overlay_placement?.includes('right') ? 'text-right' : 'text-center'
                                          }`} style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.0))' }}>
                                            <p className="text-white text-sm font-bold leading-tight drop-shadow">
                                              {post.overlay_headlines[post.selectedOverlayIndex]}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {!resolvedPhotoUrl && (
                                      <div className="py-6 text-center text-xs text-gray-300">
                                        {brandPhotos.length === 0 ? 'No photos in asset library' : 'Photo not matched'}
                                      </div>
                                    )}
                                    {/* Overlay headline options */}
                                    {post.overlay_headlines && post.overlay_headlines.length > 0 && (
                                      <div className="px-3 py-2.5 border-t border-gray-100 space-y-1.5">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Headline options — click to select</p>
                                        {post.overlay_headlines.map((h, hi) => (
                                          <button
                                            key={hi}
                                            onClick={() => setPosts(prev => prev.map((p, i) => i === globalIndex ? { ...p, selectedOverlayIndex: hi } : p))}
                                            className={`w-full text-left text-xs px-3 py-2 rounded-lg border transition-all ${
                                              post.selectedOverlayIndex === hi
                                                ? 'border-pink-300 bg-pink-50 text-pink-800 font-semibold'
                                                : 'border-gray-100 text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                                            }`}
                                          >
                                            {hi + 1}. {h}
                                          </button>
                                        ))}
                                        <p className="text-[10px] text-gray-400">
                                          Placement: <span className="font-semibold text-gray-500">{post.overlay_placement ?? 'auto'}</span>
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* AI GENERATED */}
                                {post.graphic_type === 'ai_generated' && (
                                  <div className="bg-white">
                                    {post.graphicGenerating && (
                                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                                        <svg className="w-8 h-8 animate-spin" style={{ color: '#e91e8c' }} fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                        </svg>
                                        <p className="text-xs text-gray-400 animate-pulse">Generating image with DALL-E…</p>
                                      </div>
                                    )}
                                    {!post.graphicGenerating && post.graphicDataUrl && (
                                      <>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={post.graphicDataUrl} alt="AI generated" className="w-full max-h-56 object-cover" />
                                      </>
                                    )}
                                    {!post.graphicGenerating && !post.graphicDataUrl && (
                                      <div className="py-8 flex flex-col items-center gap-2">
                                        <p className="text-xs text-gray-400">AI will generate an image for this post</p>
                                        <button
                                          onClick={() => generateGraphic(globalIndex)}
                                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                                          style={{ borderColor: '#e91e8c', color: '#e91e8c', background: 'rgba(233,30,140,0.06)' }}
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                                          Generate Now
                                        </button>
                                      </div>
                                    )}
                                    {/* Prompt input + regenerate */}
                                    <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/60 flex gap-2">
                                      <input
                                        value={post.graphicPrompt}
                                        onChange={e => setPosts(prev => prev.map((p, i) => i === globalIndex ? { ...p, graphicPrompt: e.target.value } : p))}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); generateGraphic(globalIndex) } }}
                                        placeholder="Describe changes… e.g. darker, add sunset, more minimal"
                                        className="flex-1 text-xs bg-white border border-gray-100 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-pink-200 focus:border-[#e91e8c] transition-colors"
                                      />
                                      <button
                                        onClick={() => generateGraphic(globalIndex)}
                                        disabled={post.graphicGenerating}
                                        className="shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
                                        style={{ borderColor: '#e91e8c', color: '#e91e8c' }}
                                      >
                                        {post.graphicDataUrl ? 'Regen' : 'Generate'}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* VIDEO */}
                                {post.graphic_type === 'video' && (
                                  <div className="bg-white">
                                    {post.video_url ? (
                                      <div className="px-3 py-3 space-y-1.5">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Campaign video</p>
                                        <a
                                          href={post.video_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-2 text-xs font-medium break-all hover:underline"
                                          style={{ color: '#e91e8c' }}
                                        >
                                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                          {post.video_url}
                                        </a>
                                      </div>
                                    ) : post.video_outline ? (
                                      <div className="px-3 py-3 space-y-3">
                                        <div>
                                          <div className="flex items-center gap-2 mb-2">
                                            <div className="flex items-center gap-1.5">
                                              <svg className="w-3.5 h-3.5" style={{ color: '#e91e8c' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#e91e8c' }}>Video to record</span>
                                            </div>
                                            <span className="text-[10px] text-gray-400">— no video uploaded yet</span>
                                          </div>
                                          <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
                                            <p className="text-xs text-amber-800 leading-relaxed whitespace-pre-wrap">{post.video_outline}</p>
                                          </div>
                                          <p className="text-[10px] text-gray-400 mt-2">Record this video and upload it to the campaign to link it here.</p>
                                        </div>
                                        {post.video_script && (
                                          <div>
                                            <div className="flex items-center gap-1.5 mb-2">
                                              <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                              <span className="text-[10px] font-bold uppercase tracking-wide text-purple-600">Full video script</span>
                                              <span className="text-[10px] text-gray-400">— ready for AI video generation</span>
                                            </div>
                                            <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
                                              <p className="text-xs text-purple-900 leading-relaxed whitespace-pre-wrap">{post.video_script}</p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-300 px-3 py-4">No video or outline available.</p>
                                    )}
                                  </div>
                                )}
                              </div>
                              )
                            })()}
                          </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()}

                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={savePostsToCalendar}
                    disabled={savingToCal || savedToCal}
                    className="px-5 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-all hover:shadow-md"
                    style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}
                  >
                    {savingToCal ? 'Adding…' : savedToCal ? '✓ Added to Calendar' : `Add ${posts.length} Posts to Calendar`}
                  </button>
                  {savedToCal && <span className="text-sm text-gray-400">Go to Calendar to review your campaign posts.</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>

  )
}
