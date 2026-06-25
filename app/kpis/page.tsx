'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Post, KpiWeekly } from '@/types/database'

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(d: Date): string { return d.toISOString().split('T')[0] }
function formatWeekLabel(d: Date): string {
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

type KpiForm = {
  id?: string
  impressions: string
  reach: string
  engagement: string
  clicks: string
  followers_gained: string
  notes: string
}

const emptyForm = (): KpiForm => ({ impressions: '', reach: '', engagement: '', clicks: '', followers_gained: '', notes: '' })

export default function KpisPage() {
  const [brandId, setBrandId] = useState('')
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [posts, setPosts] = useState<Post[]>([])
  const [kpis, setKpis] = useState<Record<string, KpiForm>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [lastWeekKpis, setLastWeekKpis] = useState<KpiWeekly[]>([])

  useEffect(() => {
    const id = localStorage.getItem('selectedBrandId') ?? ''
    setBrandId(id)
    const handler = () => setBrandId(localStorage.getItem('selectedBrandId') ?? '')
    window.addEventListener('brandChanged', handler)
    return () => window.removeEventListener('brandChanged', handler)
  }, [])

  const loadData = useCallback(async () => {
    if (!brandId) return
    setLoading(true)
    const ws = formatDate(weekStart)

    // Get content_week
    const { data: week } = await supabase
      .from('content_weeks')
      .select('id')
      .eq('brand_id', brandId)
      .eq('week_start', ws)
      .single()

    if (!week) {
      setPosts([])
      setKpis({})
      setLoading(false)
      return
    }

    // Get posts
    const { data: postsData } = await supabase
      .from('posts')
      .select('*')
      .eq('content_week_id', week.id)
      .order('day_of_week')

    setPosts(postsData ?? [])

    // Get existing KPIs for this week
    const { data: kpiData } = await supabase
      .from('kpi_weekly')
      .select('*')
      .eq('brand_id', brandId)
      .eq('week_start', ws)

    const kpiMap: Record<string, KpiForm> = {}
    for (const post of postsData ?? []) {
      const existing = kpiData?.find(k => k.post_id === post.id)
      kpiMap[post.id] = existing ? {
        id: existing.id,
        impressions: existing.impressions?.toString() ?? '',
        reach: existing.reach?.toString() ?? '',
        engagement: existing.engagement?.toString() ?? '',
        clicks: existing.clicks?.toString() ?? '',
        followers_gained: existing.followers_gained?.toString() ?? '',
        notes: existing.notes ?? '',
      } : emptyForm()
    }
    setKpis(kpiMap)

    // Last week for comparison
    const lastWs = new Date(weekStart)
    lastWs.setDate(lastWs.getDate() - 7)
    const { data: lastKpiData } = await supabase
      .from('kpi_weekly')
      .select('*')
      .eq('brand_id', brandId)
      .eq('week_start', formatDate(lastWs))
    setLastWeekKpis(lastKpiData ?? [])

    setLoading(false)
  }, [brandId, weekStart])

  useEffect(() => { loadData() }, [loadData])

  function prevWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n }) }
  function nextWeek() { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n }) }

  async function saveKpi(postId: string) {
    const form = kpis[postId]
    const post = posts.find(p => p.id === postId)
    if (!form || !post) return
    setSaving(prev => ({ ...prev, [postId]: true }))
    const ws = formatDate(weekStart)
    const payload = {
      brand_id: brandId,
      post_id: postId,
      week_start: ws,
      platform: post.platform,
      impressions: form.impressions ? parseInt(form.impressions) : null,
      reach: form.reach ? parseInt(form.reach) : null,
      engagement: form.engagement ? parseInt(form.engagement) : null,
      clicks: form.clicks ? parseInt(form.clicks) : null,
      followers_gained: form.followers_gained ? parseInt(form.followers_gained) : null,
      notes: form.notes || null,
    }

    if (form.id) {
      await supabase.from('kpi_weekly').update(payload).eq('id', form.id)
    } else {
      const { data } = await supabase.from('kpi_weekly').insert(payload).select().single()
      if (data) setKpis(prev => ({ ...prev, [postId]: { ...prev[postId], id: data.id } }))
    }
    setSaving(prev => ({ ...prev, [postId]: false }))
  }

  function updateKpi(postId: string, field: keyof KpiForm, val: string) {
    setKpis(prev => ({ ...prev, [postId]: { ...prev[postId], [field]: val } }))
  }

  // Summary calculations
  const platformTotals: Record<string, { impressions: number; reach: number; engagement: number }> = {}
  const pillarTotals: Record<string, number> = {}
  let thisWeekEngagement = 0
  let lastWeekEngagement = 0

  for (const post of posts) {
    const form = kpis[post.id]
    if (!form) continue
    const eng = parseInt(form.engagement) || 0
    const imp = parseInt(form.impressions) || 0
    const rch = parseInt(form.reach) || 0
    thisWeekEngagement += eng
    const postPlatforms = post.platform ?? []
    for (const pl of postPlatforms) {
      if (!platformTotals[pl]) platformTotals[pl] = { impressions: 0, reach: 0, engagement: 0 }
      platformTotals[pl].impressions += imp
      platformTotals[pl].reach += rch
      platformTotals[pl].engagement += eng
    }
    if (post.pillar) {
      pillarTotals[post.pillar] = (pillarTotals[post.pillar] ?? 0) + eng
    }
  }
  for (const k of lastWeekKpis) { lastWeekEngagement += k.engagement ?? 0 }
  const engDiff = thisWeekEngagement - lastWeekEngagement
  const engDiffPct = lastWeekEngagement === 0 ? null : Math.round((engDiff / lastWeekEngagement) * 100)

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  if (!brandId) return <div className="text-gray-400 text-sm">Select a brand to view KPIs.</div>

  return (
    <div>
      {/* Week nav */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={prevWeek} className="px-2 py-1 text-gray-400 hover:text-gray-600 border border-gray-200 rounded">‹</button>
        <span className="text-sm font-medium text-gray-700">Week of {formatWeekLabel(weekStart)}</span>
        <button onClick={nextWeek} className="px-2 py-1 text-gray-400 hover:text-gray-600 border border-gray-200 rounded">›</button>
      </div>

      {loading ? <div className="text-gray-400 text-sm">Loading...</div> : (
        <div className="space-y-6">
          {/* KPI Entry Table */}
          {posts.length === 0 ? (
            <p className="text-gray-400 text-sm">No posts for this week. Create them in the Calendar first.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[140px_80px_80px_80px_80px_80px_1fr_80px] gap-0 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500">
                <div>Post</div>
                <div>Impr.</div>
                <div>Reach</div>
                <div>Engage.</div>
                <div>Clicks</div>
                <div>Followers</div>
                <div>Notes</div>
                <div></div>
              </div>
              {posts.map(post => (
                <div key={post.id} className="grid grid-cols-[140px_80px_80px_80px_80px_80px_1fr_80px] gap-0 px-4 py-2 border-b border-gray-50 last:border-0 items-center">
                  <div>
                    <div className="text-xs font-medium text-gray-700 truncate" title={post.concept ?? ''}>
                      {post.concept || '—'}
                    </div>
                    <div className="text-xs text-gray-400">{DAYS[(post.day_of_week ?? 1) - 1]} · {post.platform}</div>
                  </div>
                  {(['impressions', 'reach', 'engagement', 'clicks', 'followers_gained'] as const).map(field => (
                    <input
                      key={field}
                      type="number"
                      value={kpis[post.id]?.[field] ?? ''}
                      onChange={e => updateKpi(post.id, field, e.target.value)}
                      className="w-16 border border-gray-200 rounded px-1.5 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
                      placeholder="—"
                    />
                  ))}
                  <input
                    value={kpis[post.id]?.notes ?? ''}
                    onChange={e => updateKpi(post.id, 'notes', e.target.value)}
                    className="border border-gray-200 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c] w-full"
                    placeholder="Notes..."
                  />
                  <button
                    onClick={() => saveKpi(post.id)}
                    disabled={saving[post.id]}
                    className="ml-2 px-2 py-1 bg-[#e91e8c] text-white text-xs rounded hover:bg-[#be185d] transition-colors disabled:opacity-50"
                  >
                    {saving[post.id] ? '...' : 'Save'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {posts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* By Platform */}
              <div className="rounded-xl overflow-hidden shadow-sm border border-pink-100">
                <div className="px-4 py-3 text-white text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}>
                  By Platform
                </div>
                <div className="bg-white p-4">
                  {Object.keys(platformTotals).length === 0 ? (
                    <p className="text-xs text-gray-300">No data yet</p>
                  ) : (
                    <div className="space-y-2.5">
                      {Object.entries(platformTotals).sort((a, b) => b[1].engagement - a[1].engagement).map(([platform, t]) => (
                        <div key={platform} className="flex items-center justify-between text-xs">
                          <span className="capitalize font-medium text-gray-700">{platform}</span>
                          <div className="text-right">
                            <div className="font-semibold text-gray-900">{t.engagement.toLocaleString()} eng</div>
                            <div className="text-gray-400">{t.impressions.toLocaleString()} impr</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* By Pillar */}
              <div className="rounded-xl overflow-hidden shadow-sm border border-fuchsia-100">
                <div className="px-4 py-3 text-white text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #c026d3, #a21caf)' }}>
                  By Pillar
                </div>
                <div className="bg-white p-4">
                  {Object.keys(pillarTotals).length === 0 ? (
                    <p className="text-xs text-gray-300">No data yet</p>
                  ) : (
                    <div className="space-y-2.5">
                      {Object.entries(pillarTotals).sort((a, b) => b[1] - a[1]).map(([pillar, eng]) => (
                        <div key={pillar} className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700">{pillar}</span>
                          <span className="font-semibold text-gray-900">{eng.toLocaleString()} eng</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Week over week */}
              <div className="rounded-xl overflow-hidden shadow-sm border border-rose-100">
                <div className="px-4 py-3 text-white text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}>
                  Week vs Last Week
                </div>
                <div className="bg-white p-4">
                  <div className="text-3xl font-bold text-gray-900">{thisWeekEngagement.toLocaleString()}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Total engagement this week</div>
                  {engDiffPct !== null && (
                    <div className={`inline-flex items-center gap-1 mt-3 text-sm font-semibold px-2.5 py-1 rounded-full ${engDiff >= 0 ? 'bg-pink-50 text-pink-700' : 'bg-red-50 text-red-600'}`}>
                      {engDiff >= 0 ? '↑' : '↓'} {Math.abs(engDiffPct)}% vs last week
                    </div>
                  )}
                  {engDiffPct === null && lastWeekEngagement === 0 && (
                    <div className="text-xs text-gray-300 mt-1">No last week data</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
