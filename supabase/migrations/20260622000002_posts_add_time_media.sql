alter table posts
  add column if not exists post_time text,
  add column if not exists media_url  text;
