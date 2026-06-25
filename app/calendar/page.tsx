'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ContentWeek, Post } from '@/types/database'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const PLATFORMS = ['linkedin', 'facebook', 'instagram', 'twitter', 'tiktok', 'youtube']
const STATUSES = ['idea', 'drafted', 'designed', 'scheduled', 'posted'] as const
type PostStatus = typeof STATUSES[number]

const PLATFORM_COLOR: Record<string, { bg: string; text: string; bar: string }> = {
  linkedin:  { bg: 'bg-blue-50',   text: 'text-blue-700',  bar: 'bg-blue-500'   },
  facebook:  { bg: 'bg-indigo-50', text: 'text-indigo-700',bar: 'bg-indigo-600' },
  instagram: { bg: 'bg-pink-50',   text: 'text-pink-700',  bar: 'bg-pink-500'   },
  twitter:   { bg: 'bg-sky-50',    text: 'text-sky-700',   bar: 'bg-sky-400'    },
  tiktok:    { bg: 'bg-gray-100',  text: 'text-gray-700',  bar: 'bg-gray-800'   },
  youtube:   { bg: 'bg-red-50',    text: 'text-red-700',   bar: 'bg-red-500'    },
}

const STATUS_CONFIG: Record<PostStatus, { label: string; color: string; dot: string }> = {
  idea:      { label: 'Idea',      color: 'bg-gray-100 text-gray-600',       dot: 'bg-gray-400'   },
  drafted:   { label: 'Drafted',   color: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500'   },
  designed:  { label: 'Designed',  color: 'bg-purple-100 text-purple-700',   dot: 'bg-purple-500' },
  scheduled: { label: 'Scheduled', color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500'  },
  posted:    { label: 'Posted',    color: 'bg-green-100 text-green-700',     dot: 'bg-green-500'  },
}

function toYMD(d: Date) { return d.toISOString().split('T')[0] }

function monday(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay()
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1))
  copy.setHours(0, 0, 0, 0)
  return copy
}

function isoDay(d: Date): number { return d.getDay() === 0 ? 7 : d.getDay() }

function calendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const start = monday(first)
  const end   = new Date(last)
  const rem   = last.getDay() === 0 ? 0 : 7 - last.getDay()
  end.setDate(end.getDate() + rem)
  const days: Date[] = []
  const cur = new Date(start)
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1) }
  return days
}

function platformLabel(p: string) { return p.charAt(0).toUpperCase() + p.slice(1) }

