-- Stale pending offers used to survive a listing's whole sale cycle.
--
-- An offer is a `messages` row whose offer_status stays 'pending' until the
-- non-sender responds. Nothing else ever moved it -- so when a seller marked
-- an item sold, every OTHER buyer's offer stayed pending; and when the seller
-- later relisted that item (release_hold flips 'sold' -> 'available'), those
-- months-old offers became live and acceptable again at their old prices.
--
-- Two rules, deliberately different:
--   * mark_listing_sold  -> expire every pending offer. The item is gone.
--   * release_hold       -> expire pending offers ONLY when relisting from
--                           'sold'. Releasing a hold from 'pending' means the
--                           item never left the market, so other buyers' live
--                           offers must survive; a completed sale cycle closes
--                           everything from before it.
--
-- 'expired' is a NEW status rather than reusing 'declined'. Nobody declined
-- these -- rendering "Declined" to a buyer whose offer the seller never even
-- saw is a false statement about what happened.

alter table public.messages
  drop constraint if exists messages_offer_status_ck;

alter table public.messages
  add constraint messages_offer_status_ck
  check (
    offer_status is null
    or offer_status in ('pending', 'accepted', 'declined', 'countered', 'expired')
  );

create or replace function public.mark_listing_sold(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid      uuid := (select auth.uid());
  v_buyer_id uuid;
  v_conv     uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.listings
    where id = p_listing_id and user_id = v_uid
  ) then
    raise exception 'not the listing owner';
  end if;

  select buyer_id into v_buyer_id
  from public.listing_holds where listing_id = p_listing_id;

  delete from public.listing_holds where listing_id = p_listing_id;
  update public.listings set status = 'sold' where id = p_listing_id;

  -- The item is gone: close every offer still awaiting a response, in every
  -- conversation about this listing. The accepted offer is already
  -- 'accepted', so it is untouched by the pending-only predicate.
  update public.messages m
  set offer_status = 'expired'
  from public.conversations c
  where m.conversation_id = c.id
    and c.target_type = 'listing'
    and c.target_id = p_listing_id
    and m.kind = 'offer'
    and m.offer_status = 'pending';

  if v_buyer_id is not null then
    select id into v_conv from public.conversations
    where target_type = 'listing' and target_id = p_listing_id
      and buyer_id = v_buyer_id
    limit 1;

    -- Same block gate, same reasoning, as release_hold below.
    if v_conv is not null and not exists (
      select 1 from public.blocked_users b
      where (b.blocker_id = v_uid and b.blocked_id = v_buyer_id)
         or (b.blocker_id = v_buyer_id and b.blocked_id = v_uid)
    ) then
      insert into public.messages
        (conversation_id, sender_id, body, kind, recipient_id)
      values
        (v_conv, v_uid, 'This item is marked sold. Thanks!', 'system', v_buyer_id);
    end if;
  end if;
end;
$function$;

create or replace function public.release_hold(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid      uuid := (select auth.uid());
  v_buyer_id uuid;
  v_conv     uuid;
  v_prior    text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- SECURITY DEFINER bypasses RLS, so the owner-only UPDATE policy on listings
  -- does not apply here; ownership has to be asserted by hand. The row lock
  -- also pins the prior status we branch on below against a concurrent write.
  select status into v_prior
  from public.listings
  where id = p_listing_id and user_id = v_uid
  for update;

  if v_prior is null then
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

  -- Relist only. Coming from 'pending' the item never left the market, so
  -- other buyers' live offers stay actionable; coming from 'sold' a whole
  -- sale cycle has completed and everything from before it is stale.
  if v_prior = 'sold' then
    update public.messages m
    set offer_status = 'expired'
    from public.conversations c
    where m.conversation_id = c.id
      and c.target_type = 'listing'
      and c.target_id = p_listing_id
      and m.kind = 'offer'
      and m.offer_status = 'pending';
  end if;

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
$function$;
