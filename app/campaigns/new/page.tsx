'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const GOALS = [
  'Lead Generation', 'Sales / Conversions', 'Brand Awareness',
  'Product Launch', 'Event Promotion', 'Community Growth', 'Other',
]

type DurationType = 'monthly' | 'quarterly' | 'yearly'
type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'
type YearlyOption = 'remaining' | 'next'

type UploadedFile = {
  id: string
  name: string
  kind: 'pdf' | 'txt' | 'image'
  extractedText: string
  preview?: string
  analysis?: string
  analyzing?: boolean
}

type GDriveEntry = {
  id: string
  url: string
  fileId: string | null
  description: string
  analyzing?: boolean
  visualDescription?: string
  transcript?: string
  analyzed?: boolean
  analyzeError?: string
}

function extractGDriveId(url: string): string | null {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  return m?.[1] ?? null
}

function pad(n: number) { return String(n).padStart(2, '0') }

const QUARTER_RANGES: Record<Quarter, { label: string; start: [number, number]; end: [number, number] }> = {
  Q1: { label: 'Q1 · Jan – Mar', start: [0, 1],  end: [2, 31]  },
  Q2: { label: 'Q2 · Apr – Jun', start: [3, 1],  end: [5, 30]  },
  Q3: { label: 'Q3 · Jul – Sep', start: [6, 1],  end: [8, 30]  },
  Q4: { label: 'Q4 · Oct – Dec', start: [9, 1],  end: [11, 31] },
}

