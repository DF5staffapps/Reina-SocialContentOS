# Architecture — Social Content OS

**Version:** 1.0  
**Date:** 2026-06-23  
**Status:** Active Development

---

## Section 1: Project Overview

**Project name:** Social Content OS  
**Slug prefix:** `sco_`  
**Architecture type:** Dashboard / SaaS

Social Content OS is an AI-powered content operating system for marketing teams and agencies managing multiple client brands. It unifies strategy, campaign planning, post generation, scheduling, and performance tracking into a single workspace where AI has full brand context at every step.

**External system integrations:**
- **OpenAI API** (outbound): Chat completions (gpt-4o), vision analysis, image generation (DALL-E 3)
- **GoHighLevel API** (planned Phase 2–3): Social post scheduling, analytics retrieval
- **Google Drive** (outbound): Video and image analysis via shareable links

---

## Section 2: Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 16.2.9 | App Router; read `node_modules/next/dist/docs/` before writing route code |
| UI Library | React | 19.2.4 | Required by this version of Next.js |
| Language | TypeScript | 5 | |
| Styling | Tailwind CSS | 4 | Rust-native `oxide` binary — confirmed working on this machine |
| Database | Supabase (PostgreSQL) | — | |
| File Storage | Supabase Storage | — | Private bucket `scos-brand-assets` |
| AI — Chat/Vision | OpenAI gpt-4o | — | Use family alias, never dated snapshots |
| AI — Image Gen | OpenAI DALL-E 3 | — | |
| AI — SDK Fallback | Anthropic SDK | ^0.105.0 | Installed; minimal use in v1 |
| PDF Parsing | PDF.js | 6.0.227 | Client-side; no server dependency |
| PDF Export | html2pdf.js | 0.14.0 | Client-side |
| Linting | ESLint | 9 | |
| Dev port | — | 3006 | `http://localhost:3006` |

**Model pinning rule:** Never pin dated model snapshots (e.g., `gpt-4o-2024-08-06`). Use the family alias (`gpt-4o`) with an "as of YYYY-MM" comment. Dated snapshots get deprecated and silently 404.

---

## Section 3: Three-Layer Architecture

The project is organized into **three layers** with strict boundaries:

| Layer | Location | Responsibility | May call | Must NOT call |
|-------|----------|---------------|----------|---------------|
| **Presentation** | `app/`, `components/` | UI, routes, forms, client-side interactivity | Service layer only | Supabase directly, any external API |
| **Service** | `lib/services/` | Business logic, data access | Supabase (PostgREST) | Third-party APIs directly |
| **Agent** | `app/api/` | AI orchestration, external API calls | OpenAI, Supabase (via service layer) | Return raw third-party responses without shaping |

**Non-negotiable rule:** The Presentation layer never imports the Supabase client and never calls `supabase.from(...)`. All data access goes through functions in `lib/services/*`. The Agent layer (`app/api/`) is the only place that calls OpenAI.

---

## Section 4: Project Structure

