create table testimonials (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  source_type text not null check (source_type in ('text', 'image', 'pdf')),
  author_name text,
  author_title text,
  content text,
  file_path text,
  file_url text,
  rating int check (rating between 1 and 5),
  created_at timestamptz default now()
);

create index idx_testimonials_brand on testimonials(brand_id);
