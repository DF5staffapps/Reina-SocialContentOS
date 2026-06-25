-- Migration 12: Update post status values to new workflow
alter table posts drop constraint if exists posts_status_check;

-- Migrate existing data to new statuses
update posts set status = 'planning'   where status in ('idea');
update posts set status = 'for_review' where status in ('drafted', 'designed');
update posts set status = 'approved'   where status = 'scheduled';
update posts set status = 'published'  where status = 'posted';

alter table posts alter column status set default 'planning';
alter table posts add constraint posts_status_check
  check (status in ('planning', 'for_review', 'approved', 'published'));