```
socialcontentOS/
├── app/                          # PRESENTATION + AGENT LAYER (Next.js App Router)
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Single AI endpoint (all modes)
│   ├── assets/
│   │   └── page.tsx              # Brand asset library
│   ├── brands/
│   │   ├── page.tsx              # Brand list
│   │   └── [id]/
│   │       └── page.tsx          # Brand settings editor
│   ├── calendar/
│   │   └── page.tsx              # Post calendar view
│   ├── campaigns/
│   │   ├── page.tsx              # Campaign list
│   │   ├── new/
│   │   │   └── page.tsx          # Create campaign
│   │   └── [id]/
│   │       └── page.tsx          # Campaign detail + post generation
│   ├── kpis/
│   │   └── page.tsx              # KPI tracking
│   ├── strategy/
│   │   └── page.tsx              # Strategy AI chat
│   ├── testimonials/
│   │   └── page.tsx              # Testimonial library
│   ├── layout.tsx                # Root layout with Sidebar
│   ├── page.tsx                  # Redirect → /brands
│   └── globals.css
├── components/
│   ├── Sidebar.tsx               # Main navigation
│   └── BrandSwitcher.tsx         # Brand selection dropdown
├── lib/
│   ├── supabase.ts               # Lazy Supabase client (createClient<any>)
│   └── services/                 # SERVICE LAYER (planned migration target)
│       ├── brands.ts
│       ├── campaigns.ts
│       ├── posts.ts
│       ├── strategies.ts
│       ├── assets.ts
│       ├── testimonials.ts
│       └── kpis.ts
├── types/
│   └── database.ts               # TypeScript interfaces for all tables
├── supabase/
│   ├── migrations/               # Ordered SQL migrations
│   └── config.toml
├── public/
├── .env.local                    # Local dev secrets (gitignored)
├── .env.example                  # Committed template (no real values)
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Section 5: Database Schema

All tables use the `sco_` prefix. Row-level security is not currently enforced (single-user, pre-auth). Auth and RLS are planned for v2.

### sco_brands

```sql
create table sco_brands (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  brand_colors     jsonb,           -- { primary?: string, accent?: string }
  icp              jsonb,           -- { audience?, pain_points?, demographics? }
  voice_tone       text,
  pillars          jsonb,           -- Array<{ name: string, description: string }>
  offers           jsonb,           -- Array<{ name: string, description: string }>
  platforms        text[] default array['linkedin','facebook'],
  ghl_location_id  text,            -- GoHighLevel Location ID (Phase 2)
  ghl_api_key      text,            -- GoHighLevel API key (Phase 2)
  ghl_accounts     jsonb,           -- { linkedin?: string, facebook?: string, ... }
  created_at       timestamptz not null default now()
);
```

### sco_content_weeks

```sql
create table sco_content_weeks (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid references sco_brands on delete cascade,
  week_start date not null,
  status     text check (status in ('draft','pending_approval','approved','live')),
  created_at timestamptz not null default now()
);
```

> Note: This table may be deprecated in favour of scheduling posts directly by `scheduled_date` on `sco_posts`.

### sco_posts

```sql
create table sco_posts (
  id               uuid primary key default gen_random_uuid(),
  content_week_id  uuid references sco_content_weeks on delete set null,
  brand_id         uuid references sco_brands on delete cascade not null,
  campaign_id      uuid references sco_campaigns on delete set null,
  day_of_week      int,
  platform         text,
  pillar           text,
  phase            text,            -- WHY / HOW / WHAT
  concept          text,
  caption          text,
  creative_brief   text,
  format           text,            -- single_image / carousel / video
  graphic_type     text,            -- photo_as_is / photo_overlay / ai_generated / video
  status           text check (status in ('idea','drafted','designed','scheduled','posted')),
  scheduled_date   date,
  post_time        text,
  media_url        text,
  graphic_url      text,            -- AI-generated or uploaded graphic
  hashtags         text,
  cta_url          text,
  ghl_post_id      text,            -- GoHighLevel post ID after scheduling (Phase 2)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index sco_posts_brand_id_idx on sco_posts(brand_id);
create index sco_posts_scheduled_date_idx on sco_posts(scheduled_date);
```

### sco_strategies

```sql
create table sco_strategies (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid references sco_brands on delete cascade not null,
  title      text not null,
  content    text not null,
  type       text check (type in ('remaining','next-month')),
  created_at timestamptz not null default now()
);
create index sco_strategies_brand_id_created_at_idx on sco_strategies(brand_id, created_at desc);
```

### sco_campaigns

```sql
create table sco_campaigns (
  id                    uuid primary key default gen_random_uuid(),
  brand_id              uuid references sco_brands on delete cascade not null,
  name                  text not null,
  offer_description     text,
  offer_file_name       text,
  offer_file_url        text,        -- Supabase Storage URL of uploaded offer file
  date_start            date not null,
  date_end              date not null,
  landing_page_url      text,
  landing_page_context  text,        -- AI-extracted context from landing page
  goal                  text,
  target_leads          int,
  target_sales          int,
  status                text check (status in ('draft','plan_generated','approved','posts_created')),
  campaign_plan         text,        -- AI-generated WHY/HOW/WHAT plan
  video_context         text,        -- Google Drive video transcript/summary
  duration_type         text check (duration_type in ('monthly','quarterly','yearly')) default 'monthly',
  posts_per_week        int,
  created_at            timestamptz not null default now()
);
create index sco_campaigns_brand_id_created_at_idx on sco_campaigns(brand_id, created_at desc);
```

### sco_kpi_weekly

```sql
create table sco_kpi_weekly (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid references sco_brands on delete cascade not null,
  post_id          uuid references sco_posts on delete set null,
  week_start       date not null,
  platform         text,
  impressions      int,
  reach            int,
  engagement       int,
  clicks           int,
  followers_gained int,
  notes            text,
  created_at       timestamptz not null default now()
);
```

### sco_brand_assets

```sql
create table sco_brand_assets (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid references sco_brands on delete cascade not null,
  category    text check (category in ('photo','style_reference','testimonial_template')),
  name        text,
  description text,                 -- AI-generated on upload
  style_tags  text[],               -- AI-extracted on upload
  file_path   text not null,
  file_url    text not null,
  created_at  timestamptz not null default now()
);
create index sco_brand_assets_brand_id_category_idx on sco_brand_assets(brand_id, category);
```

Storage: private bucket `scos-brand-assets`  
Path structure: `{brand_id}/photos/`, `{brand_id}/style-refs/`, `{brand_id}/testimonial-templates/`, `{brand_id}/testimonials/`

### sco_testimonials

```sql
create table sco_testimonials (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid references sco_brands on delete cascade not null,
  campaign_id  uuid references sco_campaigns on delete set null,
  source_type  text check (source_type in ('text','image','pdf')),
  author_name  text,
  author_title text,
  content      text,
  file_path    text,
  file_url     text,
  rating       int check (rating between 1 and 5),
  last_used_at timestamptz,
  times_used   int default 0,
  created_at   timestamptz not null default now()
);
create index sco_testimonials_brand_id_idx on sco_testimonials(brand_id);
create index sco_testimonials_campaign_id_idx on sco_testimonials(campaign_id);
```

---

## Section 6: Migrations History

| File | Applied | Purpose |
|------|---------|---------|
| `20260619000000_initial_schema.sql` | ✓ | Core tables: brands, content_weeks, posts, kpi_weekly |
| `20260622000000_add_strategies.sql` | ✓ | strategies table |
| `20260622000001_add_campaigns.sql` | ✓ | campaigns table |
| `20260622000002_posts_add_time_media.sql` | ✓ | post_time, media_url on posts |
| `20260622000003_campaigns_add_video_context.sql` | ✓ | video_context on campaigns |
| `20260622000004_campaigns_duration.sql` | ✓ | duration_type, posts_per_week on campaigns |
| `20260622000005_brand_assets.sql` | ✓ | brand_assets table + storage bucket |
| `20260622000006_posts_graphic_url.sql` | ✓ | graphic_url on posts |
| `20260622000007_testimonials.sql` | ✓ | testimonials table |
| `20260622000008_testimonials_tracking.sql` | ✓ | last_used_at, times_used on testimonials |
| `20260622000009_testimonials_campaign.sql` | ✓ | campaign_id FK on testimonials |
| `20260622000010_posts_hashtags.sql` | ✓ | hashtags, cta_url, ghl_post_id on posts |

**Pending (not yet applied):**

```sql
-- Add sco_ prefix to existing tables (align with new naming convention)
-- Add missing columns from bundle schema:
--   sco_brands: ghl_location_id, ghl_api_key, ghl_accounts
--   sco_campaigns: offer_file_url, landing_page_context
--   sco_posts: campaign_id FK, phase, format, graphic_type

-- Run in Supabase SQL editor:
alter table brands add column if not exists ghl_location_id text;
alter table brands add column if not exists ghl_api_key text;
alter table brands add column if not exists ghl_accounts jsonb;

alter table campaigns add column if not exists offer_file_url text;
alter table campaigns add column if not exists landing_page_context text;

alter table posts add column if not exists campaign_id uuid references campaigns on delete set null;
alter table posts add column if not exists phase text;
alter table posts add column if not exists format text;
alter table posts add column if not exists graphic_type text;
```

---

## Section 7: API Design

All AI operations are handled by: **`POST /api/chat`**

The `mode` field selects the operation. See PRD Section 5 for full mode specifications, Zod input schemas, and response shapes.

### Streaming vs Non-Streaming Rule

| Mode | Streaming |
|------|-----------|
| `strategy-generation` | **YES** — user-facing chat |
| `campaign-plan` | **YES** — user-facing streaming text |
| All other modes | **NO** — return complete JSON |

```typescript
// Streaming (strategy-generation only)
const stream = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  stream: true,
});