export default function NewCampaignPage() {
  const router = useRouter()
  const now    = new Date()
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')

  // ── Duration ──
  const [durationType, setDurationType]   = useState<DurationType>('monthly')
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter | null>(null)
  const [quarterYear, setQuarterYear]     = useState<'this' | 'next'>('this')
  const [yearlyOption, setYearlyOption]   = useState<YearlyOption | null>(null)
  const [dateStart, setDateStart]         = useState('')
  const [dateEnd, setDateEnd]             = useState('')

  // ── Basics ──
  const [name, setName]           = useState('')
  const [postsPerWeek, setPostsPerWeek] = useState('')

  // ── Offer ──
  const [offerDescription, setOfferDescription] = useState('')
  const [uploadedFiles, setUploadedFiles]        = useState<UploadedFile[]>([])
  const [uploading, setUploading]                = useState(false)

  // ── GDrive ──
  const [gdriveEntries, setGdriveEntries] = useState<GDriveEntry[]>([])
  const [gdriveInput, setGdriveInput]     = useState('')
  const [gdriveDesc, setGdriveDesc]       = useState('')

  // ── Goals ──
  const [landingPageUrl, setLandingPageUrl] = useState('')
  const [goal, setGoal]                     = useState('')
  const [targetLeads, setTargetLeads]       = useState('')
  const [targetSales, setTargetSales]       = useState('')

  // ── Duration helpers ──────────────────────────────────────────────────────
  function selectQuarter(q: Quarter) {
    setSelectedQuarter(q)
    const yr = quarterYear === 'this' ? now.getFullYear() : now.getFullYear() + 1
    const { start, end } = QUARTER_RANGES[q]
    setDateStart(`${yr}-${pad(start[0] + 1)}-${pad(start[1])}`)
    setDateEnd(`${yr}-${pad(end[0] + 1)}-${pad(end[1])}`)
  }

  function toggleQuarterYear(val: 'this' | 'next') {
    setQuarterYear(val)
    if (selectedQuarter) {
      const yr = val === 'this' ? now.getFullYear() : now.getFullYear() + 1
      const { start, end } = QUARTER_RANGES[selectedQuarter]
      setDateStart(`${yr}-${pad(start[0] + 1)}-${pad(start[1])}`)
      setDateEnd(`${yr}-${pad(end[0] + 1)}-${pad(end[1])}`)
    }
  }

  function selectYearly(opt: YearlyOption) {
    setYearlyOption(opt)
    if (opt === 'remaining') {
      const today = now.toISOString().split('T')[0]
      setDateStart(today)
      setDateEnd(`${now.getFullYear()}-12-31`)
    } else {
      const ny = now.getFullYear() + 1
      setDateStart(`${ny}-01-01`)
      setDateEnd(`${ny}-12-31`)
    }
  }

  function switchDurationType(t: DurationType) {
    setDurationType(t)
    setDateStart('')
    setDateEnd('')
    setSelectedQuarter(null)
    setYearlyOption(null)
  }

  // ── File upload ──────────────────────────────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setUploading(true)

    for (const file of files) {
      const id      = crypto.randomUUID()
      const isImage = /\.(png|jpe?g|gif|webp)$/i.test(file.name) || file.type.startsWith('image/')
      const isPdf   = file.type === 'application/pdf' || file.name.endsWith('.pdf')

      if (isImage) {
        const dataUrl = await new Promise<string>(resolve => {
          const reader = new FileReader()
          reader.onload = ev => resolve(ev.target?.result as string)
          reader.readAsDataURL(file)
        })
        setUploadedFiles(prev => [...prev, { id, name: file.name, kind: 'image', extractedText: '', preview: dataUrl, analyzing: true }])
        try {
          const res  = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [], brand: { name: '', pillars: null, platforms: null, offers: null, voice_tone: null, icp: null }, mode: 'analyze-image', imageDataUrl: dataUrl }),
          })
          const data = await res.json()
          setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, analysis: data.description ?? '', analyzing: false } : f))
        } catch {
          setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, analyzing: false } : f))
        }

      } else if (isPdf) {
        setUploadedFiles(prev => [...prev, { id, name: file.name, kind: 'pdf', extractedText: '', analyzing: true }])
        try {
          const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
          GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
          const buffer = await file.arrayBuffer()
          const pdf    = await getDocument({ data: buffer }).promise
          const pages  = await Promise.all(
            Array.from({ length: pdf.numPages }, (_, i) =>
              pdf.getPage(i + 1).then(p => p.getTextContent()).then(tc =>
                tc.items.map((item: { str?: string }) => item.str ?? '').join(' ')
              )
            )
          )
          setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, extractedText: pages.join('\n\n'), analyzing: false } : f))
        } catch {
          setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, analyzing: false } : f))
        }

      } else {
        const text = await file.text()
        setUploadedFiles(prev => [...prev, { id, name: file.name, kind: 'txt', extractedText: text }])
      }
    }
    setUploading(false)
  }

  function removeFile(id: string) { setUploadedFiles(prev => prev.filter(f => f.id !== id)) }

  // ── GDrive ───────────────────────────────────────────────────────────────
  function addGDrive() {
    const url = gdriveInput.trim()
    if (!url) return
    const fileId = extractGDriveId(url)
    setGdriveEntries(prev => [...prev, { id: crypto.randomUUID(), url, fileId, description: gdriveDesc.trim() }])
    setGdriveInput('')
    setGdriveDesc('')
  }

  function removeGDrive(id: string) { setGdriveEntries(prev => prev.filter(e => e.id !== id)) }

  async function analyzeGDrive(id: string) {
    const entry = gdriveEntries.find(e => e.id === id)
    if (!entry?.fileId) return
    setGdriveEntries(prev => prev.map(e => e.id === id ? { ...e, analyzing: true, analyzeError: undefined } : e))
    try {
      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], brand: { name: '', pillars: null, platforms: null, offers: null, voice_tone: null, icp: null }, mode: 'analyze-gdrive', fileId: entry.fileId }),
      })
      const data = await res.json()
      setGdriveEntries(prev => prev.map(e => e.id === id ? { ...e, analyzing: false, analyzed: true, visualDescription: data.visualDescription ?? '', transcript: data.transcript ?? '', analyzeError: data.error } : e))
    } catch (err) {
      setGdriveEntries(prev => prev.map(e => e.id === id ? { ...e, analyzing: false, analyzeError: err instanceof Error ? err.message : 'Analysis failed' } : e))
    }
  }

  // ── Build context ────────────────────────────────────────────────────────
  function buildCombinedOffer(): string {
    const parts: string[] = []
    if (offerDescription.trim()) parts.push(offerDescription.trim())
    for (const f of uploadedFiles) {
      if (f.kind === 'image' && f.analysis) parts.push(`[Image: ${f.name}]\n${f.analysis}`)
      else if (f.extractedText) parts.push(`[File: ${f.name}]\n${f.extractedText}`)
    }
    return parts.join('\n\n---\n\n')
  }

  function buildVideoContext(): string {
    if (gdriveEntries.length === 0) return ''
    return gdriveEntries.map(e => {
      const lines = [`- Google Drive video: ${e.url}`]
      if (e.description)       lines.push(`  User description: ${e.description}`)
      if (e.visualDescription) lines.push(`  Visual analysis: ${e.visualDescription}`)
      if (e.transcript)        lines.push(`  Transcript: ${e.transcript}`)
      return lines.join('\n')
    }).join('\n\n')
  }

  async function handleCreate() {
    setCreateError('')
    if (!name || !dateStart || !dateEnd) return
    const brandId = localStorage.getItem('selectedBrandId')
    if (!brandId) {
      setCreateError('No brand selected. Please select a brand before creating a campaign.')
      return
    }
    setSaving(true)
    const { data, error } = await supabase.from('campaigns').insert({
      brand_id:          brandId,
      name,
      offer_description: buildCombinedOffer() || null,
      offer_file_name:   uploadedFiles.length > 0 ? uploadedFiles.map(f => f.name).join(', ') : null,
      date_start:        dateStart,
      date_end:          dateEnd,
      landing_page_url:  landingPageUrl || null,
      goal:              goal || null,
      target_leads:      targetLeads ? parseInt(targetLeads) : null,
      target_sales:      targetSales ? parseInt(targetSales) : null,
      video_context:     buildVideoContext() || null,
      duration_type:     durationType,
      posts_per_week:    postsPerWeek ? parseInt(postsPerWeek) : null,
      status:            'draft',
    }).select().single()
    setSaving(false)
    if (error) {
      setCreateError(error.message)
      return
    }
    if (data) router.push(`/campaigns/${data.id}`)
  }

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] transition-colors bg-white"
  const labelClass = "block text-sm font-semibold text-gray-700 mb-1.5"
  const canCreate  = !!name && !!dateStart && !!dateEnd && !uploadedFiles.some(f => f.analyzing)

  const durationReady = durationType === 'monthly'
    ? !!dateStart && !!dateEnd
    : durationType === 'quarterly'
      ? !!selectedQuarter
      : !!yearlyOption

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">New Campaign</h2>
          <p className="text-xs text-gray-400 mt-0.5">Set up an offer-based campaign to plan and schedule content</p>
        </div>
      </div>

      <div className="space-y-6">

        {/* ── 1. Campaign basics ── */}
        <div className="bg-white rounded-2xl border border-pink-50 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <Pill>1</Pill> Campaign basics
          </h3>
          <div className="space-y-5">
            <div>
              <label className={labelClass}>Campaign name <span className="text-pink-400">*</span></label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Summer Sale Launch" className={inputClass} />
            </div>

            {/* Duration type */}
            <div>
              <label className={labelClass}>Campaign duration</label>
              <div className="flex gap-2 mb-4">
                {(['monthly', 'quarterly', 'yearly'] as DurationType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => switchDurationType(t)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all capitalize ${
                      durationType === t
                        ? 'text-white border-transparent shadow-sm'
                        : 'border-gray-200 text-gray-500 hover:border-pink-200 hover:text-[#e91e8c]'
                    }`}
                    style={durationType === t ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Monthly — free date range */}
              {durationType === 'monthly' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Start date <span className="text-pink-400">*</span></label>
                    <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>End date <span className="text-pink-400">*</span></label>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className={inputClass} />
                  </div>
                </div>
              )}

              {/* Quarterly — Q1–Q4 snap */}
              {durationType === 'quarterly' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(['this', 'next'] as const).map(y => (
                      <button
                        key={y}
                        onClick={() => toggleQuarterYear(y)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          quarterYear === y ? 'border-[#e91e8c] text-[#e91e8c] bg-pink-50' : 'border-gray-200 text-gray-500 hover:border-pink-200'
                        }`}
                      >
                        {y === 'this' ? now.getFullYear() : now.getFullYear() + 1}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(QUARTER_RANGES) as [Quarter, typeof QUARTER_RANGES[Quarter]][]).map(([q, { label }]) => (
                      <button
                        key={q}
                        onClick={() => selectQuarter(q)}
                        className={`py-3 rounded-xl text-sm font-semibold border transition-all ${
                          selectedQuarter === q
                            ? 'text-white border-transparent shadow-sm'
                            : 'border-gray-200 text-gray-600 hover:border-pink-200 hover:text-[#e91e8c]'
                        }`}
                        style={selectedQuarter === q ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {dateStart && dateEnd && (
                    <p className="text-xs text-gray-400">
                      {new Date(dateStart).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })} →{' '}
                      {new Date(dateEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              )}

              {/* Yearly — remaining or next year */}
              {durationType === 'yearly' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => selectYearly('remaining')}
                      className={`py-4 rounded-xl border text-sm font-semibold transition-all ${
                        yearlyOption === 'remaining'
                          ? 'text-white border-transparent shadow-sm'
                          : 'border-gray-200 text-gray-600 hover:border-pink-200 hover:text-[#e91e8c]'
                      }`}
                      style={yearlyOption === 'remaining' ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}
                    >
                      <div>Remaining {now.getFullYear()}</div>
                      <div className={`text-xs mt-0.5 font-normal ${yearlyOption === 'remaining' ? 'text-pink-100' : 'text-gray-400'}`}>
                        Today → Dec 31
                      </div>
                    </button>
                    <button
                      onClick={() => selectYearly('next')}
                      className={`py-4 rounded-xl border text-sm font-semibold transition-all ${
                        yearlyOption === 'next'
                          ? 'text-white border-transparent shadow-sm'
                          : 'border-gray-200 text-gray-600 hover:border-pink-200 hover:text-[#e91e8c]'
                      }`}
                      style={yearlyOption === 'next' ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}
                    >
                      <div>Next Year {now.getFullYear() + 1}</div>
                      <div className={`text-xs mt-0.5 font-normal ${yearlyOption === 'next' ? 'text-pink-100' : 'text-gray-400'}`}>
                        Jan 1 → Dec 31
                      </div>
                    </button>
                  </div>
                  {yearlyOption && (
                    <div className="flex items-start gap-2 bg-pink-50/60 border border-pink-100 rounded-xl px-4 py-3 text-xs text-gray-600">
                      <svg className="w-3.5 h-3.5 text-[#e91e8c] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      The AI will generate a full year strategy broken down month by month. You can then generate posts one month at a time.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Posts per week */}
            <div>
              <label className={labelClass}>
                Posts per week <span className="font-normal text-gray-400">(optional — default 3–5)</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={postsPerWeek}
                  onChange={e => setPostsPerWeek(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-32 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] transition-colors bg-white"
                />
                <div className="flex gap-1.5">
                  {[3, 5, 7].map(n => (
                    <button
                      key={n}
                      onClick={() => setPostsPerWeek(String(n))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        postsPerWeek === String(n) ? 'border-[#e91e8c] text-[#e91e8c] bg-pink-50' : 'border-gray-200 text-gray-500 hover:border-pink-200'
                      }`}
                    >
                      {n}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Offer details ── */}
        <div className="bg-white rounded-2xl border border-pink-50 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <Pill>2</Pill> Offer / product details
          </h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Offer description</label>
              <textarea value={offerDescription} onChange={e => setOfferDescription(e.target.value)} rows={5} placeholder="Describe the offer, product or tool — features, benefits, pricing, key selling points…" className={inputClass + ' resize-y'} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={labelClass.replace(' mb-1.5', '')}>Attach files</label>
                <label className={`cursor-pointer text-xs font-medium transition-colors ${uploading ? 'text-gray-400' : 'hover:underline'}`} style={{ color: uploading ? undefined : '#e91e8c' }}>
                  {uploading ? 'Processing…' : '↑ Upload files'}
                  <input type="file" accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.gif,.webp" multiple className="hidden" disabled={uploading} onChange={handleFileUpload} />
                </label>
              </div>
              <p className="text-xs text-gray-400 mb-3">PDF, TXT, PNG, JPG. Images are auto-analyzed by AI.</p>
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadedFiles.map(f => (
                    <div key={f.id} className="border border-pink-100 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-pink-50/30">
                        {f.kind === 'image' && f.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.preview} alt={f.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-pink-100" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white border border-pink-100 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{f.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {f.analyzing ? <span className="text-pink-500 animate-pulse">{f.kind === 'image' ? 'Analyzing with AI…' : 'Extracting text…'}</span>
                              : f.kind === 'image' ? (f.analysis ? 'AI analysis ready' : 'Image attached')
                              : f.extractedText ? `${f.extractedText.length.toLocaleString()} chars extracted` : 'Attached'}
                          </p>
                        </div>
                        <button onClick={() => removeFile(f.id)} className="text-gray-300 hover:text-red-400 shrink-0 text-sm">✕</button>
                      </div>
                      {f.kind === 'image' && f.analysis && (
                        <div className="px-3 py-2 border-t border-pink-100 bg-white">
                          <p className="text-xs text-gray-500 font-medium mb-1">AI analysis</p>
                          <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{f.analysis}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 3. Video material ── */}
        <div className="bg-white rounded-2xl border border-pink-50 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-1 flex items-center gap-2">
            <Pill>3</Pill> Video material
            <span className="text-xs font-normal text-gray-400 ml-1">optional</span>
          </h3>
          <p className="text-xs text-gray-400 mb-4 ml-7">Paste Google Drive video links. Analyze them so the AI truly understands the content.</p>
          <div className="space-y-3">
            {gdriveEntries.map(e => {
              const thumbUrl = e.fileId ? `https://drive.google.com/thumbnail?id=${e.fileId}&sz=w200` : null
              return (
                <div key={e.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-start gap-3 px-3 py-2.5">
                    {thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbUrl} alt="thumbnail" className="w-16 h-10 rounded-lg object-cover shrink-0 border border-gray-100 bg-gray-100" onError={ev => { (ev.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <div className="w-16 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-blue-600 truncate">{e.url}</p>
                      {e.description && <p className="text-xs text-gray-500 mt-0.5">{e.description}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        {e.analyzed ? (
                          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            {e.transcript ? 'Transcript + visual ready' : e.visualDescription ? 'Visual analysis ready' : 'Analyzed'}
                          </span>
                        ) : e.analyzing ? (
                          <span className="text-xs text-pink-500 animate-pulse flex items-center gap-1">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                            Analyzing…
                          </span>
                        ) : e.fileId ? (
                          <button onClick={() => analyzeGDrive(e.id)} className="text-xs font-semibold underline" style={{ color: '#e91e8c' }}>Analyze video</button>
                        ) : (
                          <span className="text-xs text-gray-400">Invalid Drive URL</span>
                        )}
                        {e.analyzeError && <span className="text-xs text-red-400">⚠ Make sure file is publicly shared</span>}
                      </div>
                    </div>
                    <button onClick={() => removeGDrive(e.id)} className="text-gray-300 hover:text-red-400 text-sm shrink-0">✕</button>
                  </div>
                  {(e.visualDescription || e.transcript) && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {e.visualDescription && (
                        <div className="px-3 py-2.5 bg-purple-50/30">
                          <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide mb-1">Visual analysis</p>
                          <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{e.visualDescription}</p>
                        </div>
                      )}
                      {e.transcript && (
                        <div className="px-3 py-2.5 bg-blue-50/30">
                          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Transcript</p>
                          <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{e.transcript}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="border border-dashed border-gray-200 rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Google Drive URL</label>
                <input value={gdriveInput} onChange={e => setGdriveInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGDrive() } }} placeholder="https://drive.google.com/file/d/…" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">What is this video about? <span className="font-normal text-gray-400">(optional)</span></label>
                <input value={gdriveDesc} onChange={e => setGdriveDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGDrive() } }} placeholder="e.g. Product demo, 2 mins, casual tone…" className={inputClass} />
              </div>
              <button onClick={addGDrive} disabled={!gdriveInput.trim()} className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40" style={{ borderColor: '#e91e8c', color: '#e91e8c' }}>
                + Add video
              </button>
            </div>
          </div>
        </div>

        {/* ── 4. Goals ── */}
        <div className="bg-white rounded-2xl border border-pink-50 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <Pill>4</Pill> Goals & tracking
          </h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Landing page URL</label>
              <input value={landingPageUrl} onChange={e => setLandingPageUrl(e.target.value)} placeholder="https://yoursite.com/offer" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Campaign goal</label>
              <select value={goal} onChange={e => setGoal(e.target.value)} className={inputClass}>
                <option value="">Select a goal…</option>
                {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Target leads <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="number" value={targetLeads} onChange={e => setTargetLeads(e.target.value)} placeholder="e.g. 50" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Target sales <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="number" value={targetSales} onChange={e => setTargetSales(e.target.value)} placeholder="e.g. 10" className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        {createError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
            {createError}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCreate}
            disabled={saving || !canCreate || !durationReady}
            className="px-6 py-2.5 text-white text-sm font-semibold rounded-xl transition-all hover:shadow-lg disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}
          >
            {saving ? 'Creating…' : 'Create Campaign →'}
          </button>
          {uploadedFiles.some(f => f.analyzing) && (
            <span className="text-xs text-gray-400 animate-pulse">Waiting for AI analysis…</span>
          )}
          {!uploadedFiles.some(f => f.analyzing) && (
            <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          )}
        </div>
      </div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold shrink-0" style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}>
      {children}
    </span>
  )
}
