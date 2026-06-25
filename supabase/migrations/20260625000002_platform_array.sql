-- Migration 13: Change platform from text to text[] to support multi-platform posts
alter table posts
  alter column platform type text[]
  using case when platform is null then null else ARRAY[platform]::text[] end;