// Non-streaming (campaign-posts, analyze-*, etc.)
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  stream: false,            // CRITICAL: must be false for JSON responses
  response_format: { type: "json_object" },
});
```

### Error Response Shape

```typescript
// 400 — validation failure
{ "error": "Invalid input", "details": "[Zod error details]" }

// 429 — rate limit
{ "error": "AI service temporarily busy — please retry in 30 seconds" }

// 502 — external service failure
{ "error": "AI service temporarily unavailable" }

// 500 — unexpected
{ "error": "Internal server error — please try again" }
```

Never expose raw OpenAI error messages or internal details in error responses.

---

## Section 8: State Management

There is no global state library. State is managed via:

| Mechanism | Used For |
|-----------|---------|
| React `useState` / `useEffect` | Page-level component state |
| `localStorage` | Active brand ID (persists across sessions) |
| Custom event `brandChanged` | Cross-component brand switch notification |
| Supabase queries | All persistent data; fetched on component mount |

---

## Section 9: Brand Context Flow

Every AI generation receives the active brand's full context. This is built server-side by fetching the brand record at generation time (not trusting client-side state):

```typescript
function buildBrandSystemPrompt(brand: Brand, mode: string): string {
  let prompt = `You are an AI assistant for ${brand.name}.\n\n`;

  if (brand.voice_tone)
    prompt += `VOICE & TONE:\n${brand.voice_tone}\n\n`;

  if (brand.icp)
    prompt += `ICP:\nAudience: ${brand.icp.audience}\nPain Points: ${brand.icp.pain_points}\n\n`;

  if (brand.pillars?.length)
    prompt += `CONTENT PILLARS:\n${brand.pillars.map(p => `- ${p.name}: ${p.description}`).join('\n')}\n\n`;

  if (brand.offers?.length)
    prompt += `OFFERS:\n${brand.offers.map(o => `- ${o.name}: ${o.description}`).join('\n')}\n\n`;

  if (brand.platforms?.length)
    prompt += `PLATFORMS: ${brand.platforms.join(', ')}\n\n`;

  return prompt;
}
```

For campaign post generation, additional context is injected:
- `sco_brand_assets` (photos + style_references) → `file_url`, `description`, `style_tags`
- `sco_testimonials` (campaign-tagged + cooldown-filtered) → `content`, `author_name`, `campaign_id`
- `campaign_plan` → full WHY/HOW/WHAT plan text
- `campaign.offer_description`, `campaign.landing_page_context`

---

## Section 10: Data Flow Diagrams

### Generate Content Strategy

```
Client
  → POST /api/chat { mode: "strategy-generation", brand, message }
  → route.ts:
      1. Validate body
      2. Fetch brand from sco_brands
      3. Build system prompt with full brand context
      4. Call OpenAI chat/completions (stream: true)
      5. Pipe SSE stream to client
  ← 200 OK (streaming text)
    → Client renders token-by-token in chat UI
