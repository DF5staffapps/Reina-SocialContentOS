create table strategies (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  title text not null,
  content text not null,
  type text check (type in ('remaining', 'next-month')),
  created_at timestamptz default now()
);

create index idx_strategies_brand on strategies(brand_id, created_at desc);
