-- Migration 15: Add graphic_url to testimonials for persisting generated graphics
alter table testimonials add column if not exists graphic_url text;
