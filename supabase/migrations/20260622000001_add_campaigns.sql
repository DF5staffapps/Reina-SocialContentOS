create table campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  name text not null,
  offer_description text,
  offer_file_name text,
  date_start date not null,
  date_end date not null,
  landing_page_url text,
  goal text,
  target_leads int,
  target_sales int,
  status text default 'draft' check (status in ('draft', 'plan_generated', 'approved', 'posts_created')),
  campaign_plan text,
  created_at timestamptz default now()
);

create index idx_campaigns_brand on campaigns(brand_id, created_at desc);
