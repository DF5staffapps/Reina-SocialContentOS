'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Brand } from '@/types/database'

export default function BrandSwitcher() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    supabase.from('brands').select('id, name').order('name').then(({ data }) => {
      if (data) {
        setBrands(data as Brand[])
        const stored = localStorage.getItem('selectedBrandId')
        const initial = stored && data.find(b => b.id === stored) ? stored : data[0]?.id ?? ''
        setSelected(initial)
        if (initial) localStorage.setItem('selectedBrandId', initial)
      }
    })
  }, [])

  function handleChange(id: string) {
    setSelected(id)
    localStorage.setItem('selectedBrandId', id)
    window.dispatchEvent(new Event('brandChanged'))
  }

  if (!brands.length) return null

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#e91e8c' }} />
        Active brand
      </div>
      <div className="relative">
        <select
          value={selected}
          onChange={e => handleChange(e.target.value)}
          className="appearance-none pl-3 pr-7 py-1.5 text-sm font-medium text-gray-800 bg-pink-50/50 border border-pink-100 rounded-lg focus:outline-none focus:ring-2 focus:border-[#e91e8c] transition-colors cursor-pointer"
          style={{ focusRingColor: 'rgba(233,30,140,0.3)' }}
        >
          {brands.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-pink-300 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}
