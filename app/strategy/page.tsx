'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Brand = {
  id: string
  name: string
  icp: { raw?: string; audience?: string } | null
  voice_tone: string | null
  pillars: Array<{ name: string; description: string }> | null
  offers: Array<{ name: string; description: string }> | null
  platforms: string[] | null
  brand_voice?: {
    personality_traits?: string[]
    writing_rules?: string[]
    vocab_use?: string[]
    vocab_avoid?: string[]
    example_posts?: string[]
    unique_markers?: string
  } | null
}

type Message = { role: 'user' | 'assistant'; content: string }

type SavedStrategy = {
  id: string
  title: string
  content: string
  type: 'remaining' | 'next-month' | null
  created_at: string
}

type GeneratedPost = {
  day_of_week: number
  platform: string
  pillar: string
  concept: string
  caption?: string
  hashtags?: string
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PLATFORM_DOT: Record<string, string> = {
  linkedin: 'bg-blue-500',
  facebook: 'bg-blue-700',
  instagram: 'bg-pink-500',
  twitter: 'bg-sky-400',
}

function nextMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
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
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-1 my-2 pl-1">
          {listBuffer}
        </ul>
      )
      listBuffer = []
    }
  }

  lines.forEach((line, i) => {
    if (line.startsWith('# ')) {
      flushList()
      elements.push(<h1 key={i} className="text-xl font-bold text-gray-900 mt-6 mb-2">{renderInline(line.slice(2))}</h1>)
    } else if (line.startsWith('## ')) {
      flushList()
      elements.push(
        <h2 key={i} className="text-base font-bold text-gray-900 mt-6 mb-2 pb-2 border-b border-gray-200">
          {renderInline(line.slice(3))}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      flushList()
      elements.push(
        <h3 key={i} className="text-sm font-semibold text-[#e91e8c] uppercase tracking-wide mt-4 mb-1">
          {renderInline(line.slice(4))}
        </h3>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(
        <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#e91e8c] shrink-0" />
          <span>{renderInline(line.slice(2))}</span>
        </li>
      )
    } else if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\. /)?.[1]
      listBuffer.push(
        <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
          <span className="shrink-0 font-semibold text-[#e91e8c] w-5 text-right">{num}.</span>
          <span>{renderInline(line.replace(/^\d+\. /, ''))}</span>
        </li>
      )
    } else if (line === '---' || line === '***') {
      flushList()
      elements.push(<hr key={i} className="border-gray-200 my-4" />)
    } else if (line === '') {
      flushList()
      elements.push(<div key={i} className="h-2" />)
    } else {
      flushList()
      elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed">{renderInline(line)}</p>)
    }
  })
  flushList()
  return <div>{elements}</div>
}

function strategyKey(brandId: string) {
  return `strategy_${brandId}`
}

