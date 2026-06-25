'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Pillar = { name: string; description: string }
type Offer = { name: string; description: string }
type BrandColor = { name: string; hex: string }
type GHLAccount = { id: string; name: string; type: string }

// Extract audio from a video file, downsample to 16kHz mono WAV for Whisper
async function extractAudioAsWav(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer()
  const audioContext = new AudioContext()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  await audioContext.close()

  const targetSampleRate = 16000
  const targetLength = Math.floor(audioBuffer.duration * targetSampleRate)
  const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate)
  const source = offlineCtx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(offlineCtx.destination)
  source.start()
  const rendered = await offlineCtx.startRendering()

  // Encode as 16-bit PCM WAV
  const numSamples = rendered.length
  const dataSize = numSamples * 2
  const wav = new ArrayBuffer(44 + dataSize)
  const v = new DataView(wav)
  const write = (offset: number, val: number, size: 1 | 2 | 4, le = true) =>
    size === 4 ? v.setUint32(offset, val, le) : size === 2 ? v.setUint16(offset, val, le) : v.setUint8(offset, val)
  // RIFF header
  ;[0x52,0x49,0x46,0x46].forEach((b,i) => write(i, b, 1))
  write(4, 36 + dataSize, 4)
  ;[0x57,0x41,0x56,0x45].forEach((b,i) => write(8+i, b, 1))
  // fmt chunk
  ;[0x66,0x6d,0x74,0x20].forEach((b,i) => write(12+i, b, 1))
  write(16, 16, 4); write(20, 1, 2); write(22, 1, 2)
  write(24, targetSampleRate, 4); write(28, targetSampleRate * 2, 4)
  write(32, 2, 2); write(34, 16, 2)
  // data chunk
  ;[0x64,0x61,0x74,0x61].forEach((b,i) => write(36+i, b, 1))
  write(40, dataSize, 4)
  const samples = rendered.getChannelData(0)
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    v.setInt16(offset, Math.max(-1, Math.min(1, samples[i])) * 0x7FFF, true)
    offset += 2
  }
  return new Blob([wav], { type: 'audio/wav' })
}

function extractColorsFromImage(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 100
      canvas.height = 100
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, 100, 100)
      const px = ctx.getImageData(0, 0, 100, 100).data
      URL.revokeObjectURL(url)

      const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {}
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue
        const r = Math.round(px[i] / 24) * 24
        const g = Math.round(px[i + 1] / 24) * 24
        const b = Math.round(px[i + 2] / 24) * 24
        if (r > 235 && g > 235 && b > 235) continue // skip near-white
        if (r < 20 && g < 20 && b < 20) continue    // skip near-black
        const key = `${r},${g},${b}`
        if (!buckets[key]) buckets[key] = { r: px[i], g: px[i + 1], b: px[i + 2], count: 0 }
        buckets[key].count++
      }

      const top = Object.values(buckets)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)

      resolve(top.map(({ r, g, b }) =>
        '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
      ))
    }
    img.src = url
  })
}

