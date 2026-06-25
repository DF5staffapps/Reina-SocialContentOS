import OpenAI, { toFile } from 'openai'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = new OpenAI({ apiKey })
  const formData = await req.formData()
  const action = formData.get('action') as string

  // ─── Transcribe video ─────────────────────────────────────────────────────
  if (action === 'transcribe') {
    const videoFile = formData.get('video') as File | null
    if (!videoFile) {
      return new Response(JSON.stringify({ error: 'No video file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const buffer = Buffer.from(await videoFile.arrayBuffer())
      const audioFile = await toFile(buffer, videoFile.name || 'video.mp4', { type: videoFile.type || 'video/mp4' })
      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
      })
      return new Response(JSON.stringify({ transcript: transcription.text }), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // ─── Analyze voice from posts + transcript ────────────────────────────────
  if (action === 'analyze') {
    const postsRaw = formData.get('posts') as string | null
    const transcript = (formData.get('transcript') as string | null) ?? ''
    const brandName = (formData.get('brand_name') as string | null) ?? 'this brand'

    let posts: string[] = []
    try {
      posts = postsRaw ? JSON.parse(postsRaw) : []
    } catch {
      posts = []
    }

    const filteredPosts = posts.filter(p => p?.trim())

    if (filteredPosts.length === 0 && !transcript.trim()) {
      return new Response(JSON.stringify({ error: 'Provide at least one example post or a transcript' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const postBlock = filteredPosts.length > 0
      ? `EXAMPLE POSTS:\n${filteredPosts.map((p, i) => `[Post ${i + 1}]\n${p}`).join('\n\n')}`
      : ''

    const transcriptBlock = transcript.trim()
      ? `VIDEO TRANSCRIPT:\n${transcript.trim()}`
      : ''

    const userPrompt = `Analyze the brand voice and personality for "${brandName}" based on the following real content examples.

${postBlock}${postBlock && transcriptBlock ? '\n\n' : ''}${transcriptBlock}

Find what makes this brand DISTINCTLY different from every other brand. Look for:
- Signature phrases or expressions they consistently use
- How they open posts (do they start with a question, a statement, a story?)
- How they address their audience (do they say "you", "we", "friend", use names?)
- Specific POV or contrarian takes they consistently hold
- What they do that others in their space DON'T do
- Humor style, metaphors, analogies they use
- What they NEVER say or do — words, phrases, or tones that feel off-brand
- The emotional register they write in (urgent, warm, provocative, calm, etc.)

Return a JSON object with exactly these fields:
- "personality_traits": array of 4-8 specific trait strings (e.g. "Speaks like a trusted friend, not a corporation", "Uses rhetorical questions to create reflection")
- "writing_rules": array of 5-10 specific, actionable rules the AI should follow when writing for this brand (e.g. "Always open with a one-sentence hook that creates tension or curiosity", "Never use corporate jargon like 'leverage' or 'synergy'")
- "vocab_use": array of specific words, phrases, or expressions this brand uses (draw directly from examples)
- "vocab_avoid": array of words, phrases, or tones that would feel off-brand
- "unique_markers": a paragraph describing what makes this brand's voice unmistakable — the fingerprint that no other brand has`

    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a brand voice analyst. You extract the unique, specific personality fingerprint of a brand from real content examples. Return only valid JSON.',
          },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1500,
      })

      const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      return new Response(JSON.stringify({
        personality_traits: result.personality_traits ?? [],
        writing_rules: result.writing_rules ?? [],
        vocab_use: result.vocab_use ?? [],
        vocab_avoid: result.vocab_avoid ?? [],
        unique_markers: result.unique_markers ?? '',
      }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}