export default function StrategyPage() {
  const [brand, setBrand] = useState<Brand | null>(null)
  const [loading, setLoading] = useState(true)

  // Monthly strategy
  const [strategy, setStrategy] = useState('')
  const [generatingStrategy, setGeneratingStrategy] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [strategySaved, setStrategySaved] = useState(false)
  const [strategySaveError, setStrategySaveError] = useState('')
  const [confirmReplace, setConfirmReplace] = useState<'next-month' | 'remaining' | null>(null)
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>([])
  const [showSavedPanel, setShowSavedPanel] = useState(false)
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null)
  const [viewStrategy, setViewStrategy] = useState<SavedStrategy | null>(null)

  // Week generation
  const [weekDate, setWeekDate] = useState(nextMonday)
  const [generatingWeek, setGeneratingWeek] = useState(false)
  const [weekPosts, setWeekPosts] = useState<GeneratedPost[]>([])
  const [savingToCal, setSavingToCal] = useState(false)
  const [savedToCal, setSavedToCal] = useState(false)
  const [savedPostIndices, setSavedPostIndices] = useState<Set<number>>(new Set())
  const [savingPostIndex, setSavingPostIndex] = useState<number | null>(null)
  const [weekError, setWeekError] = useState('')

  // Campaign chat
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  function loadBrand(brandId: string) {
    const draft = localStorage.getItem(strategyKey(brandId)) ?? ''
    setStrategy(draft)
    setEditMode(false)
    setWeekPosts([])
    setConfirmReplace(null)
    setActiveStrategyId(null)
    setShowSavedPanel(false)

    supabase.from('brands').select('*').eq('id', brandId).single().then(({ data }) => {
      if (data) setBrand(data)
      setLoading(false)
    })

    supabase.from('strategies').select('*').eq('brand_id', brandId).order('created_at', { ascending: false })
      .then(({ data }) => setSavedStrategies(data ?? []))
  }

  useEffect(() => {
    const brandId = localStorage.getItem('selectedBrandId')
    if (!brandId) { setLoading(false); return }
    loadBrand(brandId)

    const handler = () => {
      setLoading(true)
      setMessages([])
      const id = localStorage.getItem('selectedBrandId')
      if (!id) { setLoading(false); return }
      loadBrand(id)
    }
    window.addEventListener('brandChanged', handler)
    return () => window.removeEventListener('brandChanged', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  async function callStreamApi(msgs: Message[], mode: string) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs, brand, mode }),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.body!.getReader()
  }

  async function saveStrategy() {
    if (!brand || !strategy) return
    // Always keep localStorage in sync for navigation persistence
    localStorage.setItem(strategyKey(brand.id), strategy)
    setStrategySaveError('')

    const today = new Date()
    const monthLabel = today.toLocaleString('default', { month: 'long', year: 'numeric' })
    const title = activeStrategyId
      ? savedStrategies.find(s => s.id === activeStrategyId)?.title ?? monthLabel
      : `${monthLabel}`

    if (activeStrategyId) {
      // Update existing saved strategy
      const { error } = await supabase.from('strategies').update({ content: strategy, title }).eq('id', activeStrategyId)
      if (error) { setStrategySaveError(error.message); return }
      setSavedStrategies(prev => prev.map(s => s.id === activeStrategyId ? { ...s, content: strategy, title } : s))
    } else {
      // Save as new entry
      const { data, error } = await supabase.from('strategies').insert({
        brand_id: brand.id,
        title,
        content: strategy,
        type: null,
      }).select().single()
      if (error) { setStrategySaveError(error.message); return }
      if (data) {
        setSavedStrategies(prev => [data, ...prev])
        setActiveStrategyId(data.id)
      }
    }

    setStrategySaved(true)
    setTimeout(() => setStrategySaved(false), 2500)
  }

  async function deleteSavedStrategy(id: string) {
    await supabase.from('strategies').delete().eq('id', id)
    setSavedStrategies(prev => prev.filter(s => s.id !== id))
    if (activeStrategyId === id) {
      setActiveStrategyId(null)
    }
  }

  function loadSavedStrategy(s: SavedStrategy) {
    setStrategy(s.content)
    setActiveStrategyId(s.id)
    setEditMode(false)
    setWeekPosts([])
    setShowSavedPanel(false)
    if (brand) localStorage.setItem(strategyKey(brand.id), s.content)
  }

  async function generateStrategy(type: 'next-month' | 'remaining') {
    if (!brand || generatingStrategy) return
    setConfirmReplace(null)
    setGeneratingStrategy(true)
    setStrategy('')
    setEditMode(false)
    setWeekPosts([])

    const today = new Date()
    let prompt: string

    if (type === 'next-month') {
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      const label = nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' })
      prompt = `Create a full monthly content strategy for ${label} (the entire month).`
    } else {
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      const startLabel = today.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      const endLabel = endOfMonth.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      prompt = `Create a content strategy for the remaining days of this month, from today (${startLabel}) through to ${endLabel}. Start planning from today — do not include past dates.`
    }

    try {
      const reader = await callStreamApi([{ role: 'user', content: prompt }], 'strategy')
      const decoder = new TextDecoder()
      let text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setStrategy(text)
      }
      // Auto-save to localStorage for navigation persistence
      localStorage.setItem(strategyKey(brand.id), text)
      // Save to DB with an auto-title
      const today2 = new Date()
      const autoTitle = type === 'next-month'
        ? new Date(today2.getFullYear(), today2.getMonth() + 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
        : `${today2.toLocaleString('default', { month: 'long', year: 'numeric' })} · Remaining`
      const { data: saved } = await supabase.from('strategies').insert({
        brand_id: brand.id,
        title: autoTitle,
        content: text,
        type,
      }).select().single()
      if (saved) {
        setSavedStrategies(prev => [saved, ...prev])
        setActiveStrategyId(saved.id)
      }
    } catch (err) {
      setStrategy(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGeneratingStrategy(false)
    }
  }

  async function downloadPDF() {
    const element = document.getElementById('strategy-content')
    if (!element) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html2pdf = (await import('html2pdf.js')).default as any
    html2pdf().set({
      margin: [12, 14, 12, 14],
      filename: `${brand?.name ?? 'strategy'}-content-strategy.pdf`,
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(element).save()
  }

  async function generateWeekPosts() {
    if (!brand || !strategy || generatingWeek) return
    setGeneratingWeek(true)
    setWeekPosts([])
    setWeekError('')
    setSavedToCal(false)
    setSavedPostIndices(new Set())

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], brand, mode: 'weekly', strategy, weekStart: weekDate }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setWeekPosts(data.posts ?? [])
    } catch (err) {
      setWeekError(err instanceof Error ? err.message : String(err))
    } finally {
      setGeneratingWeek(false)
    }
  }

  async function getOrCreateWeek() {
    if (!brand) return null
    let { data: week } = await supabase
      .from('content_weeks')
      .select('id')
      .eq('brand_id', brand.id)
      .eq('week_start', weekDate)
      .single()
    if (!week) {
      const { data: newWeek } = await supabase
        .from('content_weeks')
        .insert({ brand_id: brand.id, week_start: weekDate, status: 'draft' })
        .select('id')
        .single()
      week = newWeek
    }
    return week
  }

  async function saveOneToCalendar(post: GeneratedPost, index: number) {
    if (!brand || savingPostIndex !== null) return
    setSavingPostIndex(index)
    const week = await getOrCreateWeek()
    if (!week) { setSavingPostIndex(null); return }
    await supabase.from('posts').insert({
      content_week_id: week.id,
      brand_id: brand.id,
      day_of_week: post.day_of_week,
      platform: post.platform,
      pillar: post.pillar || null,
      concept: post.concept,
      caption: post.caption || null,
      hashtags: post.hashtags || null,
      status: 'planning',
    })
    setSavedPostIndices(prev => new Set(prev).add(index))
    setSavingPostIndex(null)
  }

  async function saveToCalendar() {
    if (!brand || weekPosts.length === 0) return
    setSavingToCal(true)
    const week = await getOrCreateWeek()
    if (!week) { setSavingToCal(false); return }

    await supabase.from('posts').insert(
      weekPosts.map(p => ({
        content_week_id: week.id,
        brand_id: brand.id,
        day_of_week: p.day_of_week,
        platform: p.platform,
        pillar: p.pillar || null,
        concept: p.concept,
        caption: p.caption || null,
        hashtags: p.hashtags || null,
        status: 'planning',
      }))
    )

    setSavedPostIndices(new Set(weekPosts.map((_, i) => i)))
    setSavingToCal(false)
    setSavedToCal(true)
    setTimeout(() => setSavedToCal(false), 4000)
  }

  async function sendMessage() {
    if (!input.trim() || streaming || !brand) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    let assistantText = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const reader = await callStreamApi(newMessages, 'campaign')
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        assistantText += decoder.decode(value, { stream: true })
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: assistantText }
          return updated
        })
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}` }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading…</div>
  if (!brand) return <div className="text-gray-400 text-sm">Select a brand from the header to get started.</div>

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Content Strategy</h2>
          <p className="text-sm text-gray-400">Smart planning for <span className="font-medium text-gray-600">{brand.name}</span></p>
        </div>
        <button
          onClick={() => setShowSavedPanel(v => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
            showSavedPanel ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          Saved Strategies
          {savedStrategies.length > 0 && (
            <span className="bg-[#e91e8c] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
              {savedStrategies.length}
            </span>
          )}
        </button>
      </div>

      {/* Saved strategies panel */}
      {showSavedPanel && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Saved Strategies — {brand.name}</h3>
          </div>
          {savedStrategies.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-6 text-center">No saved strategies yet. Generate and save one above.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {savedStrategies.map(s => (
                <div key={s.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors group ${activeStrategyId === s.id ? 'bg-[#fce7f3]' : ''}`}>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadSavedStrategy(s)}>
                    <p className="text-sm font-medium text-gray-800 truncate">{s.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(s.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {s.type === 'next-month' && ' · Full Month'}
                      {s.type === 'remaining' && ' · Remaining'}
                    </p>
                  </div>
                  {activeStrategyId === s.id && (
                    <span className="text-xs text-[#e91e8c] font-medium shrink-0">Active</span>
                  )}
                  <button
                    onClick={() => setViewStrategy(s)}
                    title="View full strategy"
                    className="text-gray-300 hover:text-[#e91e8c] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => loadSavedStrategy(s)}
                    className="text-xs text-[#e91e8c] hover:underline shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteSavedStrategy(s.id)}
                    className="text-gray-200 hover:text-red-400 text-sm shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Monthly Strategy */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 gap-4">
          <div>
            <h3 className="font-semibold text-gray-900">Content Strategy</h3>
            <p className="text-xs text-gray-400 mt-0.5">AI-generated plan based on your brand</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {strategy && !generatingStrategy ? (
              <>
                <button
                  onClick={() => setConfirmReplace('remaining')}
                  className="px-3 py-2 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Remaining This Month
                </button>
                <button
                  onClick={() => setConfirmReplace('next-month')}
                  className="px-3 py-2 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Next Month
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => generateStrategy('remaining')}
                  disabled={generatingStrategy}
                  className="px-3 py-2 border border-[#e91e8c] text-[#e91e8c] text-xs font-medium rounded-lg hover:bg-[#fce7f3] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {generatingStrategy ? 'Generating…' : 'Remaining This Month'}
                </button>
                <button
                  onClick={() => generateStrategy('next-month')}
                  disabled={generatingStrategy}
                  className="px-3 py-2 bg-[#e91e8c] text-white text-xs font-medium rounded-lg hover:bg-[#be185d] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {generatingStrategy ? 'Generating…' : 'Next Month'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Confirm replace banner */}
        {confirmReplace && (
          <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-sm text-amber-800">
              This will replace your current strategy. Are you sure?
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmReplace(null)}
                className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => generateStrategy(confirmReplace)}
                className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors font-medium"
              >
                Yes, replace
              </button>
            </div>
          </div>
        )}

        {strategy ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
              <button
                onClick={() => setEditMode(e => !e)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  editMode ? 'bg-[#e91e8c] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {editMode ? 'Done Editing' : 'Edit'}
              </button>
              <button
                onClick={saveStrategy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  strategySaved
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : strategySaveError
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {strategySaved ? 'Saved!' : 'Save'}
              </button>
              {strategySaveError && (
                <span className="text-xs text-red-500 ml-1" title={strategySaveError}>
                  ⚠ Save failed — check DB table
                </span>
              )}
              <button
                onClick={downloadPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </button>
            </div>

            {/* Content */}
            <div id="strategy-content" className="px-6 py-5">
              {editMode ? (
                <textarea
                  value={strategy}
                  onChange={e => setStrategy(e.target.value)}
                  rows={30}
                  className="w-full text-sm font-mono text-gray-700 border border-gray-200 rounded-lg px-3 py-3 resize-y focus:outline-none focus:ring-1 focus:ring-[#e91e8c] leading-relaxed"
                />
              ) : (
                <MarkdownContent text={strategy} />
              )}
            </div>
          </>
        ) : (
          <div className="px-5 py-12 text-center text-gray-400 text-sm">
            {generatingStrategy
              ? <span className="animate-pulse">Building your strategy…</span>
              : 'Click Generate Plan to create your monthly content strategy'}
          </div>
        )}
      </div>

      {/* Generate Weekly Content */}
      {strategy && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Generate Weekly Content</h3>
            <p className="text-xs text-gray-400 mt-0.5">Turn the strategy above into actual post ideas for a specific week</p>
          </div>

          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Week starting</label>
                <input
                  type="date"
                  value={weekDate}
                  onChange={e => { setWeekDate(e.target.value); setWeekPosts([]); setSavedToCal(false) }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
                />
              </div>
              <div className="pt-5">
                <button
                  onClick={generateWeekPosts}
                  disabled={generatingWeek}
                  className="px-4 py-2 bg-[#e91e8c] text-white text-sm font-medium rounded-lg hover:bg-[#be185d] transition-colors disabled:opacity-50"
                >
                  {generatingWeek ? 'Generating…' : 'Generate Posts'}
                </button>
              </div>
            </div>

            {weekError && <p className="text-sm text-red-500 mb-3">{weekError}</p>}

            {weekPosts.length > 0 && (
              <div className="space-y-2">
                <div className="grid gap-2">
                  {weekPosts.map((post, i) => (
                    <div key={i} className="rounded-lg border border-gray-100 bg-gray-50">
                      {/* header */}
                      <div className="flex items-start gap-3 px-3 pt-3 pb-2">
                        <div className="flex items-center gap-2 shrink-0 w-28">
                          <span className="text-xs font-medium text-gray-500 w-8">{DAY_NAMES[post.day_of_week] ?? '?'}</span>
                          <span className={`w-2 h-2 rounded-full ${PLATFORM_DOT[post.platform] ?? 'bg-gray-300'}`} />
                          <span className="text-xs text-gray-500 capitalize">{post.platform}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-500 leading-snug">{post.concept}</p>
                          {post.pillar && (
                            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-[#fce7f3] text-[#e91e8c] font-medium">{post.pillar}</span>
                          )}
                        </div>
                      </div>
                      {/* caption */}
                      {post.caption && (
                        <div className="border-t border-gray-200 px-3 py-2.5 bg-white">
                          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{post.caption}</p>
                          {post.hashtags && (
                            <p className="text-[10px] text-[#e91e8c] mt-1.5 leading-relaxed">{post.hashtags}</p>
                          )}
                        </div>
                      )}
                      {/* per-post action */}
                      <div className="border-t border-gray-100 px-3 py-2 flex justify-end bg-gray-50">
                        <button
                          onClick={() => saveOneToCalendar(post, i)}
                          disabled={savedPostIndices.has(i) || savingPostIndex !== null}
                          className="text-xs font-medium px-3 py-1.5 rounded-md border transition-colors disabled:opacity-50"
                          style={savedPostIndices.has(i)
                            ? { borderColor: '#bbf7d0', background: '#f0fdf4', color: '#16a34a' }
                            : { borderColor: '#f9a8d4', background: '#fff', color: '#e91e8c' }}
                        >
                          {savingPostIndex === i ? 'Adding…' : savedPostIndices.has(i) ? '✓ Added to Calendar' : '+ Add to Calendar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={saveToCalendar}
                    disabled={savingToCal || savedToCal}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    {savingToCal ? 'Saving…' : savedToCal ? '✓ Added to Calendar' : 'Add to Calendar'}
                  </button>
                  {savedToCal && (
                    <span className="text-sm text-gray-400">Posts added — go to Calendar to review</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaign Chat Agent */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Campaign Planner</h3>
          <p className="text-xs text-gray-400 mt-0.5">Describe a campaign and get a detailed content plan</p>
        </div>

        <div>
          {/* Messages */}
          <div className="h-80 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-sm mt-12">
                <p className="font-medium mb-2">Campaign ideas to try:</p>
                <p className="text-xs">• "Plan a product launch campaign for next month"</p>
                <p className="text-xs">• "Create a holiday promotion campaign"</p>
                <p className="text-xs">• "Plan a week of awareness content around [topic]"</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  msg.role === 'user'
                    ? 'bg-[#e91e8c] text-white text-sm'
                    : 'bg-white border border-gray-200'
                }`}>
                  {msg.role === 'user'
                    ? <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    : msg.content
                      ? <MarkdownContent text={msg.content} />
                      : <span className="text-gray-400 text-sm animate-pulse">Thinking…</span>
                  }
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-3 bg-white flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Describe your campaign… (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="flex-1 resize-none text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
            />
            <button
              onClick={sendMessage}
              disabled={streaming || !input.trim()}
              className="px-4 py-2 bg-[#e91e8c] text-white text-sm font-medium rounded-lg hover:bg-[#be185d] transition-colors disabled:opacity-50 shrink-0"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Strategy viewer modal */}
      {viewStrategy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setViewStrategy(null) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #fff0f7, #fdf4ff)' }}>
              <div>
                <h3 className="font-bold text-gray-900">{viewStrategy.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(viewStrategy.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {viewStrategy.type === 'next-month' && ' · Full Month'}
                  {viewStrategy.type === 'remaining' && ' · Remaining This Month'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { loadSavedStrategy(viewStrategy); setViewStrategy(null) }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: '#e91e8c', color: '#e91e8c' }}
                >
                  Load this strategy
                </button>
                <button
                  onClick={() => setViewStrategy(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/70 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <MarkdownContent text={viewStrategy.content} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