```

### Generate Campaign Posts

```
Client
  → POST /api/chat { mode: "campaign-posts", campaign, brand, assets, testimonials }
  → route.ts:
      1. Validate body
      2. Fetch campaign record (plan, offer, duration, posts_per_week)
      3. Fetch brand (full context)
      4. Fetch sco_brand_assets (photos + style_refs)
      5. Fetch sco_testimonials (campaign-tagged + 90-day filter)
      6. Build OpenAI system prompt with WHY/HOW/WHAT rules
      7. Call OpenAI chat/completions (stream: false, response_format: json_object)
      8. Parse JSON array of post objects
  ← 200 OK: { posts: [...] }
    → Client renders post cards
    → User reviews, edits, approves
    → Client bulk-inserts approved posts into sco_posts
```

### Approve Posts → Calendar

```
Client
  → User clicks "Approve Posts"
  → Batch INSERT into sco_posts:
      status = 'drafted'
      scheduled_date = (campaign start + post sequence offset)
      brand_id, campaign_id, platform, pillar, phase, caption, ...
  → UPDATE sco_campaigns.status = 'posts_created'
  ← Posts appear on /calendar in their scheduled date cells
```

### Generate Post Graphic (DALL-E 3)

```
Client
  → POST /api/chat { mode: "generate-graphic", post, brand, style_refs }
  → route.ts:
      1. Fetch post (creative_brief, graphic_type, overlay_headline)
      2. Fetch brand (brand_colors)
      3. Fetch sco_brand_assets (style_reference category)
      4. Build DALL-E prompt:
           photo_overlay → "Place '[headline]' overlay on this photo. Brand colors: [primary], [accent]."
           ai_generated  → "[creative_brief]. Style: [style tags]. Colors: [colors]."
      5. POST /v1/images/generations { model: "dall-e-3", prompt, size: "1024x1024" }
      6. UPDATE sco_posts.graphic_url = returned image URL
  ← 200 OK: { image_url: "https://..." }
    → Client displays image inline on post card
```

### Upload Asset with AI Analysis

```
Client
  → Upload file directly to Supabase Storage (scos-brand-assets/{brand_id}/{category}/{uuid}.ext)
  ← Storage returns public URL
  → POST /api/chat { mode: "analyze-image", image_url, category }
  → route.ts:
      1. Fetch image as base64
      2. Call OpenAI vision:
           photo:           "Describe subjects, mood, setting, recommended use cases."
           style_reference: "Extract color palette, typography style, layout patterns, mood."
      3. Parse → { description, style_tags[] }
      4. INSERT into sco_brand_assets (brand_id, category, name, description, style_tags, file_path, file_url)
  ← 201 Created: { data: { id, file_url, description, style_tags } }
