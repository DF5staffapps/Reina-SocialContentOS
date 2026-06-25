import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import BrandSwitcher from '@/components/BrandSwitcher'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Social Content OS',
  description: 'Social media content planning',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full`}>
        <div className="flex h-full overflow-hidden">
          <Sidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-3 bg-white/80 backdrop-blur-sm border-b border-pink-100/60 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-5 rounded-full" style={{ background: 'linear-gradient(180deg, #e91e8c, #9c0f5f)' }} />
                <span className="text-sm font-semibold text-gray-400 tracking-wide">Dashboard</span>
              </div>
              <BrandSwitcher />
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
