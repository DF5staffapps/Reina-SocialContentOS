alter table testimonials
  add column if not exists last_used_at timestamptz,
  add column if not exists times_used int not null default 0;

-- Allow testimonial_template as a brand_assets category
alter table brand_assets drop constraint if exists brand_assets_category_check;
alter table brand_assets
  add constraint brand_assets_category_check
  check (category in ('photo', 'style_reference', 'testimonial_template'));