```

### Upload Testimonial (Image OCR)

```
Client
  → Upload image to Supabase Storage (scos-brand-assets/{brand_id}/testimonials/{uuid}.ext)
  → POST /api/chat { mode: "analyze-testimonial", image_base64 }
  → route.ts:
      1. OpenAI vision: extract author_name, author_title, content, rating
      2. Return extracted data + sensitive region bounding boxes
  → Client applies blur to sensitive regions at bounding box coordinates
  → INSERT into sco_testimonials (brand_id, source_type, author_name, ..., file_url)
  ← 201 Created
```

---

## Section 11: Planned GHL Integration Architecture

### Phase 1 — Brand Credential Setup

```sql
-- Migration required:
alter table sco_brands add column if not exists ghl_location_id text;
alter table sco_brands add column if not exists ghl_api_key text;
alter table sco_brands add column if not exists ghl_accounts jsonb;
-- ghl_accounts shape: { linkedin: "acc_id", facebook: "acc_id", ... }
```

New API route: `POST /api/ghl/test-connection`
- Validates GHL API key + location ID
- Fetches connected social accounts from GHL API
- Returns account list for platform → account ID mapping

### Phase 2 — Auto-Schedule on Status Change

```
Calendar: user changes post status → "scheduled"
  → POST /api/ghl/schedule { post_id, brand_id }
  → route.ts:
      1. Fetch post (caption, hashtags, media_url, scheduled_date, platform)
      2. Fetch brand (ghl_api_key, ghl_location_id, ghl_accounts)
      3. Map platform → GHL account ID
      4. POST https://services.leadconnectorhq.com/social-media-posting/{locationId}/posts
         { accountIds, message: caption + hashtags, mediaUrls, scheduledDate }
      5. On success: UPDATE sco_posts.ghl_post_id = returned postId
      6. On failure: DO NOT mark as scheduled; show retry button
  ← Calendar shows "On GHL" badge for synced posts
```

### Phase 3 — Analytics Sync

```
KPIs page: user clicks "Sync from GHL"
  → POST /api/ghl/analytics { brand_id, week_start }
  → route.ts:
      1. Fetch all sco_posts WHERE brand_id = ? AND ghl_post_id IS NOT NULL
         AND scheduled_date BETWEEN week_start AND week_end
      2. For each post: GET /social-media-posting/{locationId}/posts/{ghl_post_id}/analytics
      3. Upsert into sco_kpi_weekly (brand_id, post_id, week_start, platform, impressions, reach, clicks, engagement)
  ← KPIs page refreshes with synced data
```

---

## Section 12: Environment Variables

| Variable | Where | Public | Purpose |
|----------|-------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` + hosting | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` + hosting | Yes | Supabase anon key |
| `OPENAI_API_KEY` | `.env.local` + hosting | No | OpenAI API (server-side only) |
| `ANTHROPIC_API_KEY` | `.env.local` + hosting | No | Anthropic SDK (optional in v1) |
| `GOOGLE_DRIVE_API_KEY` | `.env.local` + hosting | No | Google Drive file access |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` ONLY | No | Local admin scripts only — never in app code, never in git |

---

## Section 13: Key Design Decisions

**Single AI endpoint (`/api/chat`)** — All AI modes consolidated in one route to simplify auth, logging, and error handling. Mode dispatch via the `mode` field. This makes it easy to add rate limiting, request logging, and error sanitization in one place.

**Untyped Supabase client (`createClient<any>`)** — Avoids fighting with generated TypeScript DB types. Types are maintained manually in `types/database.ts` and cast at the component level.

**No global state library** — App complexity doesn't justify Redux/Zustand. Brand switching via localStorage + custom events keeps cross-component sync simple without a heavy dependency.

**Brand context always fetched server-side at generation time** — AI prompts are built by re-fetching the brand record in the API route, not trusting client-provided context. This ensures generations always use current brand data.

**Content journey enforced in prompts, not UI logic** — WHY/HOW/WHAT phase rules are in the AI system prompt, not hardcoded in component logic. This makes the framework easy to adjust without code changes.

**Streaming only for user-facing chat** — `strategy-generation` and `campaign-plan` stream because users are watching a chat interface and benefit from token-by-token rendering. `campaign-posts` and all analysis modes return complete JSON — streaming structured data introduces fragile incremental parsing with no UX benefit.

**Non-negotiable layer boundaries** — The Presentation layer never imports the Supabase client. The Service layer never calls external APIs. The Agent layer (api routes) never returns raw third-party errors. These boundaries are enforced by code review and will be enforced by lint scripts when auth ships.
