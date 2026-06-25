alter table testimonials
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create index if not exists idx_testimonials_campaign on testimonials(campaign_id);
