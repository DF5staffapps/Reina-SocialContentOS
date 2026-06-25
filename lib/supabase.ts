import { createClient } from '@supabase/supabase-js'

// Lazily create the Supabase client so module-level evaluation during SSR
// (e.g. Next.js prerendering /_not-found) doesn't throw when env vars are absent.
// All components that use this are 'use client', so actual calls happen in-browser only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: ReturnType<typeof createClient<any>> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClient(): ReturnType<typeof createClient<any>> {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _client = createClient<any>(url, key)
  }
  return _client
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: ReturnType<typeof createClient<any>> = new Proxy({} as any, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(_target, prop: string) {
    return (getClient() as any)[prop]
  },
})
