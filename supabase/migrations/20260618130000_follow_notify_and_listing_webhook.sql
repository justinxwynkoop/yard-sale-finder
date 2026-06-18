-- Per-follow notification preference (the profile "bell") + notify followers
-- when someone they follow lists a new ITEM (not just a yard sale).
--
-- `follows.notify` gates the push: when on, the follower gets notified when the
-- followed user posts a new sale OR a new item. Defaults true so existing
-- follows keep notifying; the bell on a user's profile toggles it. follows had
-- only insert/delete policies, so add an UPDATE policy scoped to the follower's
-- own rows for the toggle.

alter table public.follows
  add column if not exists notify boolean not null default true;

drop policy if exists "Users can update their own follows" on public.follows;
create policy "Users can update their own follows"
  on public.follows for update
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

-- Webhook: on a new item listing, call notify-new-listing (pushes "X listed a
-- new item" to the host's followers who have notify on). Mirrors
-- notify_new_sale_webhook. The function is deployed --no-verify-jwt.
drop trigger if exists notify_new_listing_webhook on public.listings;
create trigger notify_new_listing_webhook
  after insert on public.listings
  for each row
  execute function supabase_functions.http_request(
    'https://dxahcamntwtuzftxbxgx.supabase.co/functions/v1/notify-new-listing',
    'POST',
    '{"Content-Type":"application/json"}',
    '{}',
    '5000'
  );
