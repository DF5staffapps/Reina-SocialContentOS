'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type SourceType = 'text' | 'image' | 'pdf'

type Testimonial = {
  id: string
  brand_id: string
  source_type: SourceType
  author_name: string | null
  author_title: string | null
  content: string | null
  file_path: string | null
  file_url: string | null
  rating: number | null
  last_used_at: string | null
  times_used: number
  campaign_id: string | null
  created_at: string
}

type CampaignOption = { id: string; name: string }

type ExtractedTestimonial = {
  author_name: string | null
  author_title: string | null
  content: string
  rating: number | null
}

type SensitiveRegion = { label: string; x: number; y: number; width: number; height: number }

type Template = {
  id: string
  name: string | null
  file_url: string
  file_path: string
  description: string | null
  style_tags: string[] | null
}

const SOURCE_COLOR: Record<SourceType, { bg: string; color: string }> = {
  text:  { bg: 'rgba(99,102,241,0.10)',  color: '#4338ca' },
  image: { bg: 'rgba(16,185,129,0.10)',  color: '#047857' },
  pdf:   { bg: 'rgba(239,68,68,0.10)',   color: '#b91c1c' },
}

function CampaignTags({ campaigns, selected, onChange }: {
  campaigns: CampaignOption[]
  selected: string
  onChange: (id: string) => void
}) {
  if (campaigns.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1.5">
        Campaign <span className="font-normal text-gray-400">(optional)</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {campaigns.map(c => {
          const active = selected === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(active ? '' : c.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                active
                  ? 'text-white border-transparent'
                  : 'border-gray-200 text-gray-500 hover:border-pink-300 hover:text-[#e91e8c]'
              }`}
              style={active ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}
            >
              {c.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StarRating({ rating, onChange }: { rating: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n)}
          className={`text-lg leading-none transition-colors ${onChange ? 'cursor-pointer hover:scale-110' : 'cursor-default'} ${n <= rating ? 'text-amber-400' : 'text-gray-200'}`}>
          ★
        </button>
      ))}
    </div>
  )
}

// Canvas pixelation blur
async function pixelateRegions(dataUrl: string, regions: SensitiveRegion[], blockSize = 18): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      for (const r of regions) {
        const rx = Math.floor(r.x * img.width)
        const ry = Math.floor(r.y * img.height)
        const rw = Math.ceil(r.width * img.width)
        const rh = Math.ceil(r.height * img.height)
        for (let px = rx; px < rx + rw; px += blockSize) {
          for (let py = ry; py < ry + rh; py += blockSize) {
            const bw = Math.min(blockSize, rx + rw - px)
            const bh = Math.min(blockSize, ry + rh - py)
            const d = ctx.getImageData(Math.min(px, img.width - 1), Math.min(py, img.height - 1), 1, 1).data
            ctx.fillStyle = `rgb(${d[0]},${d[1]},${d[2]})`
            ctx.fillRect(px, py, bw, bh)
          }
        }
      }
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.src = dataUrl
  })
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type })
}

export default function TestimonialsPage() {
  const [brandId, setBrandId] = useState<string | null>(null)
  const [brandName, setBrandName] = useState('')
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [addTab, setAddTab] = useState<SourceType>('text')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  // Text form
  const [textAuthor, setTextAuthor] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [textRating, setTextRating] = useState(5)
  const [savingText, setSavingText] = useState(false)

  // Image flow
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [imageProcessing, setImageProcessing] = useState(false)
  const [imageOriginalDataUrl, setImageOriginalDataUrl] = useState<string | null>(null)
  const [imageDisplayUrl, setImageDisplayUrl] = useState<string | null>(null)  // may be blurred
  const [imageExtracted, setImageExtracted] = useState<Partial<Testimonial> | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageSensitiveRegions, setImageSensitiveRegions] = useState<SensitiveRegion[]>([])
  const [imageBlurred, setImageBlurred] = useState(false)
  const [blurring, setBlurring] = useState(false)
  const [savingImage, setSavingImage] = useState(false)

  // PDF flow
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfFileName, setPdfFileName] = useState('')
  const [pdfProcessing, setPdfProcessing] = useState(false)
  const [pdfExtractedList, setPdfExtractedList] = useState<ExtractedTestimonial[]>([])
  const [pdfAuthor, setPdfAuthor] = useState('')
  const [pdfTitle, setPdfTitle] = useState('')
  const [pdfRating, setPdfRating] = useState(5)
  const [savingPdf, setSavingPdf] = useState(false)

  // Template upload
  const templateInputRef = useRef<HTMLInputElement>(null)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)

  // Testimonial graphic generation
  const [graphicGenerating, setGraphicGenerating] = useState<string | null>(null)
  const [graphicDataUrls, setGraphicDataUrls] = useState<Record<string, string>>({})

  // Campaign tagging
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')
  const [filterCampaignId, setFilterCampaignId] = useState<string>('')

  useEffect(() => {
    const id = localStorage.getItem('selectedBrandId')
    if (!id) { setLoading(false); return }
    setBrandId(id)
    supabase.from('brands').select('name').eq('id', id).single().then(({ data }) => { if (data) setBrandName(data.name) })
    supabase.from('campaigns').select('id, name').eq('brand_id', id).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setCampaigns(data) })
    load(id)
  }, [])

  async function load(bid: string) {
    setLoading(true)
    const [{ data: tData }, { data: tmplData }] = await Promise.all([
      supabase.from('testimonials').select('*').eq('brand_id', bid).order('created_at', { ascending: false }),
      supabase.from('brand_assets').select('id, name, file_url, file_path, description, style_tags').eq('brand_id', bid).eq('category', 'testimonial_template').order('created_at', { ascending: false }),
    ])
    setTestimonials(tData ?? [])
    setTemplates(tmplData ?? [])
    setLoading(false)
  }

  // ── Text ─────────────────────────────────────────────────────────────────
  async function saveText() {
    if (!brandId || !textContent.trim()) return
    setSavingText(true)
    const { data, error } = await supabase.from('testimonials').insert({
      brand_id: brandId, source_type: 'text',
      author_name: textAuthor.trim() || null, author_title: textTitle.trim() || null,
      content: textContent.trim(), rating: textRating || null,
      campaign_id: selectedCampaignId || null,
    }).select().single()
    if (error) {
      console.error('Failed to save testimonial:', error)
      alert(`Failed to save: ${error.message}`)
      setSavingText(false)
      return
    }
    if (data) setTestimonials(prev => [data, ...prev])
    setTextAuthor(''); setTextTitle(''); setTextContent(''); setTextRating(5); setSelectedCampaignId('')
    setSavingText(false)
  }

  // ── Image ─────────────────────────────────────────────────────────────────
  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setImageFile(file); setImageExtracted(null); setImageSensitiveRegions([]); setImageBlurred(false)

    const dataUrl = await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = ev => resolve(ev.target?.result as string)
      reader.readAsDataURL(file)
    })
    setImageOriginalDataUrl(dataUrl); setImageDisplayUrl(dataUrl)
    setImageProcessing(true)

    // Run extraction + sensitive info detection in parallel
    const blank = { name: '', pillars: null, platforms: null, offers: null, voice_tone: null, icp: null }
    const [extractRes, sensitiveRes] = await Promise.allSettled([
      fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], mode: 'analyze-testimonial', imageDataUrl: dataUrl, brand: blank }) }).then(r => r.json()),
      fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], mode: 'detect-sensitive-info', imageDataUrl: dataUrl, brand: blank }) }).then(r => r.json()),
    ])

    if (extractRes.status === 'fulfilled') setImageExtracted(extractRes.value)
    if (sensitiveRes.status === 'fulfilled' && sensitiveRes.value.found) {
      setImageSensitiveRegions(sensitiveRes.value.regions ?? [])
    }
    setImageProcessing(false)
  }

  async function applyBlur() {
    if (!imageOriginalDataUrl || imageSensitiveRegions.length === 0) return
    setBlurring(true)
    const blurred = await pixelateRegions(imageOriginalDataUrl, imageSensitiveRegions)
    setImageDisplayUrl(blurred)
    // Replace the file with the blurred version
    const blurredFile = await dataUrlToFile(blurred, imageFile?.name ?? 'blurred.jpg')
    setImageFile(blurredFile)
    setImageBlurred(true)
    setBlurring(false)
  }

  async function saveImage() {
    if (!brandId || !imageFile || !imageDisplayUrl) return
    setSavingImage(true)
    const uuid = crypto.randomUUID()
    const ext = imageBlurred ? 'jpg' : (imageFile.name.split('.').pop() ?? 'jpg')
    const filePath = `${brandId}/testimonials/${uuid}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('brand-assets').upload(filePath, imageFile, { contentType: imageFile.type })
    if (uploadErr) { setSavingImage(false); return }
    const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(filePath)
    const { data } = await supabase.from('testimonials').insert({
      brand_id: brandId, source_type: 'image',
      author_name: (imageExtracted?.author_name as string) || null,
      author_title: (imageExtracted?.author_title as string) || null,
      content: (imageExtracted?.content as string) || null,
      rating: (imageExtracted?.rating as number) || null,
      file_path: filePath, file_url: publicUrl,
      campaign_id: selectedCampaignId || null,
    }).select().single()
    if (data) setTestimonials(prev => [data, ...prev])
    setImageFile(null); setImageOriginalDataUrl(null); setImageDisplayUrl(null)
    setImageExtracted(null); setImageSensitiveRegions([]); setImageBlurred(false)
    setSelectedCampaignId('')
    setSavingImage(false)
  }

  function resetImage() {
    setImageFile(null); setImageOriginalDataUrl(null); setImageDisplayUrl(null)
    setImageExtracted(null); setImageSensitiveRegions([]); setImageBlurred(false)
  }

  // ── PDF ──────────────────────────────────────────────────────────────────
  async function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setPdfFile(file); setPdfFileName(file.name); setPdfExtractedList([]); setPdfProcessing(true)

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
      const fullText = pages.join('\n\n').trim()

      // Extract individual testimonials via AI
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [], mode: 'extract-testimonials', pdfText: fullText,
          brand: { name: '', pillars: null, platforms: null, offers: null, voice_tone: null, icp: null } }),
      })
      const data = await res.json()
      setPdfExtractedList(data.testimonials ?? [])
      if ((data.testimonials ?? []).length === 0) {
        // Fallback: treat whole text as one testimonial
        setPdfExtractedList([{ author_name: null, author_title: null, content: fullText, rating: null }])
      }
    } catch { setPdfExtractedList([]) }
    setPdfProcessing(false)
  }

  function updateExtracted(i: number, patch: Partial<ExtractedTestimonial>) {
    setPdfExtractedList(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t))
  }

  async function savePdf() {
    if (!brandId || !pdfFile || pdfExtractedList.length === 0) return
    setSavingPdf(true)
    const uuid = crypto.randomUUID()
    const filePath = `${brandId}/testimonials/${uuid}.pdf`
    await supabase.storage.from('brand-assets').upload(filePath, pdfFile, { contentType: 'application/pdf' })
    const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(filePath)

    const inserts = pdfExtractedList.map((t, i) => ({
      brand_id: brandId,
      source_type: 'pdf' as SourceType,
      author_name: t.author_name || pdfAuthor.trim() || null,
      author_title: t.author_title || pdfTitle.trim() || null,
      content: t.content || null,
      rating: t.rating || pdfRating || null,
      campaign_id: selectedCampaignId || null,
      // Only attach file to the first record (as the source PDF)
      file_path: i === 0 ? filePath : null,
      file_url: i === 0 ? publicUrl : null,
    }))

    const { data } = await supabase.from('testimonials').insert(inserts).select()
    if (data) setTestimonials(prev => [...data, ...prev])
    setPdfFile(null); setPdfFileName(''); setPdfExtractedList([]); setPdfAuthor(''); setPdfTitle(''); setPdfRating(5); setSelectedCampaignId('')
    setSavingPdf(false)
  }

  // ── Templates ─────────────────────────────────────────────────────────────
  async function handleTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file || !brandId) return
    setUploadingTemplate(true)

    // Read as data URL for style analysis
    const dataUrl = await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = ev => resolve(ev.target?.result as string)
      reader.readAsDataURL(file)
    })

    const uuid = crypto.randomUUID()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const filePath = `${brandId}/templates/${uuid}.${ext}`
    const { error } = await supabase.storage.from('brand-assets').upload(filePath, file, { contentType: file.type })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(filePath)

      // Analyze visual style for use as DALL-E reference
      let description: string | null = null
      let style_tags: string[] | null = null
      try {
        const res = await fetch('/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [], mode: 'analyze-style', imageDataUrl: dataUrl,
            brand: { name: '', pillars: null, platforms: null, offers: null, voice_tone: null, icp: null } }),
        })
        const styleData = await res.json()
        description = styleData.description ?? null
        style_tags = styleData.style_tags ?? null
      } catch { /* style analysis optional */ }

      const { data } = await supabase.from('brand_assets').insert({
        brand_id: brandId, category: 'testimonial_template',
        name: file.name.replace(/\.[^.]+$/, ''), file_path: filePath, file_url: publicUrl,
        description, style_tags,
      }).select('id, name, file_url, file_path, description, style_tags').single()
      if (data) setTemplates(prev => [data, ...prev])
    }
    setUploadingTemplate(false)
  }

  async function generateTestimonialGraphic(t: Testimonial) {
    if (graphicGenerating) return
    setGraphicGenerating(t.id)
    try {
      const styleRefs = templates
        .filter(tmpl => tmpl.description)
        .map(tmpl => ({ description: tmpl.description, style_tags: tmpl.style_tags ?? [] }))
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [], mode: 'generate-testimonial-graphic',
          testimonialContent: t.content,
          testimonialAuthor: t.author_name,
          testimonialRating: t.rating,
          styleRefs,
          brand: { name: brandName, pillars: null, platforms: null, offers: null, voice_tone: null, icp: null },
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.b64) {
        setGraphicDataUrls(prev => ({ ...prev, [t.id]: `data:image/png;base64,${data.b64}` }))
      }
    } catch (err) {
      console.error('Graphic generation error:', err)
      alert(`Graphic generation failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    setGraphicGenerating(null)
  }

  async function deleteTemplate(t: Template) {
    await supabase.storage.from('brand-assets').remove([t.file_path])
    await supabase.from('brand_assets').delete().eq('id', t.id)
    setTemplates(prev => prev.filter(x => x.id !== t.id))
  }

  async function deleteTestimonial(t: Testimonial) {
    if (t.file_path) await supabase.storage.from('brand-assets').remove([t.file_path])
    await supabase.from('testimonials').delete().eq('id', t.id)
    setTestimonials(prev => prev.filter(x => x.id !== t.id))
    setDeleteConfirm(null)
  }

  const inputClass = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 focus:border-[#e91e8c] transition-colors bg-white"
  const labelClass = "block text-xs font-semibold text-gray-600 mb-1"

  if (!brandId) return (
    <div className="text-sm text-gray-400 py-12 text-center">No brand selected. Choose a brand from the top.</div>
  )

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Testimonials</h2>
          <p className="text-xs text-gray-400 mt-0.5">{brandName} · social proof library for WHAT content</p>
        </div>
        <button
          onClick={() => setShowTemplates(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${showTemplates ? 'border-[#e91e8c] text-[#e91e8c] bg-pink-50' : 'border-gray-200 text-gray-500 hover:border-pink-300 hover:text-[#e91e8c]'}`}
        >
          🎨 Graphic Templates {templates.length > 0 && `(${templates.length})`}
        </button>
      </div>

      {/* Templates panel */}
      {showTemplates && (
        <div className="bg-white rounded-2xl border border-pink-50 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-gray-800">Testimonial Graphic Templates</p>
              <p className="text-xs text-gray-400 mt-0.5">Upload design templates — used as style references when generating testimonial graphics for text & PDF testimonials</p>
            </div>
            <button
              onClick={() => templateInputRef.current?.click()}
              disabled={uploadingTemplate}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}
            >
              {uploadingTemplate ? 'Uploading…' : '+ Add Template'}
            </button>
            <input ref={templateInputRef} type="file" accept="image/*" className="hidden" onChange={handleTemplateUpload} />
          </div>
          {templates.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No templates yet — upload a design to use as a style reference</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {templates.map(t => (
                <div key={t.id} className="group relative rounded-xl overflow-hidden border border-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.file_url} alt={t.name ?? ''} className="w-full aspect-video object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <button
                      onClick={() => deleteTemplate(t)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] font-semibold text-white bg-red-500/80 px-2 py-1 rounded-lg transition-opacity"
                    >Remove</button>
                  </div>
                  <p className="px-2 py-1.5 text-[10px] text-gray-500 truncate">{t.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add testimonial card */}
      <div className="bg-white rounded-2xl border border-pink-50 shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <p className="text-sm font-bold text-gray-800 mb-3">Add testimonial</p>
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-4">
            {(['text', 'image', 'pdf'] as SourceType[]).map(t => (
              <button key={t} onClick={() => setAddTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${addTab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'text' ? '✏️ Write' : t === 'image' ? '🖼️ Image' : '📄 PDF'}
              </button>
            ))}
          </div>

          {/* TEXT */}
          {addTab === 'text' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Name <span className="font-normal text-gray-400">(optional)</span></label>
                  <input value={textAuthor} onChange={e => setTextAuthor(e.target.value)} placeholder="Jane Smith" className={inputClass} /></div>
                <div><label className={labelClass}>Title / handle <span className="font-normal text-gray-400">(optional)</span></label>
                  <input value={textTitle} onChange={e => setTextTitle(e.target.value)} placeholder="CEO at Acme · @janedoe" className={inputClass} /></div>
              </div>
              <div><label className={labelClass}>Testimonial <span className="text-pink-400">*</span></label>
                <textarea value={textContent} onChange={e => setTextContent(e.target.value)} rows={4} placeholder="Paste or type the testimonial…" className={inputClass + ' resize-y'} /></div>
              <CampaignTags campaigns={campaigns} selected={selectedCampaignId} onChange={setSelectedCampaignId} />
              <div className="flex items-center gap-4">
                <div><label className={labelClass}>Rating</label><StarRating rating={textRating} onChange={setTextRating} /></div>
                <div className="flex-1" />
                <button onClick={saveText} disabled={savingText || !textContent.trim()}
                  className="px-5 py-2 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:shadow-md transition-all"
                  style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}>
                  {savingText ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* IMAGE */}
          {addTab === 'image' && (
            <div className="space-y-3">
              {!imageDisplayUrl ? (
                <button onClick={() => imageInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-2 text-gray-400 hover:border-pink-300 hover:text-pink-400 transition-colors">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-sm font-medium">Upload screenshot</span>
                  <span className="text-xs text-gray-300">WhatsApp, Google reviews, DMs — AI will extract the text</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageDisplayUrl} alt="Testimonial" className="w-44 rounded-xl border border-gray-100 object-cover" />
                      {imageBlurred && (
                        <div className="absolute top-2 left-2 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Blurred</div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      {imageProcessing ? (
                        <div className="flex items-center gap-2 text-xs text-pink-500 animate-pulse pt-2">
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                          Analyzing image…
                        </div>
                      ) : (
                        <>
                          {/* Sensitive info warning */}
                          {imageSensitiveRegions.length > 0 && !imageBlurred && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-2">
                              <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                <p className="text-xs font-semibold text-amber-700">
                                  {imageSensitiveRegions.length} sensitive item{imageSensitiveRegions.length > 1 ? 's' : ''} detected
                                </p>
                              </div>
                              <p className="text-[11px] text-amber-600">{imageSensitiveRegions.map(r => r.label).join(', ')}</p>
                              <button onClick={applyBlur} disabled={blurring}
                                className="w-full py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50 transition-all"
                                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                                {blurring ? 'Blurring…' : '🔒 Blur sensitive info'}
                              </button>
                            </div>
                          )}
                          {imageSensitiveRegions.length === 0 && !imageProcessing && (
                            <div className="flex items-center gap-1.5 text-xs text-green-600">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                              No sensitive info detected
                            </div>
                          )}
                          {imageBlurred && (
                            <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                              Sensitive info blurred — ready to use as post graphic
                            </div>
                          )}
                          {imageExtracted?.content && (
                            <div>
                              {imageExtracted.author_name && <p className="text-xs font-semibold text-gray-700">{imageExtracted.author_name}{imageExtracted.author_title ? ` · ${imageExtracted.author_title}` : ''}</p>}
                              {imageExtracted.rating ? <StarRating rating={imageExtracted.rating as number} /> : null}
                              <p className="text-xs text-gray-500 leading-relaxed line-clamp-4 mt-1">{imageExtracted.content as string}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <CampaignTags campaigns={campaigns} selected={selectedCampaignId} onChange={setSelectedCampaignId} />
                  <div className="flex gap-3 justify-end">
                    <button onClick={resetImage} className="text-sm text-gray-400 hover:text-gray-600">Remove</button>
                    <button onClick={saveImage} disabled={savingImage || imageProcessing || blurring}
                      className="px-5 py-2 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:shadow-md transition-all"
                      style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}>
                      {savingImage ? 'Saving…' : 'Save Testimonial'}
                    </button>
                  </div>
                </div>
              )}
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
            </div>
          )}

          {/* PDF */}
          {addTab === 'pdf' && (
            <div className="space-y-3">
              {!pdfFile ? (
                <button onClick={() => pdfInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-2 text-gray-400 hover:border-pink-300 hover:text-pink-400 transition-colors">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="text-sm font-medium">Upload PDF</span>
                  <span className="text-xs">Can be a single testimonial or a compiled list — AI splits them automatically</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-red-50/60 rounded-xl border border-red-100">
                    <svg className="w-8 h-8 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{pdfFileName}</p>
                      <p className="text-xs text-gray-400">{pdfProcessing ? 'Extracting testimonials…' : `${pdfExtractedList.length} testimonial${pdfExtractedList.length !== 1 ? 's' : ''} found`}</p>
                    </div>
                    <button onClick={() => { setPdfFile(null); setPdfFileName(''); setPdfExtractedList([]) }} className="text-gray-300 hover:text-red-400">✕</button>
                  </div>

                  {pdfProcessing && (
                    <div className="flex items-center gap-2 text-xs text-pink-500 animate-pulse">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                      AI is splitting the PDF into individual testimonials…
                    </div>
                  )}

                  {/* Fallback author for ones with no name */}
                  {pdfExtractedList.length > 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelClass}>Default author name <span className="font-normal text-gray-400">(for unnamed)</span></label>
                          <input value={pdfAuthor} onChange={e => setPdfAuthor(e.target.value)} placeholder="e.g. Anonymous" className={inputClass} /></div>
                        <div><label className={labelClass}>Default rating</label>
                          <StarRating rating={pdfRating} onChange={setPdfRating} /></div>
                      </div>

                      {/* Extracted testimonial list */}
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {pdfExtractedList.map((t, i) => (
                          <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50/40">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-400 w-5">#{i + 1}</span>
                              <input value={t.author_name ?? ''} onChange={e => updateExtracted(i, { author_name: e.target.value || null })}
                                placeholder="Author name" className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-pink-200" />
                              <input value={t.author_title ?? ''} onChange={e => updateExtracted(i, { author_title: e.target.value || null })}
                                placeholder="Title / handle" className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-pink-200" />
                              <StarRating rating={t.rating ?? 5} onChange={r => updateExtracted(i, { rating: r })} />
                              <button onClick={() => setPdfExtractedList(prev => prev.filter((_, idx) => idx !== i))}
                                className="text-gray-300 hover:text-red-400 text-sm shrink-0">✕</button>
                            </div>
                            <textarea value={t.content} onChange={e => updateExtracted(i, { content: e.target.value })}
                              rows={3} className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white resize-y focus:outline-none focus:ring-1 focus:ring-pink-200" />
                          </div>
                        ))}
                      </div>
                      <CampaignTags campaigns={campaigns} selected={selectedCampaignId} onChange={setSelectedCampaignId} />
                      <div className="flex justify-end">
                        <button onClick={savePdf} disabled={savingPdf || pdfProcessing}
                          className="px-5 py-2 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:shadow-md transition-all"
                          style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}>
                          {savingPdf ? 'Saving…' : `Save ${pdfExtractedList.length} Testimonial${pdfExtractedList.length !== 1 ? 's' : ''}`}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfSelect} />
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {/* Filter by campaign */}
        {campaigns.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-400">Filter:</span>
            <button
              onClick={() => setFilterCampaignId('')}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${filterCampaignId === '' ? 'text-white border-transparent' : 'border-gray-200 text-gray-500 hover:border-pink-300 hover:text-[#e91e8c]'}`}
              style={filterCampaignId === '' ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}
            >
              All
            </button>
            <button
              onClick={() => setFilterCampaignId('none')}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${filterCampaignId === 'none' ? 'text-white border-transparent' : 'border-gray-200 text-gray-500 hover:border-pink-300 hover:text-[#e91e8c]'}`}
              style={filterCampaignId === 'none' ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}
            >
              General
            </button>
            {campaigns.map(c => (
              <button
                key={c.id}
                onClick={() => setFilterCampaignId(c.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${filterCampaignId === c.id ? 'text-white border-transparent' : 'border-gray-200 text-gray-500 hover:border-pink-300 hover:text-[#e91e8c]'}`}
                style={filterCampaignId === c.id ? { background: 'linear-gradient(135deg, #e91e8c, #be185d)' } : {}}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {(() => {
          const filtered = filterCampaignId === ''
            ? testimonials
            : filterCampaignId === 'none'
            ? testimonials.filter(t => !t.campaign_id)
            : testimonials.filter(t => t.campaign_id === filterCampaignId)
          const count = filtered.length
          return <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{count} testimonial{count !== 1 ? 's' : ''}{filterCampaignId && filterCampaignId !== 'none' ? ` · ${campaigns.find(c => c.id === filterCampaignId)?.name ?? ''}` : filterCampaignId === 'none' ? ' · General' : ''}</p>
        })()}
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && testimonials.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-3 bg-white rounded-2xl border border-gray-100">
            <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            <p className="text-sm text-gray-400">No testimonials yet</p>
          </div>
        )}

        {(filterCampaignId === ''
          ? testimonials
          : filterCampaignId === 'none'
          ? testimonials.filter(t => !t.campaign_id)
          : testimonials.filter(t => t.campaign_id === filterCampaignId)
        ).map(t => {
          const isExpanded = expandedId === t.id
          const preview = t.content?.slice(0, 220)
          const hasMore = (t.content?.length ?? 0) > 220
          const lastUsedDaysAgo = t.last_used_at
            ? Math.floor((Date.now() - new Date(t.last_used_at).getTime()) / 86400000)
            : null
          const isOnCooldown = lastUsedDaysAgo !== null && lastUsedDaysAgo < 90

          return (
            <div key={t.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isOnCooldown ? 'border-amber-100' : 'border-gray-100'}`}>
              <div className="px-5 py-4">
                <div className="flex items-start gap-3">
                  {t.source_type === 'image' && t.file_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.file_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-100 shrink-0" />
                  )}
                  {t.source_type === 'pdf' && t.file_url && (
                    <div className="w-14 h-14 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {t.author_name && <span className="text-sm font-semibold text-gray-800">{t.author_name}</span>}
                      {t.author_title && <span className="text-xs text-gray-400">{t.author_title}</span>}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: SOURCE_COLOR[t.source_type].bg, color: SOURCE_COLOR[t.source_type].color }}>
                        {t.source_type.charAt(0).toUpperCase() + t.source_type.slice(1)}
                      </span>
                      {/* Campaign tag */}
                      {t.campaign_id && (() => {
                        const camp = campaigns.find(c => c.id === t.campaign_id)
                        return camp ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.10)', color: '#7c3aed' }}>
                            📌 {camp.name}
                          </span>
                        ) : null
                      })()}
                      {/* Usage status */}
                      {isOnCooldown && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                          Used {lastUsedDaysAgo}d ago · cooling down
                        </span>
                      )}
                      {t.times_used > 0 && !isOnCooldown && (
                        <span className="text-[10px] text-gray-400">Used {t.times_used}×</span>
                      )}
                    </div>
                    {t.rating ? <StarRating rating={t.rating} /> : null}
                    {t.content && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600 leading-relaxed">
                          {isExpanded ? t.content : preview}{!isExpanded && hasMore && '…'}
                        </p>
                        {hasMore && (
                          <button onClick={() => setExpandedId(isExpanded ? null : t.id)}
                            className="text-xs font-medium mt-1 hover:underline" style={{ color: '#e91e8c' }}>
                            {isExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setDeleteConfirm(t.id)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0">✕</button>
                </div>
              </div>
              {/* Generate graphic for text/PDF testimonials */}
              {(t.source_type === 'text' || t.source_type === 'pdf') && (
                <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/40">
                  {graphicDataUrls[t.id] ? (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={graphicDataUrls[t.id]} alt="Generated graphic" className="w-full rounded-xl border border-gray-100" />
                      <div className="flex gap-2 items-center">
                        <span className="text-[10px] text-gray-400 flex-1">Generated quote card background</span>
                        <button
                          onClick={() => generateTestimonialGraphic(t)}
                          disabled={graphicGenerating === t.id}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-pink-300 hover:text-[#e91e8c] transition-colors disabled:opacity-40"
                        >
                          Regen
                        </button>
                        <a
                          href={graphicDataUrls[t.id]}
                          download={`testimonial-graphic-${t.id}.png`}
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => generateTestimonialGraphic(t)}
                      disabled={graphicGenerating === t.id}
                      className="flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
                      style={{ color: '#e91e8c' }}
                    >
                      {graphicGenerating === t.id ? (
                        <>
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                          </svg>
                          Generating graphic…
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                          Generate Quote Graphic
                          {templates.length > 0 && <span className="font-normal text-[10px] text-gray-400">· uses {templates.length} template{templates.length !== 1 ? 's' : ''}</span>}
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
              {t.source_type === 'pdf' && t.file_url && (
                <div className="px-5 py-2 border-t border-gray-50 bg-gray-50/40">
                  <a href={t.file_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium hover:underline" style={{ color: '#e91e8c' }}>View PDF →</a>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <p className="text-sm font-semibold text-gray-900 mb-1">Delete this testimonial?</p>
            <p className="text-xs text-gray-500 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => { const t = testimonials.find(x => x.id === deleteConfirm); if (t) deleteTestimonial(t) }}
                className="flex-1 py-2 text-sm font-semibold text-white rounded-xl bg-red-500 hover:bg-red-600 transition-colors">Delete</button>
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-sm font-semibold text-gray-600 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