export default function BrandEditPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [icpUploading, setIcpUploading] = useState(false)

  const [name, setName] = useState('')
  const [colors, setColors] = useState<BrandColor[]>([{ name: 'Primary', hex: '' }])
  const [icpRaw, setIcpRaw] = useState('')
  const [icpPdfName, setIcpPdfName] = useState('')
  const [voiceTone, setVoiceTone] = useState('')
  const [pillars, setPillars] = useState<Pillar[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [platforms, setPlatforms] = useState<string[]>(['linkedin', 'facebook'])

  const [brandVoice, setBrandVoice] = useState<{
    personality_traits: string[]
    writing_rules: string[]
    vocab_use: string[]
    vocab_avoid: string[]
    example_posts: string[]
    unique_markers: string
    video_transcript: string
  }>({
    personality_traits: [],
    writing_rules: [],
    vocab_use: [],
    vocab_avoid: [],
    example_posts: ['', '', ''],
    unique_markers: '',
    video_transcript: '',
  })
  const [analyzing, setAnalyzing] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeStatus, setTranscribeStatus] = useState('')
  const [analyzeError, setAnalyzeError] = useState('')
  const [newTrait, setNewTrait] = useState('')
  const [newVocabUse, setNewVocabUse] = useState('')
  const [newVocabAvoid, setNewVocabAvoid] = useState('')

  // GHL integration
  const [ghlLocationId, setGhlLocationId] = useState('')
  const [ghlApiKey, setGhlApiKey] = useState('')
  const [ghlFetchedAccounts, setGhlFetchedAccounts] = useState<GHLAccount[]>([])
  const [ghlMapping, setGhlMapping] = useState<Record<string, string>>({})
  const [ghlTesting, setGhlTesting] = useState(false)
  const [ghlStatus, setGhlStatus] = useState<'idle' | 'connected' | 'error'>('idle')
  const [ghlError, setGhlError] = useState('')

  // Keep latest state in refs so auto-save always uses fresh values
  const stateRef = useRef({ name, colors, icpRaw, icpPdfName, voiceTone, pillars, offers, platforms, brandVoice, ghlLocationId, ghlApiKey, ghlFetchedAccounts, ghlMapping })
  useEffect(() => {
    stateRef.current = { name, colors, icpRaw, icpPdfName, voiceTone, pillars, offers, platforms, brandVoice, ghlLocationId, ghlApiKey, ghlFetchedAccounts, ghlMapping }
  })

  // Load brand from DB
  useEffect(() => {
    supabase.from('brands').select('*').eq('id', id).single().then(({ data }) => {
      if (!data) return
      setName(data.name)

      // Support new colors[] format and old primary/accent format
      if (data.brand_colors?.colors?.length) {
        setColors(data.brand_colors.colors)
      } else {
        const migrated: BrandColor[] = []
        if (data.brand_colors?.primary) migrated.push({ name: 'Primary', hex: data.brand_colors.primary })
        if (data.brand_colors?.accent) migrated.push({ name: 'Accent', hex: data.brand_colors.accent })
        setColors(migrated.length ? migrated : [{ name: 'Primary', hex: '' }])
      }

      setIcpRaw(data.icp?.raw ?? data.icp?.audience ?? '')
      setIcpPdfName(data.icp?.pdf_name ?? '')
      setVoiceTone(data.voice_tone ?? '')
      setPillars(data.pillars ?? [])
      setOffers(data.offers ?? [])
      setPlatforms(data.platforms ?? ['linkedin', 'facebook'])
      if (data.brand_voice) {
        setBrandVoice({
          personality_traits: data.brand_voice.personality_traits ?? [],
          writing_rules: data.brand_voice.writing_rules ?? [],
          vocab_use: data.brand_voice.vocab_use ?? [],
          vocab_avoid: data.brand_voice.vocab_avoid ?? [],
          example_posts: data.brand_voice.example_posts?.length ? data.brand_voice.example_posts : ['', '', ''],
          unique_markers: data.brand_voice.unique_markers ?? '',
          video_transcript: data.brand_voice.video_transcript ?? '',
        })
      }
      setGhlLocationId(data.ghl_location_id ?? '')
      setGhlApiKey(data.ghl_api_key ?? '')
      if (data.ghl_accounts) {
        setGhlFetchedAccounts(data.ghl_accounts.accounts ?? [])
        setGhlMapping(data.ghl_accounts.mapping ?? {})
        if ((data.ghl_accounts.accounts ?? []).length > 0) setGhlStatus('connected')
      }
      setLoading(false)
    })
  }, [id])

  // Auto-save: debounce 2s after any change
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (loading) return
    setIsDirty(true)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      const s = stateRef.current
      await supabase.from('brands').update({
        name: s.name,
        brand_colors: { colors: s.colors },
        icp: { raw: s.icpRaw, pdf_name: s.icpPdfName || null },
        voice_tone: s.voiceTone,
        pillars: s.pillars,
        offers: s.offers,
        platforms: s.platforms,
        brand_voice: s.brandVoice,
        ghl_location_id: s.ghlLocationId || null,
        ghl_api_key: s.ghlApiKey || null,
        ghl_accounts: s.ghlFetchedAccounts.length > 0
          ? { accounts: s.ghlFetchedAccounts, mapping: s.ghlMapping }
          : null,
      }).eq('id', id)
      setIsDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 2000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, colors, icpRaw, icpPdfName, voiceTone, pillars, offers, platforms, brandVoice, ghlLocationId, ghlApiKey, ghlFetchedAccounts, ghlMapping, loading])

  // Warn on browser refresh/close if mid-type (before debounce fires)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    const { error } = await supabase.from('brands').update({
      name,
      brand_colors: { colors },
      icp: { raw: icpRaw, pdf_name: icpPdfName || null },
      voice_tone: voiceTone,
      pillars,
      offers,
      platforms,
      brand_voice: brandVoice,
      ghl_location_id: ghlLocationId || null,
      ghl_api_key: ghlApiKey || null,
      ghl_accounts: ghlFetchedAccounts.length > 0
        ? { accounts: ghlFetchedAccounts, mapping: ghlMapping }
        : null,
    }).eq('id', id)
    setSaving(false)
    if (error) {
      setSaveError(error.message)
    } else {
      setIsDirty(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true)
    const hexColors = await extractColorsFromImage(file)
    const names = ['Primary', 'Accent', 'Color 3', 'Color 4', 'Color 5', 'Color 6']
    setColors(hexColors.map((hex, i) => ({ name: names[i] ?? `Color ${i + 1}`, hex })))
    setExtracting(false)
    e.target.value = ''
  }

  function addColor() {
    setColors(c => [...c, { name: `Color ${c.length + 1}`, hex: '' }])
  }
  function removeColor(i: number) {
    setColors(c => c.filter((_, idx) => idx !== i))
  }
  function updateColor(i: number, field: keyof BrandColor, val: string) {
    setColors(c => c.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }

  function addPillar() { setPillars(p => [...p, { name: '', description: '' }]) }
  function removePillar(i: number) { setPillars(p => p.filter((_, idx) => idx !== i)) }
  function updatePillar(i: number, field: keyof Pillar, val: string) {
    setPillars(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }

  function addOffer() { setOffers(o => [...o, { name: '', description: '' }]) }
  function removeOffer(i: number) { setOffers(o => o.filter((_, idx) => idx !== i)) }
  function updateOffer(i: number, field: keyof Offer, val: string) {
    setOffers(o => o.map((item, idx) => idx === i ? { ...item, [field]: val } : item))
  }

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <h2 className="text-xl font-semibold text-gray-900">Edit Brand</h2>
      </div>

      <div className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c]" />
        </div>

        {/* Brand Colors */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Brand Colors</label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer text-xs text-[#e91e8c] hover:underline">
                {extracting ? 'Extracting…' : 'Extract from image'}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={extracting} />
              </label>
              <button onClick={addColor} className="text-xs text-[#e91e8c] hover:underline">+ Add color</button>
            </div>
          </div>
          <div className="space-y-2">
            {colors.map((color, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="color"
                  value={color.hex || '#000000'}
                  onChange={e => updateColor(i, 'hex', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-200 shrink-0"
                />
                <input
                  value={color.hex}
                  onChange={e => updateColor(i, 'hex', e.target.value)}
                  placeholder="#hex"
                  className="w-28 border border-gray-200 rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
                />
                <input
                  value={color.name}
                  onChange={e => updateColor(i, 'name', e.target.value)}
                  placeholder="Label"
                  className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
                />
                <button onClick={() => removeColor(i)} className="text-gray-300 hover:text-red-400 text-sm shrink-0">✕</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">Upload a logo or brand image to automatically extract colors.</p>
        </div>

        {/* ICP */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Ideal Client Profile (ICP)</label>
            <label className="cursor-pointer text-xs text-[#e91e8c] hover:underline">
              {icpUploading ? 'Reading…' : icpPdfName ? 'Replace PDF' : 'Upload document'}
              <input
                type="file"
                accept=".txt,.md,.pdf"
                className="hidden"
                disabled={icpUploading}
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  e.target.value = ''
                  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                    setIcpUploading(true)
                    try {
                      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
                      GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
                      const buffer = await file.arrayBuffer()
                      const pdf = await getDocument({ data: buffer }).promise
                      const pages = await Promise.all(
                        Array.from({ length: pdf.numPages }, (_, i) =>
                          pdf.getPage(i + 1).then(p => p.getTextContent()).then(tc =>
                            tc.items.map((item: { str?: string }) => item.str ?? '').join(' ')
                          )
                        )
                      )
                      setIcpRaw(pages.join('\n\n'))
                      setIcpPdfName(file.name)
                    } finally {
                      setIcpUploading(false)
                    }
                  } else {
                    setIcpPdfName('')
                    const reader = new FileReader()
                    reader.onload = ev => setIcpRaw(ev.target?.result as string ?? '')
                    reader.readAsText(file)
                  }
                }}
              />
            </label>
          </div>

          {icpPdfName ? (
            <div className="border border-gray-200 rounded-md px-3 py-3 bg-gray-50 flex items-center gap-3">
              <svg className="w-8 h-8 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
                <text x="7" y="18" fontSize="5" fill="white" fontWeight="bold">PDF</text>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{icpPdfName}</p>
                <p className="text-xs text-gray-400">Content extracted — AI will read this document</p>
              </div>
              <button
                onClick={() => { setIcpPdfName(''); setIcpRaw('') }}
                className="text-gray-300 hover:text-red-400 text-sm shrink-0"
              >✕</button>
            </div>
          ) : (
            <textarea
              value={icpRaw}
              onChange={e => setIcpRaw(e.target.value)}
              rows={8}
              placeholder="Paste or upload your ICP document here…"
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
            />
          )}
          <p className="text-xs text-gray-400 mt-1">Accepts .pdf, .txt files. For Word docs, copy and paste the text.</p>
        </div>

        {/* Brand Voice & Personality */}
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-gray-900">Brand Voice &amp; Personality</h3>

          {/* [A] Video upload for voice analysis */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Personality Video (optional)</label>
            <p className="text-xs text-gray-400 mb-2">Upload any size video or audio file — we extract just the audio before sending to transcription.</p>
            <label className="inline-flex cursor-pointer">
              <span className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors">
                {transcribing ? transcribeStatus || 'Processing…' : 'Upload video'}
              </span>
              <input
                type="file"
                accept="video/*,audio/*"
                className="hidden"
                disabled={transcribing}
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  e.target.value = ''
                  setTranscribing(true)
                  setTranscribeStatus('Extracting audio…')
                  setAnalyzeError('')
                  try {
                    const audioBlob = await extractAudioAsWav(file)
                    setTranscribeStatus('Transcribing…')
                    const fd = new FormData()
                    fd.append('action', 'transcribe')
                    fd.append('video', audioBlob, 'audio.wav')
                    const res = await fetch('/api/analyze-brand-voice', { method: 'POST', body: fd })
                    const data = await res.json()
                    if (data.error) throw new Error(data.error)
                    setBrandVoice(prev => ({ ...prev, video_transcript: data.transcript ?? '' }))
                  } catch (err) {
                    setAnalyzeError(err instanceof Error ? err.message : String(err))
                  } finally {
                    setTranscribing(false)
                    setTranscribeStatus('')
                  }
                }}
              />
            </label>
            {brandVoice.video_transcript && (
              <div className="mt-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-xs text-gray-600">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-500">Transcript preview</span>
                  <button
                    onClick={() => setBrandVoice(prev => ({ ...prev, video_transcript: '' }))}
                    className="text-[#e91e8c] hover:underline text-xs"
                  >Clear</button>
                </div>
                <p className="line-clamp-3">{brandVoice.video_transcript.slice(0, 200)}{brandVoice.video_transcript.length > 200 ? '…' : ''}</p>
              </div>
            )}
          </div>

          {/* [B] 3 Example Posts */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Example Posts</label>
            <p className="text-xs text-gray-400 mb-2">Paste 3 real post captions that nail your voice. The AI uses these as direct writing references — the more specific, the better.</p>
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <textarea
                  key={i}
                  value={brandVoice.example_posts[i] ?? ''}
                  onChange={e => {
                    const posts = [...brandVoice.example_posts]
                    posts[i] = e.target.value
                    setBrandVoice(prev => ({ ...prev, example_posts: posts }))
                  }}
                  rows={4}
                  placeholder={`Post ${i + 1} — paste a real caption here…`}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
                />
              ))}
            </div>
          </div>

          {/* [C] Analyze button */}
          <div>
            <button
              disabled={analyzing || (brandVoice.example_posts.every(p => !p.trim()) && !brandVoice.video_transcript)}
              onClick={async () => {
                setAnalyzing(true)
                setAnalyzeError('')
                const fd = new FormData()
                fd.append('action', 'analyze')
                fd.append('posts', JSON.stringify(brandVoice.example_posts.filter(p => p.trim())))
                fd.append('transcript', brandVoice.video_transcript)
                fd.append('brand_name', name)
                try {
                  const res = await fetch('/api/analyze-brand-voice', { method: 'POST', body: fd })
                  const data = await res.json()
                  if (data.error) throw new Error(data.error)
                  setBrandVoice(prev => ({
                    ...prev,
                    personality_traits: data.personality_traits ?? prev.personality_traits,
                    writing_rules: data.writing_rules ?? prev.writing_rules,
                    vocab_use: data.vocab_use ?? prev.vocab_use,
                    vocab_avoid: data.vocab_avoid ?? prev.vocab_avoid,
                    unique_markers: data.unique_markers ?? prev.unique_markers,
                  }))
                } catch (err) {
                  setAnalyzeError(err instanceof Error ? err.message : String(err))
                } finally {
                  setAnalyzing(false)
                }
              }}
              className="px-4 py-2 bg-[#e91e8c] text-white text-sm font-medium rounded-md hover:bg-[#be185d] transition-colors disabled:opacity-50"
            >
              {analyzing ? 'Analyzing...' : 'Analyze Voice & Extract Personality'}
            </button>
            {analyzeError && <p className="mt-2 text-xs text-red-500">{analyzeError}</p>}
          </div>

          {/* [D] Personality Traits */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Personality Traits</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {brandVoice.personality_traits.map((trait, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1 text-xs text-gray-700">
                  {trait}
                  <button
                    onClick={() => setBrandVoice(prev => ({ ...prev, personality_traits: prev.personality_traits.filter((_, idx) => idx !== i) }))}
                    className="text-gray-400 hover:text-red-400 ml-0.5"
                  >✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newTrait}
                onChange={e => setNewTrait(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTrait.trim()) {
                    e.preventDefault()
                    setBrandVoice(prev => ({ ...prev, personality_traits: [...prev.personality_traits, newTrait.trim()] }))
                    setNewTrait('')
                  }
                }}
                placeholder="Add a trait…"
                className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
              />
              <button
                onClick={() => {
                  if (newTrait.trim()) {
                    setBrandVoice(prev => ({ ...prev, personality_traits: [...prev.personality_traits, newTrait.trim()] }))
                    setNewTrait('')
                  }
                }}
                className="px-3 py-1.5 border border-gray-200 rounded-md text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >Add</button>
            </div>
          </div>

          {/* [E] Writing Rules */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Writing Rules</label>
            <p className="text-xs text-gray-400 mb-2">Specific rules the AI will always follow when writing for this brand.</p>
            <div className="space-y-2">
              {brandVoice.writing_rules.map((rule, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={rule}
                    onChange={e => {
                      const rules = [...brandVoice.writing_rules]
                      rules[i] = e.target.value
                      setBrandVoice(prev => ({ ...prev, writing_rules: rules }))
                    }}
                    className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
                  />
                  <button
                    onClick={() => setBrandVoice(prev => ({ ...prev, writing_rules: prev.writing_rules.filter((_, idx) => idx !== i) }))}
                    className="text-gray-300 hover:text-red-400 text-sm shrink-0"
                  >✕</button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setBrandVoice(prev => ({ ...prev, writing_rules: [...prev.writing_rules, ''] }))}
              className="mt-2 text-xs text-[#e91e8c] hover:underline"
            >+ Add Rule</button>
          </div>

          {/* [F] Vocabulary two columns */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Vocabulary</label>
            <div className="grid grid-cols-2 gap-4">
              {/* USE */}
              <div>
                <p className="text-xs font-semibold text-green-700 mb-2">USE</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {brandVoice.vocab_use.map((word, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-0.5 text-xs text-gray-700">
                      {word}
                      <button
                        onClick={() => setBrandVoice(prev => ({ ...prev, vocab_use: prev.vocab_use.filter((_, idx) => idx !== i) }))}
                        className="text-gray-400 hover:text-red-400"
                      >✕</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={newVocabUse}
                    onChange={e => setNewVocabUse(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newVocabUse.trim()) {
                        e.preventDefault()
                        setBrandVoice(prev => ({ ...prev, vocab_use: [...prev.vocab_use, newVocabUse.trim()] }))
                        setNewVocabUse('')
                      }
                    }}
                    placeholder="Add word…"
                    className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
                  />
                  <button
                    onClick={() => {
                      if (newVocabUse.trim()) {
                        setBrandVoice(prev => ({ ...prev, vocab_use: [...prev.vocab_use, newVocabUse.trim()] }))
                        setNewVocabUse('')
                      }
                    }}
                    className="px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-600 hover:bg-gray-50"
                  >Add</button>
                </div>
              </div>
              {/* AVOID */}
              <div>
                <p className="text-xs font-semibold text-red-600 mb-2">AVOID</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {brandVoice.vocab_avoid.map((word, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-0.5 text-xs text-gray-700">
                      {word}
                      <button
                        onClick={() => setBrandVoice(prev => ({ ...prev, vocab_avoid: prev.vocab_avoid.filter((_, idx) => idx !== i) }))}
                        className="text-gray-400 hover:text-red-400"
                      >✕</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={newVocabAvoid}
                    onChange={e => setNewVocabAvoid(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newVocabAvoid.trim()) {
                        e.preventDefault()
                        setBrandVoice(prev => ({ ...prev, vocab_avoid: [...prev.vocab_avoid, newVocabAvoid.trim()] }))
                        setNewVocabAvoid('')
                      }
                    }}
                    placeholder="Add word…"
                    className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
                  />
                  <button
                    onClick={() => {
                      if (newVocabAvoid.trim()) {
                        setBrandVoice(prev => ({ ...prev, vocab_avoid: [...prev.vocab_avoid, newVocabAvoid.trim()] }))
                        setNewVocabAvoid('')
                      }
                    }}
                    className="px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-600 hover:bg-gray-50"
                  >Add</button>
                </div>
              </div>
            </div>
          </div>

          {/* [G] Unique Markers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">What Makes This Brand Unique</label>
            <textarea
              value={brandVoice.unique_markers}
              onChange={e => setBrandVoice(prev => ({ ...prev, unique_markers: e.target.value }))}
              rows={4}
              placeholder="What does this brand do/say that no one else does? Specific quirks, angles, or patterns..."
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
            />
          </div>

          {/* [H] Voice & Tone Summary (legacy) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Voice & Tone Summary</label>
            <p className="text-xs text-gray-400 mb-1">Brief overall description.</p>
            <textarea value={voiceTone} onChange={e => setVoiceTone(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#e91e8c]" />
          </div>
        </div>

        {/* Pillars */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Content Pillars</label>
            <button onClick={addPillar} className="text-xs text-[#e91e8c] hover:underline">+ Add Pillar</button>
          </div>
          <div className="space-y-2">
            {pillars.map((pillar, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input value={pillar.name} onChange={e => updatePillar(i, 'name', e.target.value)}
                    placeholder="Pillar name"
                    className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c]" />
                  <input value={pillar.description} onChange={e => updatePillar(i, 'description', e.target.value)}
                    placeholder="Description"
                    className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c]" />
                </div>
                <button onClick={() => removePillar(i)} className="text-gray-300 hover:text-red-400 mt-1.5 text-sm">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Offers */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Offers / CTAs</label>
            <button onClick={addOffer} className="text-xs text-[#e91e8c] hover:underline">+ Add Offer</button>
          </div>
          <div className="space-y-2">
            {offers.map((offer, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input value={offer.name} onChange={e => updateOffer(i, 'name', e.target.value)}
                    placeholder="Offer name"
                    className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c]" />
                  <input value={offer.description} onChange={e => updateOffer(i, 'description', e.target.value)}
                    placeholder="Description / CTA"
                    className="border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c]" />
                </div>
                <button onClick={() => removeOffer(i)} className="text-gray-300 hover:text-red-400 mt-1.5 text-sm">✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Platforms */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Platforms</label>
          <div className="flex gap-4">
            {['linkedin', 'facebook', 'instagram', 'twitter'].map(p => (
              <label key={p} className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)}
                  className="accent-[#e91e8c]" />
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </label>
            ))}
          </div>
        </div>

        {/* GoHighLevel Integration */}
        <div className="border-t border-gray-100 pt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">GoHighLevel Integration</h3>
            <p className="text-xs text-gray-400 mt-0.5">Connect your GHL location to auto-schedule posts when you mark them as Scheduled.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">GHL Location ID</label>
              <input
                value={ghlLocationId}
                onChange={e => setGhlLocationId(e.target.value)}
                placeholder="e.g. ABC123xyz…"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">GHL API Key</label>
              <input
                type="password"
                value={ghlApiKey}
                onChange={e => setGhlApiKey(e.target.value)}
                placeholder="eyJ…"
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#e91e8c]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled={ghlTesting || !ghlLocationId.trim() || !ghlApiKey.trim()}
              onClick={async () => {
                setGhlTesting(true)
                setGhlStatus('idle')
                setGhlError('')
                try {
                  const res = await fetch('/api/ghl', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'fetch_accounts', locationId: ghlLocationId.trim(), apiKey: ghlApiKey.trim() }),
                  })
                  const data = await res.json()
                  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
                  setGhlFetchedAccounts(data.accounts ?? [])
                  setGhlStatus('connected')
                } catch (err) {
                  setGhlError(err instanceof Error ? err.message : String(err))
                  setGhlStatus('error')
                } finally {
                  setGhlTesting(false)
                }
              }}
              className="px-4 py-2 border border-gray-200 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {ghlTesting ? 'Connecting…' : 'Test Connection & Fetch Accounts'}
            </button>
            {ghlStatus === 'connected' && (
              <span className="text-xs text-green-600 font-medium">Connected — {ghlFetchedAccounts.length} account{ghlFetchedAccounts.length !== 1 ? 's' : ''} found</span>
            )}
            {ghlStatus === 'error' && (
              <span className="text-xs text-red-500">{ghlError}</span>
            )}
          </div>

          {ghlFetchedAccounts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Map your platforms to GHL accounts:</p>
              <div className="space-y-2">
                {platforms.map(platform => (
                  <div key={platform} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-gray-700 capitalize shrink-0">{platform}</span>
                    <select
                      value={ghlMapping[platform] ?? ''}
                      onChange={e => setGhlMapping(prev => ({ ...prev, [platform]: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e91e8c] bg-white"
                    >
                      <option value="">— not mapped —</option>
                      {ghlFetchedAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">Mapping is saved automatically with the rest of the brand settings.</p>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-[#e91e8c] text-white text-sm font-medium rounded-md hover:bg-[#be185d] transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
          {isDirty && !saved && <span className="text-xs text-gray-400">Auto-saving in a moment…</span>}
          {saveError && <span className="text-sm text-red-500">{saveError}</span>}
        </div>
      </div>
    </div>
  )
}
