-- release_hold also relists a SOLD item (spec:
-- docs/superpowers/specs/2026-08-30-messaging-offers-design.md).
--
-- WHY: 20260830100100 guarded the status flip on `status = 'pending'` so that
-- releasing a hold "can never resurrect a sold item". That guard is correct for
-- the hold-release path but wrong for the only other caller the app has. Once
-- src/lib/listingStatus.ts made this RPC the single write path for
-- status -> 'available', it inherited the SOLD -> AVAILABLE relist transition
-- that both screens previously performed with a direct
-- `.update({ status: 'available' })`:
--
--   * MyListingsScreen's "Relist" pill is rendered ONLY on sold listings, so
--     sold -> available is its ONLY transition.
--   * ListingDetailScreen's owner segmented control offers "Available" on a
--     sold listing.
--
-- Under the 'pending'-only guard both cases matched zero rows, raised no error,
-- and reported success: the pill toasted "Relisted" while the item stayed sold,
-- and the detail screen's optimistic local state never rolled back, so the UI
-- claimed Available while the DB said sold. A silent no-op reported as success
-- is worse than a refusal. This migration corrects that sold -> available path.
--
-- The change is ONE predicate: `status = 'pending'` becomes
-- `status in ('pending', 'sold')`. Every other guard is preserved byte-for-byte
-- from the live function (captured with `pg_get_functiondef` on the linked
-- project and diffed against 20260830100100, identical): the auth check, the
-- hand-rolled owner check that stands in for the RLS policy SECURITY DEFINER
-- bypasses, the hold lookup, the unconditional hold delete, and the
-- blocked-users-gated system message.
--
-- The system message stays gated on a hold having EXISTED (v_buyer_id is not
-- null), which is what keeps this safe on the new source states. Relisting a
-- sold item that was never held notifies nobody -- there is no buyer to notify,
-- and 'The hold on this item was released.' would be a lie. A listing already
-- 'available' still matches no row here and, absent a stray hold row, still
-- emits nothing. The deliberate tolerance of a desynced pair from the original
-- is likewise unchanged: the delete and the update remain independent, so this
-- still repairs a hold row whose listing was flipped by hand.
--
-- Widening the predicate does NOT widen who can do this. The owner check above
-- it is the authorization, and it is unchanged; only a listing's owner reaches
-- the update at all. respond_to_offer's accept branch is untouched and still
-- refuses any listing that is not 'available', so a stale offer cannot ride
-- this relist back into a hold without the buyer acting again.

create or replace function public.release_hold(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_buyer_id uuid;
  v_conv     uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- SECURITY DEFINER bypasses RLS, so the owner-only UPDATE policy on listings
  -- does not apply here; ownership has to be asserted by hand.
  if not exists (
    select 1 from public.listings
    where id = p_listing_id and user_id = v_uid
  ) then
    raise exception 'not the listing owner';
  end if;

  select buyer_id into v_buyer_id
  from public.listing_holds where listing_id = p_listing_id;

  delete from public.listing_holds where listing_id = p_listing_id;

  -- 'sold' joins 'pending' as a legal source state: this is the owner's
  -- release-or-relist action, and the owner is allowed to put a sold item back
  -- on the market (see the header). Still an explicit allow-list rather than
  -- an unguarded update, so any status added later has to opt in here
  -- deliberately instead of being silently relisted.
  update public.listings set status = 'available'
  where id = p_listing_id and status in ('pending', 'sold');

  if v_buyer_id is not null then
    select id into v_conv from public.conversations
    where target_type = 'listing' and target_id = p_listing_id
      and buyer_id = v_buyer_id
    limit 1;

    -- DEVIATION from the plan, flagged in task-10-report.md: the block check.
    -- It gates only the notice, never the state change above. This function is
    -- SECURITY DEFINER and owned by the owner of public.messages, so it is
    -- exempt from the "Participants can send messages" policy and its
    -- blocked_users clause -- without this, releasing a hold would push a
    -- notification from someone the recipient had blocked. Aborting instead
    -- would be worse: a buyer could block the seller to freeze the seller's own
    -- listing in 'pending' forever.
    if v_conv is not null and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = v_uid and b.blocked_id = v_buyer_id)
         or (b.blocker_id = v_buyer_id and b.blocked_id = v_uid)
    ) then
      -- Actor-free wording, matching respond_to_offer's system rows: the row is
      -- rendered to both parties, so "you"/"the seller" would read false in one
      -- direction. sender_id and recipient_id carry who did it and who it is for.
      insert into public.messages
        (conversation_id, sender_id, body, kind, recipient_id)
      values
        (v_conv, v_uid, 'The hold on this item was released.', 'system', v_buyer_id);
    end if;
  end if;
end;
$$;

revoke execute on function public.release_hold(uuid) from public, anon;
grant   execute on function public.release_hold(uuid) to authenticated;
