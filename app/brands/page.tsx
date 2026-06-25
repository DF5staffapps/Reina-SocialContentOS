'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Brand } from '@/types/database'

const CARD_GRADIENTS = [
  'from-[#e91e8c] to-[#9c0f5f]',
  'from-[#a855f7] to-[#7c3aed]',
  'from-[#f43f5e] to-[#e11d48]',
  'from-[#ec4899] to-[#db2777]',
  'from-[#c026d3] to-[#a21caf]',
  'from-[#fb7185] to-[#f43f5e]',
]

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('brands').select('*').order('name').then(({ data }) => {
      setBrands(data ?? [])
      setLoading(false)
    })
  }, [])

  async function addBrand() {
    const name = prompt('Brand name?')
    if (!name) return
    const { data } = await supabase.from('brands').insert({ name, platforms: ['linkedin', 'facebook'] }).select().single()
    if (data) setBrands(prev => [...prev, data])
  }

  if (loading) return <div className="text-gray-400 text-sm">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Brands</h2>
          <p className="text-sm text-gray-400 mt-0.5">Manage your client brands and their settings</p>
        </div>
        <button
          onClick={addBrand}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-xl transition-all hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
          style={{ background: 'linear-gradient(135deg, #e91e8c, #be185d)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Brand
        </button>
      </div>

      {brands.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">
          <svg className="w-12 h-12 mx-auto mb-3 text-pink-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          No brands yet. Add one to get started.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {brands.map((brand, idx) => {
          const gradient = CARD_GRADIENTS[idx % CARD_GRADIENTS.length]
          const primaryColor = brand.brand_colors?.colors?.[0]?.hex ?? brand.brand_colors?.primary ?? null

          return (
            <div key={brand.id} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 border border-pink-50">
              <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${!primaryColor ? `bg-gradient-to-br ${gradient}` : ''}`}
                      style={primaryColor ? { backgroundColor: primaryColor } : {}}
                    >
                      {brand.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{brand.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{brand.platforms?.join(' · ') ?? 'No platforms'}</p>
                    </div>
                  </div>
                  {brand.brand_colors?.colors && brand.brand_colors.colors.length > 0 && (
                    <div className="flex -space-x-1">
                      {brand.brand_colors.colors.slice(0, 4).map((c: { hex: string }, i: number) => (
                        <div key={i} className="w-5 h-5 rounded-full border-2 border-white" style={{ backgroundColor: c.hex }} />
                      ))}
                    </div>
                  )}
                </div>

                {brand.pillars && brand.pillars.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {brand.pillars.map(p => (
                      <span key={p.name} className="px-2.5 py-0.5 text-xs font-medium rounded-full" style={{ background: 'rgba(233,30,140,0.08)', color: '#be185d' }}>
                        {p.name}
                      </span>
                    ))}
                  </div>
                )}

                <Link href={`/brands/${brand.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: '#e91e8c' }}>
                  View / Edit
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
