'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Category = 'photo' | 'style_reference'

type Asset = {
  id: string
  brand_id: string
  category: Category
  name: string | null
  description: string | null
  style_tags: string[] | null
  file_path: string
  file_url: string
  created_at: string
}

type UploadingItem = {
  id: string
  name: string
  category: Category
  progress: 'uploading' | 'analyzing' | 'saving' | 'error'
  error?: string
}

const TAG_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-pink-100 text-pink-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
]

function tagColor(i: number) { return TAG_COLORS[i % TAG_COLORS.length] }

export default function AssetsPage() {
  const [brandId, setBrandId] = useState<string | null>(null)
  const [brandName, setBrandName] = useState('')
  const [tab, setTab] = useState<Category>('photo')
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<UploadingItem[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const styleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = localStorage.getItem('selectedBrandId')
    if (!id) { setLoading(false); return }
    setBrandId(id)
    supabase.from('brands').select('name').eq('id', id).single().then(({ data }) => {
      if (data) setBrandName(data.name)
    })
    loadAssets(id)
  }, [])

  async function loadAssets(bid: string) {
    setLoading(true)
    const { data } = await supabase
      .from('brand_assets')
      .select('*')
      .eq('brand_id', bid)
      .order('created_at', { ascending: false })
    setAssets(data ?? [])
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, category: Category) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length || !brandId) return

    for (const file of files) {
      const itemId = crypto.randomUUID()
      setUploading(prev => [...prev, { id: itemId, name: file.name, category, progress: 'uploading' }])

      try {
        // 1. Read as data URL for AI analysis
        const dataUrl = await new Promise<string>(resolve => {
          const reader = new FileReader()
          reader.onload = ev => resolve(ev.target?.result as string)
          reader.readAsDataURL(file)
        })

        // 2. Upload to Supabase Storage
        const ext = file.name.split('.').pop() ?? 'jpg'
        const filePath = `${brandId}/${category}/${itemId}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('brand-assets')
          .upload(filePath, file, { contentType: file.type })
        if (uploadErr) throw uploadErr

        const { data: { publicUrl } } = supabase.storage
          .from('brand-assets')
          .getPublicUrl(filePath)

        let description: string | null = null
        let style_tags: string[] | null = null

        // 3. Run AI analysis for both photos and style references
        setUploading(prev => prev.map(u => u.id === itemId ? { ...u, progress: 'analyzing' } : u))
        if (category === 'style_reference') {
          try {
            const res = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [], mode: 'analyze-style', imageDataUrl: dataUrl,
                brand: { name: '', pillars: null, platforms: null, offers: null, voice_tone: null, icp: null },
              }),
            })
            const aiData = await res.json()
            description = aiData.description ?? null
            style_tags = aiData.style_tags ?? null
          } catch { /* analysis failed — save without it */ }
        } else if (category === 'photo') {
          try {
            const res = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [], mode: 'analyze-photo', imageDataUrl: dataUrl,
                brand: { name: '', pillars: null, platforms: null, offers: null, voice_tone: null, icp: null },
              }),
            })
            const aiData = await res.json()
            description = aiData.description ?? null
          } catch { /* analysis failed — save without it */ }
        }

        // 4. Save record to DB
        setUploading(prev => prev.map(u => u.id === itemId ? { ...u, progress: 'saving' } : u))
        const { data: asset, error: dbErr } = await supabase
          .from('brand_assets')
          .insert({
            brand_id: brandId,
            category,
            name: file.name.replace(/\.[^.]+$/, ''),
            description,
            style_tags,
            file_path: filePath,
            file_url: publicUrl,
          })
          .select()
          .single()

        if (dbErr) throw dbErr
        setAssets(prev => [asset, ...prev])
        setUploading(prev => prev.filter(u => u.id !== itemId))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        setUploading(prev => prev.map(u => u.id === itemId ? { ...u, progress: 'error', error: msg } : u))
        setTimeout(() => setUploading(prev => prev.filter(u => u.id !== itemId)), 4000)
      }
    }
  }

  async function deleteAsset(asset: Asset) {
    await supabase.storage.from('brand-assets').remove([asset.file_path])
    await supabase.from('brand_assets').delete().eq('id', asset.id)
    setAssets(prev => prev.filter(a => a.id !== asset.id))
    setDeleteConfirm(null)
  }

  const tabAssets = assets.filter(a => a.category === tab)
  const tabUploading = uploading.filter(u => u.category === tab)

  const progressLabel = (p: UploadingItem['progress']) => ({
    uploading: 'Uploading…',
    analyzing: 'Analyzing style…',
    saving: 'Saving…',
    error: 'Failed',
  }[p])

  if (!brandId) return (
    <div className="text-sm text-gray-400 py-12 text-center">
      No brand selected. Choose a brand from the top to view its assets.
    </div>
  )

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Asset Library</h2>
          <p className="text-xs text-gray-400 mt-0.5">{brandName} · photos and style references for content creation</p>
        </div>
        <button
          onClick={() => (tab === 'photo' ? photoInputRef : styleInputRef).current?.click()}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-xl transition-all hover:shadow-md"
          style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload {tab === 'photo' ? 'Photo' : 'Style Reference'}
        </button>
      </div>

      {/* Hidden file inputs */}
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => handleUpload(e, 'photo')} />
      <input ref={styleInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => handleUpload(e, 'style_reference')} />

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {(['photo', 'style_reference'] as Category[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'photo' ? '📷 Photos' : '🎨 Style References'}
            <span className="ml-2 text-xs font-normal text-gray-400">
              {assets.filter(a => a.category === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* Tab description */}
      <div className="bg-white rounded-2xl border border-pink-50 px-5 py-4 shadow-sm">
        {tab === 'photo' ? (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-lg" style={{ background: 'rgba(233,30,140,0.08)' }}>📷</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Brand Photos</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Real photos that can be used as-is in posts, or as a base for text overlay graphics. These are shared with the designer and referenced when planning visual content.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-lg" style={{ background: 'rgba(233,30,140,0.08)' }}>🎨</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Graphic Style References</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                Visual style examples the AI analyzes to understand the brand's graphic aesthetic — cinematic, anime, infographic, illustrated, etc. Used to instruct the designer or AI image tools to match this look.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">

          {/* Uploading placeholders */}
          {tabUploading.map(item => (
            <div key={item.id} className="rounded-2xl border border-pink-100 bg-white shadow-sm overflow-hidden">
              <div className="aspect-square bg-pink-50/60 flex flex-col items-center justify-center gap-2 p-4">
                {item.progress === 'error' ? (
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 animate-spin" style={{ color: '#e91e8c' }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                )}
                <p className={`text-xs font-medium text-center ${item.progress === 'error' ? 'text-red-500' : 'text-pink-500'}`}>
                  {progressLabel(item.progress)}
                </p>
                {item.error && <p className="text-[10px] text-red-400 text-center">{item.error}</p>}
              </div>
              <div className="px-3 py-2.5">
                <p className="text-xs font-medium text-gray-600 truncate">{item.name}</p>
              </div>
            </div>
          ))}

          {/* Asset cards */}
          {tabAssets.map(asset => (
            <div key={asset.id} className="group rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              {/* Image */}
              <div className="relative aspect-square bg-gray-50 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.file_url}
                  alt={asset.name ?? ''}
                  className="w-full h-full object-cover"
                />
                {/* Delete button */}
                <button
                  onClick={() => setDeleteConfirm(asset.id)}
                  className="absolute top-2 right-2 w-7 h-7 bg-white/90 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                {/* Photo usage badge */}
                {asset.category === 'photo' && (
                  <div className="absolute bottom-2 left-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-sm">
                      As-is · Text overlay
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-semibold text-gray-800 truncate">{asset.name ?? 'Untitled'}</p>

                {/* Style reference: description + tags */}
                {asset.category === 'style_reference' && (
                  <>
                    {asset.description && (
                      <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2">{asset.description}</p>
                    )}
                    {asset.style_tags && asset.style_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {asset.style_tags.map((tag, i) => (
                          <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tagColor(i)}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {!asset.description && !asset.style_tags && (
                      <p className="text-[11px] text-gray-400 italic">No style analysis</p>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Empty state */}
          {tabAssets.length === 0 && tabUploading.length === 0 && (
            <div className="col-span-full py-16 flex flex-col items-center gap-3 text-gray-400">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'rgba(233,30,140,0.06)' }}>
                {tab === 'photo' ? '📷' : '🎨'}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">
                  {tab === 'photo' ? 'No photos yet' : 'No style references yet'}
                </p>
                <p className="text-xs mt-0.5">
                  {tab === 'photo'
                    ? 'Upload brand photos to use as-is or as text overlay bases'
                    : 'Upload style examples — the AI will detect the visual style automatically'}
                </p>
              </div>
              <button
                onClick={() => (tab === 'photo' ? photoInputRef : styleInputRef).current?.click()}
                className="mt-1 px-4 py-2 text-sm font-semibold rounded-xl border-2 transition-colors hover:bg-pink-50"
                style={{ borderColor: '#e91e8c', color: '#e91e8c' }}
              >
                Upload {tab === 'photo' ? 'Photos' : 'Style References'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <p className="text-sm font-semibold text-gray-900 mb-1">Delete this asset?</p>
            <p className="text-xs text-gray-500 mb-5">This will permanently remove the file from storage. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const asset = assets.find(a => a.id === deleteConfirm)
                  if (asset) deleteAsset(asset)
                }}
                className="flex-1 py-2 text-sm font-semibold text-white rounded-xl bg-red-500 hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 text-sm font-semibold text-gray-600 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
