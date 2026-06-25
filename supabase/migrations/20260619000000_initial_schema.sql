-- Brands (the 2 pages/clients)
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_colors jsonb,
  icp jsonb,
  voice_tone text,
  pillars jsonb,
  offers jsonb,
  platforms text[] default array['linkedin', 'facebook'],
  created_at timestamptz default now()
);

-- Weekly content batches (the unit client approves)
create table content_weeks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  week_start date not null,
  status text default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'live')),
  created_at timestamptz default now()
);

-- Individual post concepts within a week
create table posts (
  id uuid primary key default gen_random_uuid(),
  content_week_id uuid references content_weeks(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  day_of_week int,
  platform text,
  pillar text,
  concept text,
  caption text,
  creative_brief text,
  status text default 'idea' check (status in ('idea', 'drafted', 'designed', 'scheduled', 'posted')),
  scheduled_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Weekly KPI entries
create table kpi_weekly (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  post_id uuid references posts(id) on delete set null,
  week_start date not null,
  platform text,
  impressions int,
  reach int,
  engagement int,
  clicks int,
  followers_gained int,
  notes text,
  created_at timestamptz default now()
);

create index idx_posts_content_week on posts(content_week_id);
create index idx_kpi_brand_week on kpi_weekly(brand_id, week_start);
