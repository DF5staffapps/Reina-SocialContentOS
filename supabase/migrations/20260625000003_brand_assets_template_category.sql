-- Migration 14: Add testimonial_template to brand_assets category constraint
alter table brand_assets drop constraint if exists brand_assets_category_check;
alter table brand_assets add constraint brand_assets_category_check
  check (category in ('photo', 'style_reference', 'testimonial_template'));
