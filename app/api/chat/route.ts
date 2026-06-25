import OpenAI from 'openai'
import { NextRequest } from 'next/server'

type Brand = {
  name: string
  pillars: Array<{ name: string; description: string }> | null
  platforms: string[] | null
  offers: Array<{ name: string; description: string }> | null
  voice_tone: string | null
  icp: { raw?: string; audience?: string } | null
  brand_voice?: {
    personality_traits?: string[]
    writing_rules?: string[]
    vocab_use?: string[]
    vocab_avoid?: string[]
    example_posts?: string[]
    unique_markers?: string
  } | null
}

type Message = { role: 'user' | 'assistant'; content: string }

async function fetchLandingPageContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ''
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return ''
    const html = await res.text()
    // Remove script/style blocks entirely
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s{2,}/g, ' ')
      .trim()
    return stripped.slice(0, 4000)
  } catch {
    return ''
  }
}

// Factual brand info only — voice/personality goes in the system message via buildVoiceSystemPrompt
function buildBrandContext(brand: Brand) {
  const pillars = (brand.pillars ?? []).map(p => p.name).join(', ') || 'not defined'
  const platforms = (brand.platforms ?? []).join(', ') || 'linkedin, facebook'
  return `Brand: ${brand.name}
Platforms: ${platforms}
Content pillars: ${pillars}
Offers / CTAs: ${JSON.stringify(brand.offers ?? [])}
Voice & Tone: ${brand.voice_tone ?? 'not set'}`
}

