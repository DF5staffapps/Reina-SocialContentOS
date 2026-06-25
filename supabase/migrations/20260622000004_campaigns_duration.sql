alter table campaigns
  add column if not exists duration_type text default 'monthly'
    check (duration_type in ('monthly', 'quarterly', 'yearly')),
  add column if not exists posts_per_week int;
