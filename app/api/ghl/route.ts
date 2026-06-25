import { NextRequest, NextResponse } from 'next/server'

const GHL_BASE = 'https://services.leadconnectorhq.com'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, locationId, apiKey } = body

  if (!locationId || !apiKey) {
    return NextResponse.json({ error: 'Missing locationId or apiKey' }, { status: 400 })
  }

  if (action === 'fetch_accounts') {
    let res: Response
    try {
      res = await fetch(`${GHL_BASE}/social-media-posting/${locationId}/accounts`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: '2021-07-28',
        },
      })
    } catch (err) {
      return NextResponse.json({ error: `Network error: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: `GHL returned ${res.status}${text ? ': ' + text.slice(0, 200) : ''}` }, { status: res.status })
    }

    const data = await res.json()
    // GHL returns { accounts: [...] } — each account has id, name, type (platform)
    const accounts: GHLAccount[] = (data.accounts ?? data ?? []).map((a: Record<string, unknown>) => ({
      id: String(a.id ?? a._id ?? ''),
      name: String(a.name ?? a.displayName ?? ''),
      type: String(a.type ?? a.platform ?? '').toLowerCase(),
    }))

    return NextResponse.json({ accounts })
  }

  if (action === 'publish_post') {
    const { accountIds, summary, mediaUrl, scheduledAt } = body
    let res: Response
    try {
      res = await fetch(`${GHL_BASE}/social-media-posting/${locationId}/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: '2021-07-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountIds,
          summary,
          ...(mediaUrl ? { media: [{ url: mediaUrl }] } : {}),
          ...(scheduledAt ? { scheduledAt } : { status: 'draft' }),
        }),
      })
    } catch (err) {
      return NextResponse.json({ error: `Network error: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json({ error: `GHL returned ${res.status}${text ? ': ' + text.slice(0, 200) : ''}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ postId: data.id ?? data._id ?? null, data })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

interface GHLAccount {
  id: string
  name: string
  type: string
}
