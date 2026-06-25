-- Migration 11: GHL integration fields on brands
alter table brands add column if not exists ghl_location_id text;
alter table brands add column if not exists ghl_api_key text;
alter table brands add column if not exists ghl_accounts jsonb;