// ─── Record Modal ─────────────────────────────────────────────────────────────
function RecordModal({
  post,
  date,
  pillars,
  saveStatus,
  onClose,
  onChange,
  onDelete,
}: {
  post: Post
  date: Date
  pillars: string[]
  saveStatus: 'idle' | 'saving' | 'saved'
  onClose: () => void
  onChange: (patch: Partial<Post>) => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pc = PLATFORM_COLOR[post.platform ?? ''] ?? PLATFORM_COLOR.linkedin
  const sc = STATUS_CONFIG[post.status as PostStatus] ?? STATUS_CONFIG.idea
  const dateLabel = date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
      onClick={handleBackdrop}
    >
      <div className="relative h-full w-full max-w-xl bg-white shadow-2xl flex flex-col animate-slideIn overflow-hidden">
        {/* Top bar */}
        <div className={`h-1.5 w-full ${pc.bar}`} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${pc.bg} ${pc.text}`}>
              {platformLabel(post.platform ?? 'linkedin')}
            </span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${sc.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
              {sc.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Delete this post?</span>
                <button
                  onClick={onDelete}
                  className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">
              <div className="text-sm text-gray-700 py-2">{dateLabel}</div>
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={post.post_time ?? ''}
                onChange={e => onChange({ post_time: e.target.value || null })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white"
              />
            </Field>
          </div>

          {/* Platform + Status */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Social Media Channel">
              <select
                value={post.platform ?? 'linkedin'}
                onChange={e => onChange({ platform: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white"
              >
                {PLATFORMS.map(p => <option key={p} value={p}>{platformLabel(p)}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={post.status}
                onChange={e => onChange({ status: e.target.value as PostStatus })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white"
              >
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select>
            </Field>
          </div>

          {/* Pillar */}
          {pillars.length > 0 && (
            <Field label="Content Pillar">
              <select
                value={post.pillar ?? ''}
                onChange={e => onChange({ pillar: e.target.value || null })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white"
              >
                <option value="">— None —</option>
                {pillars.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          )}

          {/* Concept */}
          <Field label="Concept / Idea">
            <input
              value={post.concept ?? ''}
              onChange={e => onChange({ concept: e.target.value })}
              placeholder="What is this post about?"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white"
            />
          </Field>

          {/* Caption */}
          <Field label="Caption">
            <textarea
              value={post.caption ?? ''}
              onChange={e => onChange({ caption: e.target.value })}
              rows={5}
              placeholder="Write the full caption here…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white resize-y"
            />
          </Field>

          {/* Media URL */}
          <Field label="Image / Video URL">
            <input
              value={post.media_url ?? ''}
              onChange={e => onChange({ media_url: e.target.value || null })}
              placeholder="https://…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white"
            />
            {post.media_url && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                {/\.(mp4|mov|webm)$/i.test(post.media_url) ? (
                  <video src={post.media_url} controls className="w-full max-h-48 object-contain" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.media_url} alt="media preview" className="w-full max-h-48 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
              </div>
            )}
          </Field>

          {/* Hashtags */}
          <Field label="Hashtags">
            <textarea
              value={post.hashtags ?? ''}
              onChange={e => onChange({ hashtags: e.target.value || null })}
              rows={2}
              placeholder="#hashtag1 #hashtag2 #hashtag3…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white resize-y"
              style={{ color: '#e91e8c' }}
            />
          </Field>

          {/* CTA URL */}
          <Field label="CTA / Link URL">
            <input
              value={post.cta_url ?? ''}
              onChange={e => onChange({ cta_url: e.target.value || null })}
              placeholder="https://…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white"
            />
          </Field>

          {/* Creative Brief */}
          <Field label="Creative Brief">
            <textarea
              value={post.creative_brief ?? ''}
              onChange={e => onChange({ creative_brief: e.target.value })}
              rows={3}
              placeholder="Describe the visual, design direction, or creative notes…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] bg-white resize-y"
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {saveStatus === 'saving' && (
              <>
                <svg className="w-3.5 h-3.5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-gray-400">Saving…</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-600 font-medium">Saved</span>
              </>
            )}
            {saveStatus === 'idle' && <span className="text-gray-300">All changes saved</span>}
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
            <span>{sc.label}</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .animate-slideIn { animation: slideIn 0.22s cubic-bezier(0.16,1,0.3,1) both; }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}

// ─── Day Popover ──────────────────────────────────────────────────────────────
function DayPopover({
  day,
  posts,
  anchorRef,
  colIndex,
  onClose,
  onAddPost,
  onExpand,
}: {
  day: Date
  posts: Post[]
  anchorRef: React.RefObject<HTMLDivElement | null>
  colIndex: number   // 0-6 (Mon-Sun)
  onClose: () => void
  onAddPost: () => void
  onExpand: (post: Post) => void
}) {
  const popRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    if (!anchorRef.current || !popRef.current) return
    const anchor = anchorRef.current.getBoundingClientRect()
    const popW = 280
    const popH = popRef.current.offsetHeight || 300
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Horizontal: prefer right of cell, flip left if no room
    let left = anchor.right + 8
    if (left + popW > vw - 16) left = anchor.left - popW - 8

    // Vertical: prefer aligning to top of cell, shift up if overflow
    let top = anchor.top
    if (top + popH > vh - 16) top = vh - popH - 16
    if (top < 8) top = 8

    setStyle({ position: 'fixed', top, left, width: popW, zIndex: 40 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  // close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    setTimeout(() => document.addEventListener('mousedown', handle), 0)
    return () => document.removeEventListener('mousedown', handle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dateLabel = day.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div ref={popRef} style={style} className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #fff0f7, #fdf4ff)' }}>
        <span className="text-sm font-bold text-gray-800">{dateLabel}</span>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/70 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Post list */}
      <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
        {posts.length === 0 ? (
          <div className="px-4 py-5 text-center">
            <p className="text-xs text-gray-400">No posts scheduled</p>
          </div>
        ) : (
          posts.map(post => {
            const pc = PLATFORM_COLOR[post.platform ?? ''] ?? PLATFORM_COLOR.linkedin
            const sc = STATUS_CONFIG[post.status as PostStatus] ?? STATUS_CONFIG.idea
            return (
              <div key={post.id} className="flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 group transition-colors">
                <div className={`w-1 rounded-full mt-0.5 shrink-0 self-stretch min-h-[1rem] ${pc.bar}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[10px] font-semibold ${pc.text}`}>{platformLabel(post.platform ?? '')}</span>
                    {post.post_time && <span className="text-[10px] text-gray-400">{post.post_time}</span>}
                  </div>
                  <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed">{post.concept || '(no concept)'}</p>
                  <span className={`mt-1 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sc.color}`}>
                    <span className={`w-1 h-1 rounded-full ${sc.dot}`} />
                    {sc.label}
                  </span>
                </div>
                <button
                  onClick={() => onExpand(post)}
                  title="Expand record"
                  className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-[#e91e8c]"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                  </svg>
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100">
        <button
          onClick={onAddPost}
          className="w-full text-xs font-semibold text-[#e91e8c] hover:bg-pink-50 rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New record
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const now = new Date()
  const [brandId, setBrandId]     = useState('')
  const [pillars, setPillars]     = useState<string[]>([])
  const [viewYear, setViewYear]   = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  const [weeks, setWeeks]   = useState<ContentWeek[]>([])
  const [posts, setPosts]   = useState<Post[]>([])
  const [loading, setLoading] = useState(false)

  // Popover state
  const [popoverDay, setPopoverDay] = useState<Date | null>(null)
  const [popoverCol, setPopoverCol] = useState(0)
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [anchorRef, setAnchorRef] = useState<React.RefObject<HTMLDivElement | null>>({ current: null })

  // Record modal
  const [modalPost, setModalPost]     = useState<Post | null>(null)
  const [modalDate, setModalDate]     = useState<Date | null>(null)
  const [saveStatus, setSaveStatus]   = useState<'idle' | 'saving' | 'saved'>('idle')
  // Debounce save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Brand
  useEffect(() => {
    const id = localStorage.getItem('selectedBrandId') ?? ''
    setBrandId(id)
    const h = () => { setBrandId(localStorage.getItem('selectedBrandId') ?? ''); setPopoverDay(null); setModalPost(null) }
    window.addEventListener('brandChanged', h)
    return () => window.removeEventListener('brandChanged', h)
  }, [])

  useEffect(() => {
    if (!brandId) return
    supabase.from('brands').select('pillars').eq('id', brandId).single()
      .then(({ data }) => setPillars(data?.pillars?.map((p: { name: string }) => p.name) ?? []))
  }, [brandId])

  const loadMonth = useCallback(async () => {
    if (!brandId) return
    setLoading(true)
    const days    = calendarDays(viewYear, viewMonth)
    const mondays = [...new Set(days.map(d => toYMD(monday(d))))]
    const { data: existingWeeks } = await supabase
      .from('content_weeks').select('*').eq('brand_id', brandId).in('week_start', mondays)
    const foundWeeks: ContentWeek[] = existingWeeks ?? []
    setWeeks(foundWeeks)
    if (foundWeeks.length > 0) {
      const { data: postsData } = await supabase
        .from('posts').select('*').in('content_week_id', foundWeeks.map(w => w.id)).order('day_of_week')
      setPosts(postsData ?? [])
    } else {
      setPosts([])
    }
    setLoading(false)
  }, [brandId, viewYear, viewMonth])

  useEffect(() => { loadMonth() }, [loadMonth])

  function changeMonth(delta: number) {
    setViewMonth(m => {
      const next = m + delta
      if (next < 0)  { setViewYear(y => y - 1); return 11 }
      if (next > 11) { setViewYear(y => y + 1); return 0  }
      return next
    })
    setPopoverDay(null)
    setModalPost(null)
  }

  function getWeekForDate(d: Date) { return weeks.find(w => w.week_start === toYMD(monday(d))) }
  function getPostsForDate(d: Date): Post[] {
    const w = getWeekForDate(d)
    if (!w) return []
    return posts.filter(p => p.content_week_id === w.id && p.day_of_week === isoDay(d))
  }

  async function ensureWeek(d: Date): Promise<ContentWeek | null> {
    const existing = getWeekForDate(d)
    if (existing) return existing
    const ws = toYMD(monday(d))
    const { data } = await supabase.from('content_weeks')
      .insert({ brand_id: brandId, week_start: ws, status: 'draft' }).select().single()
    if (data) setWeeks(prev => [...prev, data])
    return data
  }

  async function addPost(d: Date) {
    const week = await ensureWeek(d)
    if (!week) return
    const { data } = await supabase.from('posts').insert({
      content_week_id: week.id,
      brand_id: brandId,
      day_of_week: isoDay(d),
      platform: 'linkedin',
      status: 'idea',
      concept: '',
    }).select().single()
    if (data) {
      setPosts(prev => [...prev, data])
      setPopoverDay(null)
      setModalPost(data)
      setModalDate(d)
    }
  }

  function openExpand(post: Post, date: Date) {
    setPopoverDay(null)
    setModalPost(post)
    setModalDate(date)
  }

  function handleModalChange(patch: Partial<Post>) {
    if (!modalPost) return
    const updated = { ...modalPost, ...patch }
    setModalPost(updated)
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))

    // Debounce DB save with status feedback
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('posts').update(patch).eq('id', updated.id)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }, 600)
  }

  async function deletePost(id: string) {
    await supabase.from('posts').delete().eq('id', id)
    setPosts(prev => prev.filter(p => p.id !== id))
    setModalPost(null)
    setModalDate(null)
  }

  function handleCellClick(day: Date, colIdx: number, key: string) {
    if (popoverDay && toYMD(popoverDay) === toYMD(day)) {
      setPopoverDay(null)
      return
    }
    const ref = cellRefs.current.get(key)
    setAnchorRef({ current: ref ?? null })
    setPopoverCol(colIdx)
    setPopoverDay(new Date(day))
  }

  const days        = calendarDays(viewYear, viewMonth)
  const todayStr    = toYMD(now)
  const monthLabel  = new Date(viewYear, viewMonth).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  const popoverPosts = popoverDay ? getPostsForDate(popoverDay) : []

  if (!brandId) return <div className="text-gray-400 text-sm">Select a brand to get started.</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => changeMonth(-1)} className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-white hover:shadow-sm text-gray-500 transition-all">‹</button>
        <h2 className="text-base font-bold text-gray-900 w-48 text-center">{monthLabel}</h2>
        <button onClick={() => changeMonth(1)} className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-white hover:shadow-sm text-gray-500 transition-all">›</button>
        <button
          onClick={() => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()) }}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:shadow-sm transition-all"
        >
          Today
        </button>
        {loading && <span className="text-xs text-gray-400">Loading…</span>}
      </div>

      {/* Calendar grid */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200">
          {DAY_LABELS.map((d, i) => (
            <div key={d} className={`py-3 text-xs font-bold text-center tracking-wider ${i >= 5 ? 'text-gray-400' : 'text-gray-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const inMonth   = day.getMonth() === viewMonth
            const isToday   = toYMD(day) === todayStr
            const isWeekend = i % 7 >= 5
            const key       = toYMD(day)
            const colIdx    = i % 7
            const dayPosts  = getPostsForDate(day)
            const isOpen    = popoverDay && toYMD(popoverDay) === key

            return (
              <div
                key={i}
                ref={el => { if (el) cellRefs.current.set(key, el) }}
                onClick={() => handleCellClick(day, colIdx, key)}
                className={`
                  relative min-h-[110px] p-2 cursor-pointer transition-colors border-b border-r border-gray-100
                  ${!inMonth   ? 'bg-gray-50/70'     : isWeekend ? 'bg-gray-50/40' : 'bg-white'}
                  ${isOpen     ? 'ring-2 ring-inset ring-[#e91e8c]/30 bg-pink-50/30' : 'hover:bg-gray-50/80'}
                `}
              >
                {/* Day number */}
                <div className={`
                  w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold mb-1.5
                  ${isToday   ? 'text-white'      : inMonth ? 'text-gray-700' : 'text-gray-300'}
                  ${isToday && 'shadow-sm'}
                `}
                  style={isToday ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : undefined}
                >
                  {day.getDate()}
                </div>

                {/* Post chips */}
                <div className="space-y-0.5">
                  {dayPosts.slice(0, 3).map(post => {
                    const pc = PLATFORM_COLOR[post.platform ?? ''] ?? PLATFORM_COLOR.linkedin
                    return (
                      <div key={post.id} className={`flex items-center gap-1.5 rounded-md pl-1.5 pr-1 py-0.5 ${pc.bg} border border-transparent`}>
                        <span className={`w-1 h-1 rounded-full shrink-0 ${pc.bar}`} />
                        <span className={`text-[10px] font-medium truncate leading-tight ${pc.text}`}>
                          {post.concept || platformLabel(post.platform ?? '')}
                        </span>
                      </div>
                    )
                  })}
                  {dayPosts.length > 3 && (
                    <p className="text-[10px] text-gray-400 pl-1">+{dayPosts.length - 3} more</p>
                  )}
                  {dayPosts.length === 0 && inMonth && (
                    <p className="text-[10px] text-gray-300 pl-1 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">+ add</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Day popover */}
      {popoverDay && (
        <DayPopover
          day={popoverDay}
          posts={popoverPosts}
          anchorRef={anchorRef as React.RefObject<HTMLDivElement | null>}
          colIndex={popoverCol}
          onClose={() => setPopoverDay(null)}
          onAddPost={() => addPost(popoverDay)}
          onExpand={(post) => openExpand(post, popoverDay)}
        />
      )}

      {/* Record modal */}
      {modalPost && modalDate && (
        <RecordModal
          post={modalPost}
          date={modalDate}
          pillars={pillars}
          saveStatus={saveStatus}
          onClose={() => { setModalPost(null); setModalDate(null); setSaveStatus('idle') }}
          onChange={handleModalChange}
          onDelete={() => deletePost(modalPost.id)}
        />
      )}
    </div>
  )
}
