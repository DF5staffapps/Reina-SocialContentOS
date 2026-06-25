-- Brand asset library (photos + style references)
create table brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  category text not null check (category in ('photo', 'style_reference')),
  name text,
  description text,
  style_tags text[],
  file_path text not null,
  file_url text not null,
  created_at timestamptz default now()
);

create index idx_brand_assets_brand on brand_assets(brand_id, category);

-- Storage bucket (run separately in Supabase dashboard if this errors)
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do nothing;

-- Allow public read on brand-assets bucket
create policy "Public read brand assets"
  on storage.objects for select
  using (bucket_id = 'brand-assets');

-- Allow insert/delete (anon key — tighten with auth later)
create policy "Allow upload brand assets"
  on storage.objects for insert
  with check (bucket_id = 'brand-assets');

create policy "Allow delete brand assets"
  on storage.objects for delete
  using (bucket_id = 'brand-assets');
