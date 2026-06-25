'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Campaign = {
  id: string
  brand_id: string
  name: string
  offer_description: string | null
  date_start: string
  date_end: string
  goal: string | null
  status: 'draft' | 'plan_generated' | 'approved' | 'posts_created'
  created_at: string
}

const STATUS_STYLES: Record<Campaign['status'], { label: string; style: string }> = {
  draft:           { label: 'Draft',           style: 'bg-gray-100 text-gray-600' },
  plan_generated:  { label: 'Plan Ready',      style: 'bg-pink-100 text-pink-700' },
  approved:        { label: 'Approved',         style: 'bg-fuchsia-100 text-fuchsia-700' },
  posts_created:   { label: 'Posts Created',   style: 'bg-purple-100 text-purple-700' },
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  const e = new Date(end).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${s} – ${e}`
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [brandId, setBrandId] = useState('')

  useEffect(() => {
    const id = localStorage.getItem('selectedBrandId') ?? ''
    setBrandId(id)
    load(id)

    const handler = () => {
      const newId = localStorage.getItem('selectedBrandId') ?? ''
      setBrandId(newId)
      load(newId)
    }
    window.addEventListener('brandChanged', handler)
    return () => window.removeEventListener('brandChanged', handler)
  }, [])

  async function load(id: string) {
    if (!id) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('campaigns').select('*').eq('brand_id', id).order('created_at', { ascending: false })
    setCampaigns(data ?? [])
    setLoading(false)
  }

  if (!brandId) return <div className="text-gray-400 text-sm">Select a brand to view campaigns.</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Campaigns</h2>
          <p className="text-sm text-gray-400 mt-0.5">Offer-based campaign plans that push to your calendar</p>
        </div>
        <Link
          href="/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-xl transition-all hover:shadow-lg hover:-translate-y-0.5"
          style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Campaign
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-pink-100 rounded-2xl">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg, #fce7f3, #fdf4ff)' }}>
            <svg className="w-6 h-6 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <p className="font-semibold text-gray-700 mb-1">No campaigns yet</p>
          <p className="text-sm text-gray-400 mb-4">Create your first campaign to start planning offer-based content.</p>
          <Link href="/campaigns/new" className="text-sm font-medium" style={{ color: '#e91e8c' }}>
            Create a campaign →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const status = STATUS_STYLES[c.status]
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`}>
                <div className="bg-white border border-pink-50 rounded-2xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fce7f3, #fdf4ff)' }}>
                        <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDateRange(c.date_start, c.date_end)}{c.goal ? ` · ${c.goal}` : ''}</p>
                        {c.offer_description && (
                          <p className="text-sm text-gray-500 mt-1.5 line-clamp-1">{c.offer_description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.style}`}>{status.label}</span>
                      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