// Builds the system-role voice identity — must be used as the system message for every caption-generating mode
function buildVoiceSystemPrompt(brand: Brand, extra = ''): string {
  const bv = brand.brand_voice
  const examplePosts = bv?.example_posts?.filter(p => p?.trim()) ?? []

  const parts: string[] = [
    `You are ghostwriting for ${brand.name}. Every word must sound like it came from the real human behind this brand — not from an AI, not from a marketing agency, not from a generic social media playbook.`,
  ]

  // Example posts FIRST — they are the ground truth for voice matching
  if (examplePosts.length > 0) {
    parts.push(`━━━ REAL POSTS FROM ${brand.name.toUpperCase()} — THIS IS THE EXACT VOICE TO MATCH ━━━

${examplePosts.map((p, i) => `[Post ${i + 1}]\n${p.trim()}`).join('\n\n')}

━━━ END EXAMPLES ━━━

Before writing anything, identify from the examples:
• How they open (hook pattern — statement, question, story drop?)
• Sentence rhythm (punchy and short? flowing and conversational? mixed?)
• How they address the reader ("you", "I", "we", first name?)
• What they include vs omit (lists, stories, questions, numbers?)
• Tone register (warm? provocative? direct? educational?)

Then write in THAT exact style — not inspired by it. In that exact style.`)
  }

  if (bv?.unique_markers) {
    parts.push(`WHAT MAKES ${brand.name.toUpperCase()} DIFFERENT:\n${bv.unique_markers}`)
  }

  if (bv?.personality_traits?.length) {
    parts.push(`PERSONALITY TRAITS: ${bv.personality_traits.join(' · ')}`)
  }

  if (bv?.writing_rules?.length) {
    parts.push(`WRITING RULES — every single one is non-negotiable:\n${bv.writing_rules.map(r => `• ${r}`).join('\n')}`)
  }

  if (bv?.vocab_use?.length || bv?.vocab_avoid?.length) {
    const v: string[] = []
    if (bv?.vocab_use?.length) v.push(`USE naturally: ${bv.vocab_use.join(', ')}`)
    if (bv?.vocab_avoid?.length) v.push(`NEVER write: ${bv.vocab_avoid.join(', ')}`)
    parts.push(`VOCABULARY:\n${v.join('\n')}`)
  }

  parts.push(`ANTI-GENERIC RULES — any of these means the caption fails:
• No AI-sounding openers: "In today's fast-paced world", "Are you ready to", "Unlock your potential", "Game-changer", "Level up your", "It's time to", "Picture this:", "Here's the thing:", "Here's the real clincher"
• No metaphor stacking — ONE analogy max per caption, only if it genuinely clarifies. Never layer: marathon + juggling + chess + candle. Pick one or use none.
• No rhetorical question chains — max TWO questions per caption. Back-to-back questions read as AI filler.
• No "But what if..." reframes — that pivot is the most overused AI close in existence. Find a real ending.
• No grand inspirational finales — "your next step might just change the race entirely", "because you deserve better", "it's time to level up" — these are emotional theatre, not actual content.
• No performative paired emoji (🏃‍♂️🏃‍♀️, 🔥✨) as scene-setting. Emoji, if used, belongs at the end and only if it fits naturally.
• No vague inspiration that could belong to any brand on earth
• No bullet-list captions that read like a LinkedIn thought-leader template
• Every post must feel written FOR one specific person — not broadcast at a crowd
• Use concrete, specific details over general statements — name the actual situation, not a metaphor for it
• The reader must think "this brand gets me" — not "this is solid content"
• Read it back: if a stranger could replace the brand name and it still sounds right, rewrite it`)

  if (extra) parts.push(extra)

  return parts.join('\n\n')
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not set in .env.local' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = new OpenAI({ apiKey })
  const body = await req.json() as {
    messages: Message[]
    brand: Brand
    mode: string
    strategy?: string
    weekStart?: string
    campaignContext?: string
    campaignPlan?: string
    dateStart?: string
    dateEnd?: string
    goal?: string
    landingPage?: string
    gdriveContext?: string
    imageDataUrl?: string
    fileId?: string
    postsPerWeek?: number
    // regenerate-post
    postPhase?: string
    postPlatform?: string
    postPillar?: string
    postConcept?: string
    // generate-graphic
    graphicConcept?: string
    graphicCaption?: string
    graphicPhase?: string
    graphicPlatform?: string
    styleRefs?: Array<{ description: string | null; style_tags: string[] | null }>
    modifyInstructions?: string
    // campaign-posts asset context
    availablePhotos?: Array<{ id: string; name: string; description: string | null }>
    availableVideos?: Array<{ url: string; description: string }>
    // pdf text extraction
    pdfText?: string
    // testimonial integration for campaign posts
    availableTestimonials?: Array<{ id: string; author_name: string | null; author_title: string | null; content: string | null; rating: number | null; is_campaign_testimonial?: boolean }>
    // testimonial graphic generation
    testimonialContent?: string
    testimonialAuthor?: string
    testimonialRating?: number
  }
  const { messages, brand, mode } = body
  const brandContext = buildBrandContext(brand)
  const icp = brand.icp?.raw ?? brand.icp?.audience ?? 'not set'

  // ─── Detect sensitive info regions (for blurring) ─────────────────────────
  if (mode === 'detect-sensitive-info') {
    if (!body.imageDataUrl) {
      return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: body.imageDataUrl } },
            { type: 'text', text: `Examine this image for sensitive private information that should be blurred before publishing — specifically phone numbers, mobile numbers, email addresses, and any other personal contact details.

Return a JSON object with:
- "found": boolean — whether any sensitive info was detected
- "regions": array of objects, each with:
  - "label": what was found (e.g. "phone number", "email address")
  - "x": left edge as fraction of image width (0.0–1.0)
  - "y": top edge as fraction of image height (0.0–1.0)
  - "width": region width as fraction of image width (0.0–1.0)
  - "height": region height as fraction of image height (0.0–1.0)

Be generous with the bounding box — include some padding around the sensitive text so it is fully covered. Return ONLY valid JSON.` },
          ],
        }],
        max_tokens: 400,
        response_format: { type: 'json_object' },
      })
      const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      return new Response(JSON.stringify({
        found: result.found ?? false,
        regions: result.regions ?? [],
      }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Extract multiple testimonials from PDF text ───────────────────────────
  if (mode === 'extract-testimonials') {
    const pdfText = (body as { pdfText?: string }).pdfText ?? ''
    if (!pdfText.trim()) {
      return new Response(JSON.stringify({ testimonials: [] }), { headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You extract structured testimonials from text. Return only valid JSON.' },
          { role: 'user', content: `The following text contains one or more customer testimonials or reviews. Extract each individual testimonial as a separate item.

Return a JSON object with a "testimonials" array. Each item:
- "author_name": reviewer's name or null
- "author_title": their role, company, or social handle or null
- "content": the full testimonial text exactly as written
- "rating": numeric star rating 1-5 if mentioned, otherwise null

TEXT:
${pdfText.slice(0, 8000)}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
      })
      const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      return new Response(JSON.stringify({ testimonials: result.testimonials ?? [] }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Testimonial image extraction ─────────────────────────────────────────
  if (mode === 'analyze-testimonial') {
    if (!body.imageDataUrl) {
      return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: body.imageDataUrl } },
            { type: 'text', text: `This is a screenshot of a testimonial, review, or customer feedback. Extract the information and return a JSON object with:
- "author_name": the reviewer's name (or null if not visible)
- "author_title": their title, role, or handle (e.g. "@janedoe", "CEO at Acme", or null)
- "content": the full testimonial text, exactly as written
- "rating": numeric star rating 1-5 if visible (or null)

Return ONLY valid JSON.` },
          ],
        }],
        max_tokens: 500,
        response_format: { type: 'json_object' },
      })
      const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Photo content analysis ────────────────────────────────────────────────
  if (mode === 'analyze-photo') {
    if (!body.imageDataUrl) {
      return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: body.imageDataUrl } },
            { type: 'text', text: `Analyze this photo for use in social media content selection. Return a JSON object with:
- "description": 2-3 sentences describing: what is in the photo (subject, setting, people/objects), the mood/atmosphere, and the dominant visual composition (where is the main subject, where is empty/negative space that could hold text overlay)
- "composition_notes": one sentence specifically about where text could be placed as an overlay (e.g. "Clear empty space at top", "Dark lower third ideal for text", "Subject centered with space on both sides", "Busy background — text needs strong contrast")
- "mood": 2-4 words describing the emotional feel (e.g. "professional, confident", "warm, aspirational")
- "best_use": one of "as_is" | "text_overlay" | "both" — whether this photo works best as-is or with text

Return ONLY valid JSON.` },
          ],
        }],
        max_tokens: 400,
        response_format: { type: 'json_object' },
      })
      const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      const description = [result.description, result.composition_notes, `Mood: ${result.mood}`, `Best use: ${result.best_use}`].filter(Boolean).join(' | ')
      return new Response(JSON.stringify({ description, best_use: result.best_use ?? 'both' }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Style reference analysis ─────────────────────────────────────────────
  if (mode === 'analyze-style') {
    if (!body.imageDataUrl) {
      return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: body.imageDataUrl } },
            { type: 'text', text: `Analyze the visual style of this image for use as a graphic design reference. Return a JSON object with:
- "description": a 1–2 sentence summary of the overall visual style (e.g. "Dark cinematic photography with high contrast and moody blue tones")
- "style_tags": an array of 3–6 concise style keywords (e.g. ["cinematic", "dark moody", "high contrast", "blue tones"])

Focus only on visual/aesthetic style: color palette, mood, rendering technique (photo, illustration, 3D, flat design, etc.), lighting, composition style. Do not describe the subject matter.

Return ONLY valid JSON.` },
          ],
        }],
        max_tokens: 300,
        response_format: { type: 'json_object' },
      })
      const result = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      return new Response(JSON.stringify({
        description: result.description ?? '',
        style_tags: result.style_tags ?? [],
      }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Image analysis (GPT-4o vision) ──────────────────────────────────────
  if (mode === 'analyze-image') {
    if (!body.imageDataUrl) {
      return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: body.imageDataUrl } },
            { type: 'text', text: 'Describe this image in detail for a social media marketing campaign context. Include: what is shown, any visible text or branding, the mood and visual style, the apparent purpose, and specific suggestions for when and how to use it in a content campaign (e.g. which platform suits it, what caption angle fits, what stage of the funnel it suits). Be specific and practical.' },
          ],
        }],
        max_tokens: 600,
      })
      const description = completion.choices[0]?.message?.content ?? ''
      return new Response(JSON.stringify({ description }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Google Drive video analysis (thumbnail vision + Whisper transcript) ────
  if (mode === 'analyze-gdrive') {
    const fileId = body.fileId
    if (!fileId) {
      return new Response(JSON.stringify({ error: 'No fileId provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    let visualDescription = ''
    let transcript = ''

    // Step 1: Thumbnail → GPT-4o vision
    try {
      const thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
      const thumbRes = await fetch(thumbnailUrl)
      const ct = thumbRes.headers.get('content-type') ?? ''
      if (thumbRes.ok && ct.startsWith('image/')) {
        const thumbBuffer = await thumbRes.arrayBuffer()
        const base64  = Buffer.from(thumbBuffer).toString('base64')
        const dataUrl = `data:${ct};base64,${base64}`
        const vision  = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl } },
              { type: 'text', text: 'This is a thumbnail or frame from a video. Describe: what you see visually, the apparent topic, mood and style, any visible text, branding or people, and how this video could be used in a social media marketing campaign.' },
            ],
          }],
          max_tokens: 400,
        })
        visualDescription = vision.choices[0]?.message?.content ?? ''
      }
    } catch { /* thumbnail unavailable — private or non-existent file */ }

    // Step 2: Audio → Whisper transcription
    // Works for publicly shared Drive files under ~24 MB
    try {
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`
      const videoRes = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      })
      const contentType = videoRes.headers.get('content-type') ?? ''
      // Skip Google's HTML "virus scan" confirmation page served for large files
      if (videoRes.ok && !contentType.includes('text/html')) {
        const buffer = await videoRes.arrayBuffer()
        if (buffer.byteLength < 24 * 1024 * 1024) {
          const { toFile } = await import('openai')
          const audioFile   = await toFile(Buffer.from(buffer), 'audio.mp4', { type: 'audio/mp4' })
          const transcription = await client.audio.transcriptions.create({ file: audioFile, model: 'whisper-1' })
          transcript = transcription.text
        }
      }
    } catch { /* transcription unavailable */ }

    return new Response(
      JSON.stringify({ visualDescription, transcript }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ─── Campaign plan (streaming) ────────────────────────────────────────────
  if (mode === 'campaign-plan') {
    const landingPageContent = body.landingPage ? await fetchLandingPageContent(body.landingPage) : ''

    const systemPrompt = `You are a senior social media campaign strategist for ${brand.name}.

BRAND CONTEXT:
${brandContext}

ICP (Ideal Client Profile):
${icp}

Your job is to create a detailed, date-specific campaign plan. The campaign targets the brand's ideal clients described in the ICP above.

## Content Journey Framework — WHY → HOW → WHAT

Every campaign must follow this three-phase journey. Never jump straight to selling.

### Phase 1 — WHY (Awareness & Curiosity)
The audience doesn't know they need this yet. Don't mention the offer. Instead:
- Surface the pain, frustration, or gap the ICP feels
- Ask provocative questions that make them stop and think
- Use teasers, bold statements, and contrarian takes
- Build intrigue: hint that something is coming without revealing it
- Goal: make them feel seen and curious

### Phase 2 — HOW (Education & Trust)
The audience is aware of the problem. Now show them the approach:
- Educate on the method, process, or mindset behind the solution
- Share behind-the-scenes, frameworks, or "how we think about X"
- Use storytelling, case study snippets, and transformations
- Soft CTAs only (save this, follow for more, comment your thoughts)
- Goal: position the brand as the authority before revealing the offer

### Phase 3 — WHAT (Offer & Conversion)
The audience trusts you. Now make the ask:
- Introduce the offer clearly and confidently
- Tie it directly to the pains from Phase 1 and the method from Phase 2
- Use testimonials, results, specifics (price, dates, bonuses)
- Direct CTA to the landing page
- Goal: convert warm, primed leads — not cold strangers

## Plan structure
- Start with a campaign overview: key message, audience hook, and how the WHY→HOW→WHAT arc will play out
- Map phases to weeks/dates across the campaign duration
- For each phase: name the theme, list specific post ideas per platform with caption angles
- Show exactly when to tease, when to educate, and when to sell
- Reference the ICP's specific pain points and language throughout
- Format with clear markdown headers`

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = await client.chat.completions.create({
            model: 'gpt-4o',
            stream: true,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Generate the campaign plan.\n\n${body.campaignContext ?? ''}${landingPageContent ? `\n\nLANDING PAGE CONTENT (scraped from ${body.landingPage}):\n${landingPageContent}` : ''}${body.gdriveContext ? `\n\nVIDEO / MEDIA ASSETS:\n${body.gdriveContext}` : ''}` },
            ],
          })
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? ''
            if (text) controller.enqueue(encoder.encode(text))
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`\n\n[Error: ${err instanceof Error ? err.message : String(err)}]`))
        } finally {
          controller.close()
        }
      },
    })
    return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
  }

  // ─── Generate graphic with DALL-E 3 ──────────────────────────────────────
  if (mode === 'generate-graphic') {
    const phase = body.graphicPhase ?? 'why'
    const platform = body.graphicPlatform ?? 'instagram'
    const concept = body.graphicConcept ?? ''
    const caption = body.graphicCaption ?? ''
    const styleRefs = body.styleRefs ?? []
    const modify = body.modifyInstructions ?? ''

    const phaseDirection: Record<string, string> = {
      why: 'Mysterious, thought-provoking, emotionally evocative. No product or offer shown. Focus on the feeling or problem — curiosity, tension, or longing.',
      how: 'Clean, educational, trustworthy. Can include abstract diagrams, process visuals, or a professional scene. Calm and authoritative.',
      what: 'Bold, energetic, confident. Visually communicates transformation or achievement. Can be bright and attention-grabbing.',
    }

    const styleContext = styleRefs.length > 0
      ? `Graphic style to match: ${styleRefs.map(r => [r.description, ...(r.style_tags ?? [])].filter(Boolean).join(', ')).join(' | ')}.`
      : ''

    const platformFormat: Record<string, string> = {
      instagram: 'Square (1:1) social media post format.',
      facebook: 'Landscape social media post format.',
      linkedin: 'Professional landscape format suitable for LinkedIn.',
      twitter: 'Horizontal social media format.',
    }

    const prompt = [
      `Social media graphic for ${platform}.`,
      platformFormat[platform] ?? '',
      `Content theme: ${concept}`,
      caption ? `Caption context (do NOT include text in the image): "${caption.slice(0, 200)}"` : '',
      phaseDirection[phase] ?? phaseDirection.why,
      styleContext,
      modify ? `Modification request: ${modify}` : '',
      'No text, words, or typography in the image. High quality, professional, suitable for brand social media.',
    ].filter(Boolean).join(' ')

    try {
      const image = await client.images.generate({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
      })
      const b64 = (image.data ?? [])[0]?.b64_json ?? ''
      return new Response(JSON.stringify({ b64 }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Generate testimonial quote-card graphic ─────────────────────────────
  if (mode === 'generate-testimonial-graphic') {
    const testimonialContent = body.testimonialContent ?? ''
    const testimonialAuthor = body.testimonialAuthor ?? ''
    const styleRefs = body.styleRefs ?? []

    const styleContext = styleRefs.length > 0
      ? `Design style to match: ${styleRefs.map(r => [r.description, ...(r.style_tags ?? [])].filter(Boolean).join(', ')).filter(Boolean).join(' | ')}.`
      : 'Clean, modern, professional testimonial card design with subtle gradient background.'

    const prompt = [
      'Professional testimonial quote card background for social media. Square 1:1 format.',
      styleContext,
      'Design elements: elegant background (gradient, texture, or solid with decorative accents), decorative quotation mark motif, clear empty center area for the quote text to be overlaid later.',
      testimonialAuthor ? `The testimonial is from: ${testimonialAuthor}.` : 'For a satisfied customer testimonial.',
      testimonialContent ? `Tone of the testimonial: "${testimonialContent.slice(0, 120)}"` : '',
      'NO text, words, numbers, or typography in the image. High quality, brand-appropriate, Instagram and Facebook ready.',
    ].filter(Boolean).join(' ')

    try {
      const image = await client.images.generate({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
      })
      const b64 = (image.data ?? [])[0]?.b64_json ?? ''
      return new Response(JSON.stringify({ b64 }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Regenerate single post caption ──────────────────────────────────────
  if (mode === 'regenerate-post') {
    const phaseRules: Record<string, string> = {
      why: `Write a WHY caption (120–200 words). Storytelling format: open with a hook (bold statement, one direct question, or drop into a specific concrete moment — not a metaphor). Paint the ICP's pain using their real situation and real language — specific beats abstract every time. Build tension by staying in the specific. End with ONE thought-provoking line or soft tease — not a "what if" reframe, not an inspirational close. Never mention the offer or product. No metaphor stacking (one analogy max). Max two questions total.`,
      how: `Write a HOW caption (100–180 words). Educational format: share a framework, process, or specific insight with clear structure. Be actionable. Soft CTA only (save this, comment, follow for more).`,
      what: `Write a WHAT caption (80–150 words). Conversion format: lead with the transformation/result, name the offer clearly and confidently, include a direct CTA${body.landingPage ? ` to ${body.landingPage}` : ''}.`,
    }
    const phase = body.postPhase ?? 'why'
    const rule = phaseRules[phase] ?? phaseRules.why

    const prompt = `You are a social media copywriter for ${brand.name}.

BRAND CONTEXT:
${brandContext}

ICP:
${icp}

CAMPAIGN CONTEXT:
${body.campaignContext ?? ''}

POST BRIEF:
Platform: ${body.postPlatform ?? ''}
Pillar: ${body.postPillar ?? ''}
Idea: ${body.postConcept ?? ''}

TASK:
${rule}

Write only the caption text. No labels, no explanation. Match the brand's voice and tone exactly.`

    const systemMsg = buildVoiceSystemPrompt(brand, 'Output only the caption text. No labels, no explanation, no surrounding quotes.')

    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt },
        ],
      })
      const caption = completion.choices[0]?.message?.content ?? ''
      return new Response(JSON.stringify({ caption }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Campaign posts (JSON) ─────────────────────────────────────────────────
  if (mode === 'campaign-posts') {
    const landingPageContent = body.landingPage ? await fetchLandingPageContent(body.landingPage) : ''
    const platformList = brand.platforms ?? ['linkedin', 'facebook']
    const pillarNames = (brand.pillars ?? []).map(p => p.name)

    // Build a list of all dates in the range
    const start = new Date(body.dateStart!)
    const end = new Date(body.dateEnd!)
    const allDates: string[] = []
    const cur = new Date(start)
    while (cur <= end) {
      // Skip Sundays for post scheduling (optional — model can decide)
      const isoDate = cur.toISOString().split('T')[0]
      allDates.push(isoDate)
      cur.setDate(cur.getDate() + 1)
    }

    // Build testimonials context block
    let testimonialsBlock = ''
    if (body.availableTestimonials && body.availableTestimonials.length > 0) {
      const campaignOnes = body.availableTestimonials.filter(t => t.is_campaign_testimonial)
      const generalOnes  = body.availableTestimonials.filter(t => !t.is_campaign_testimonial)
      const lines: string[] = ['AVAILABLE TESTIMONIALS (for WHAT phase posts — use these as social proof):']
      if (campaignOnes.length > 0) {
        lines.push('★ CAMPAIGN-SPECIFIC (prioritise these — collected for this exact campaign):')
        campaignOnes.forEach(t => lines.push(`  - id: "${t.id}" | ${t.author_name ?? 'Anonymous'}${t.author_title ? ` (${t.author_title})` : ''}${t.rating ? ` ★${t.rating}` : ''} | "${(t.content ?? '').slice(0, 180)}"`))
      }
      if (generalOnes.length > 0) {
        if (campaignOnes.length > 0) lines.push('General (use if campaign-specific are exhausted):')
        generalOnes.forEach(t => lines.push(`  - id: "${t.id}" | ${t.author_name ?? 'Anonymous'}${t.author_title ? ` (${t.author_title})` : ''}${t.rating ? ` ★${t.rating}` : ''} | "${(t.content ?? '').slice(0, 180)}"`))
      }
      lines.push('\nFor WHAT posts featuring a testimonial, set "testimonial_id" to the matching id above. For all other posts set "testimonial_id" to null. Rotate testimonials across WHAT posts — don\'t repeat the same one.')
      testimonialsBlock = lines.join('\n')
    }

    const prompt = `BRAND: ${brand.name}
PLATFORMS: ${(brand.platforms ?? []).join(', ')}
PILLARS: ${(brand.pillars ?? []).map(p => p.name).join(', ') || 'not defined'}
OFFERS: ${JSON.stringify(brand.offers ?? [])}

WRITE FOR THIS SPECIFIC PERSON (ICP):
${icp}
→ Every caption must make this person feel: "This brand is speaking directly to me."

CAMPAIGN PLAN:
${body.campaignPlan ?? ''}

CAMPAIGN DETAILS:
Date range: ${body.dateStart} to ${body.dateEnd}
Goal: ${body.goal ?? 'not specified'}
Landing page: ${body.landingPage ?? 'not provided'}
${landingPageContent ? `\nLANDING PAGE CONTENT (scraped from ${body.landingPage}):\n${landingPageContent}` : ''}${body.gdriveContext ? `\nVIDEO / MEDIA ASSETS (reference these in relevant post concepts):\n${body.gdriveContext}` : ''}

Generate individual post ideas for this campaign following the WHY → HOW → WHAT content journey:

- WHY posts (first ~30% of the campaign): teasers, pain-point questions, bold statements — NO mention of the offer yet. Build curiosity and make the ICP feel deeply understood.
- HOW posts (middle ~40%): educate on the approach, share frameworks, behind-the-scenes, soft CTAs only.
- WHAT posts (final ~30%): introduce and push the offer, direct CTA to the landing page, testimonials, urgency.

Spread posts across the date range (${allDates.length} days). Aim for ${body.postsPerWeek ? `exactly ${body.postsPerWeek} posts per week` : '3–5 posts per week'}. Skip weekends unless the campaign requires them. Vary platforms and pillars.

Available dates: ${allDates.join(', ')}
Platforms to use: ${platformList.join(', ')}${pillarNames.length ? `\nPillars: ${pillarNames.join(', ')}` : ''}

CAPTION WRITING RULES (apply per phase):

WHY captions — storytelling format, 120–200 words:
- Open with a hook: a bold statement, OR one direct question, OR drop straight into a specific moment (name the actual scene, not a metaphor for it)
- Paint the pain concretely — use the ICP's real situation and real language. "You're still charting at 10pm" beats "You're running two marathons at once."
- Build tension by staying in the specific, not drifting into the abstract
- End with ONE thought-provoking line or soft tease — not a "what if" pivot, not an inspirational maxim. Something that lands and leaves them thinking.
- Never mention the offer or product
- No metaphor stacking — if you use an analogy, use ONE and make it earn its place
- Max two questions in the entire caption

HOW captions — educational, 100–180 words:
- Share a framework, process, or insight with clear structure (numbered steps or short paragraphs)
- Be specific and actionable — give real value
- Soft CTA only: "Save this", "Drop a comment", "Follow for more"

WHAT captions — conversion-focused, 80–150 words:
- Lead with the transformation/result, not the features
- Name the offer clearly and confidently
- Include social proof or a specific result if available
- Direct CTA with the landing page link

FORMAT + GRAPHIC ASSIGNMENT RULES:

For each post, decide TWO things independently: (1) the post format, and (2) the graphic type.

## POST FORMAT (post_format field)
Choose the best format for the content — do not default everything to one format:

- "single" — one image or graphic. Best for: a single bold insight, quote, lifestyle moment, strong visual concept, or simple CTA. Fast to consume, high reach.
- "carousel" — 3–8 swipeable slides. Best for: step-by-step frameworks, lists of tips, comparisons (before/after, myth vs truth), multi-part storytelling, educational breakdowns with distinct points. Carousels get saved and shared — use them for HOW content with structure.
- "video" — talking-head, screen-share, or b-roll. Best for: personal stories, process demonstrations, behind-the-scenes, emotional WHY content, and HOW content that flows better as explanation than as slides.

FORMAT DECISION GUIDE per phase:
- WHY: single (bold statement/teaser image) or video (personal story that builds emotion) — carousels rarely work here
- HOW: carousel (if it's a framework, steps, or list of tips) OR video (if it's a process explanation, walkthrough, or personal insight that needs voice/face) OR single (if it's one clear insight with a strong visual)
- WHAT: single (offer image with overlay) or carousel (proof/testimonials/features breakdown) or video (testimonial or demo)

## GRAPHIC TYPE (graphic_type field)
Once you know the format, decide the visual:

- "photo_asis" — brand photo used as-is. For single/video posts with authentic lifestyle feel.
- "photo_overlay" — brand photo with bold text overlay. For WHY teasers and WHAT announcements.
- "ai_generated" — AI-generated image. For abstract concepts or when no suitable photo exists.
- "video" — video content. Only use when post_format is "video".

VIDEO RULE: If post_format is "video" and a matching campaign video URL exists, assign it as video_url and leave video_outline and video_script null. If NO suitable video exists, leave video_url null and populate BOTH:
1. video_outline — a brief production guide: title, format (talking-head / screen-share / b-roll), duration (60–90s for reels, 2–5min for LinkedIn), and 4–6 bullet points of what to say or show.
2. video_script — the complete, word-for-word spoken script for the video that an AI video generation tool can use directly. Write it as continuous narration (no bullet points). Include: a strong hook in the first 3 seconds, all key points from the outline fully fleshed out with natural spoken language, transitions between points, and a clear CTA at the end. The script should be ready to paste into an AI video tool (e.g. HeyGen, Synthesia, Runway) with zero editing needed.
Do not force every HOW post to be a video — only assign video when the content genuinely calls for it.

CAROUSEL NOTE: For carousel posts, the caption should be written as carousel copy — hook on slide 1, one point per slide, CTA on last slide. Indicate this structure in the caption using "Slide 1:", "Slide 2:", etc.

Overlay placement options: "top" | "center" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right"
Choose based on the photo description's composition notes (e.g. if there's empty sky at top → "top", dark lower third → "bottom", centered subject → "top" or "bottom").

${body.availablePhotos && body.availablePhotos.length > 0 ? `AVAILABLE BRAND PHOTOS (use photo_id from this list):
${body.availablePhotos.map(p => `- id: "${p.id}" | name: "${p.name}" | ${p.description ?? 'no description'}`).join('\n')}` : 'No brand photos available — use "ai_generated" for non-video posts.'}

${body.availableVideos && body.availableVideos.length > 0 ? `AVAILABLE CAMPAIGN VIDEOS:
${body.availableVideos.map(v => `- url: "${v.url}" | ${v.description}`).join('\n')}` : 'No campaign videos uploaded yet — for all HOW posts, set graphic_type to "video", leave video_url null, and write a video_outline.'}

${testimonialsBlock}

Return a JSON object with a "posts" array. Each post:
- date: string (YYYY-MM-DD, must be one of the available dates)
- day_of_week: integer (1=Mon … 7=Sun)
- platform: string
- pillar: string (empty if not applicable)
- phase: string ("why", "how", or "what")
- concept: string (1-sentence internal brief of what this post is about)
- caption: string (the full ready-to-use social media caption following the rules above)
- post_format: string ("single" | "carousel" | "video")
- graphic_type: string ("photo_asis" | "photo_overlay" | "ai_generated" | "video")
- photo_id: string | null (the photo id from the available photos list, or null)
- overlay_headlines: string[] | null (3 short headline/hook options if graphic_type is "photo_overlay", else null)
- overlay_placement: string | null (text placement if graphic_type is "photo_overlay", else null)
- video_url: string | null (matching campaign video URL if post_format is "video" and one exists, else null)
- video_outline: string | null (recording brief if post_format is "video" and video_url is null, else null)
- video_script: string | null (complete word-for-word spoken script if post_format is "video" and video_url is null, else null — this must be full narration an AI video tool can use directly)
- testimonial_id: string | null (id of the testimonial featured in this post, or null)
- hashtags: string (space-separated hashtags appropriate for the platform — 10-15 for Instagram, 3-5 for LinkedIn/Facebook, 5-10 for TikTok. Include the # symbol. Relevant to the post topic and brand.)
- cta_url: string | null (the landing page URL for WHAT posts with a direct CTA, else null)

Return ONLY valid JSON.`

    const campaignSystemMsg = buildVoiceSystemPrompt(brand, 'You are also a campaign content planner. Return only valid JSON — no prose, no explanation, just the JSON object.')

    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: campaignSystemMsg },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      })
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      return new Response(JSON.stringify({ posts: parsed.posts ?? [] }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Weekly posts (JSON) ───────────────────────────────────────────────────
  if (mode === 'weekly') {
    const pillarNames = (brand.pillars ?? []).map(p => p.name)
    const platformList = brand.platforms ?? ['linkedin', 'facebook']
    const bv = brand.brand_voice

    const prompt = `Generate ${4}-6 posts for the week of ${body.weekStart} based on the strategy below.

BRAND: ${brand.name}
PLATFORMS: ${platformList.join(', ')}${pillarNames.length ? `\nPILLARS: ${pillarNames.join(', ')}` : ''}
OFFERS: ${JSON.stringify(brand.offers ?? [])}

WRITE FOR THIS SPECIFIC PERSON (ICP):
${icp}
→ Every caption must make this person feel: "This is written for me."

MONTHLY STRATEGY (pull themes and ideas from this):
${body.strategy ?? ''}

CAPTION REQUIREMENTS:
- Vary platforms and pillars across the week
- Platform tone: LinkedIn = insight-led with a personal angle; Instagram/Facebook = story-led; Twitter/X = punchy
- Each caption: hook that stops the scroll → body with real substance → close with a question, CTA, or line that sticks
- Speak to the ICP's specific situation — use their language, not generic advice language

Return a JSON object with a "posts" array. Each post:
- day_of_week: integer (1=Mon … 7=Sun)
- platform: string
- pillar: string (empty if not applicable)
- concept: string (1-sentence internal brief)
- caption: string (full ready-to-post caption)
- hashtags: string (space-separated with # — 10-15 for Instagram, 3-5 for LinkedIn/Facebook)

Return ONLY valid JSON.`

    const weeklySystemMsg = buildVoiceSystemPrompt(brand, 'You are also a weekly content planner. Return only valid JSON — no prose, no explanation.')

    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: weeklySystemMsg },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      })
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      return new Response(JSON.stringify({ posts: parsed.posts ?? [] }), { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── Streaming: strategy + campaign chat ──────────────────────────────────
  const streamingBase = buildVoiceSystemPrompt(brand)
  const systemPrompt = mode === 'strategy'
    ? `${streamingBase}

You are also a senior social media content strategist. Create a detailed monthly content plan for ${brand.name}.

BRAND INFO:
${brandContext}

ICP: ${icp}

When generating the strategy:
- Organise into 4 weeks with clear themes
- Cover every platform listed
- Anchor content to the pillars (spread evenly)
- Write post concepts that sound like this brand's actual voice — not generic topic categories
- For each week: theme, platform breakdown, specific post concepts, and one key CTA
- Format with clear markdown headers`
    : `${streamingBase}

You are also a campaign planning agent for ${brand.name}. Turn campaign briefs into detailed, ready-to-execute content plans.

BRAND INFO:
${brandContext}

ICP: ${icp}

When planning a campaign:
- Write a campaign overview (goal, audience, duration, key message)
- Create a content calendar with specific timing
- Post-by-post ideas per platform written in this brand's actual voice
- Sample captions that match the brand voice and ICP
- Hashtag suggestions and CTAs
- Format with clear markdown`

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await client.chat.completions.create({
          model: 'gpt-4o',
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          ],
        })
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) controller.enqueue(encoder.encode(text))
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[Error: ${err instanceof Error ? err.message : String(err)}]`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
}
