-- Seller-controlled holds (spec: docs/superpowers/specs/2026-08-30-messaging-offers-design.md)
--
-- Occupancy lives in its own table, NOT as listings.held_for: the listings
-- SELECT policy is `using (true)` and the publishable key ships inside the app
-- binary, so a buyer id on that row would let anyone enumerate who is holding
-- what (verified against the live REST API). The PUBLIC signal stays
-- listings.status = 'pending' (already shipped in 20260830100000); only WHO is
-- protected.
--
-- There is deliberately no expiry and no cron job. Only the seller changes the
-- state -- a timer could sell an item out from under a committed buyer.
--
-- respond_to_offer is re-declared at the bottom. Its body was taken from
-- `pg_get_functiondef` on the linked project and verified byte-for-byte
-- identical to 20260830100000_message_offers.sql (164 body lines), NOT
-- reconstructed from the plan text -- the live function has been hardened past
-- what that plan showed. Exactly one statement and one comment change; see the
-- header on that function.

create table if not exists public.listing_holds (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  buyer_id   uuid not null references public.profiles(id) on delete cascade,
  -- ON DELETE SET NULL, unlike buyer_id: offer_id is provenance ("which offer
  -- produced this hold"), so losing the message must not evaporate the hold
  -- itself. Nothing reads it for authorization.
  offer_id   uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.listing_holds enable row level security;

-- The PK covers the seller's "who is this listing held for" lookup. This index
-- covers the other direction -- a buyer reading their own holds -- which is
-- also the arm of the SELECT policy below that has no other index behind it.
create index if not exists listing_holds_buyer_idx
  on public.listing_holds (buyer_id);

drop policy if exists "Owner or held buyer can read the hold" on public.listing_holds;
create policy "Owner or held buyer can read the hold"
  on public.listing_holds for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or exists (
      select 1 from public.listings l
      -- Qualified deliberately: `listing_id` alone resolves to the outer
      -- listing_holds column only because listings has no column by that name.
      -- If one is ever added, the unqualified reference would silently rebind
      -- to it and the predicate would become `l.id = l.listing_id`.
      where l.id = listing_holds.listing_id and l.user_id = (select auth.uid())
    )
  );

-- No insert/update/delete policies: holds are written only by the definer RPCs
-- below. Omitting a policy denies the command outright under RLS.

-- listings UPDATE policy: make the WITH CHECK explicit.
--
-- NOTE, correcting the plan: this is NOT closing an open hole. Postgres uses
-- the USING expression as the WITH CHECK expression when WITH CHECK is omitted
-- (CREATE POLICY docs), so a null `pg_get_expr(polwithcheck, polrelid)` on the
-- live row means "inherit USING", not "allow anything" -- an owner cannot
-- currently re-point user_id at someone else. The rewrite below is a semantic
-- no-op today.
--
-- It is kept anyway because the two expressions stop being coupled: if USING is
-- ever loosened (say, to let a moderator read a row) the write side would
-- silently loosen with it. Stating both is what makes that a deliberate edit.
--
-- The policy NAME is the live one from pg_policy, "Users can update their own
-- listings". The plan spelled it "Users can update own listings"; creating that
-- would have left the original in place and ADDED a second permissive policy --
-- and permissive policies OR together, which is the opposite of a tightening.
-- The USING expression below is the live text, unchanged.
--
-- Role scope also narrows here: the live policy has no TO clause, so it
-- applies to PUBLIC; this one adds `to authenticated`. Safe in practice --
-- anon gets no rows under either scope because auth.uid() is NULL for anon
-- and both USING and WITH CHECK test against it, and postgres/service_role
-- bypass RLS regardless of role grants -- but it is a real semantic change
-- that was not called out when this migration was written. Recorded here.
drop policy if exists "Users can update their own listings" on public.listings;
create policy "Users can update their own listings"
  on public.listings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Release a hold: the item goes back on the market and the held buyer is told.
--
-- Deliberately tolerant of a desynced pair. It clears the hold row and the
-- 'pending' status independently, so it also repairs a listing left 'pending'
-- with no hold, or a hold row whose listing was already flipped by hand.
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

  -- Guarded on 'pending' so releasing a hold can never resurrect a sold item.
  update public.listings set status = 'available'
  where id = p_listing_id and status = 'pending';

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

-- Mark sold. Terminal, and legal from any status: a seller can sell an item
-- that was never held (no offer, met a buyer in person) as well as one that
-- was. The hold row is cleared either way -- 'sold' is the end state and
-- occupancy stops meaning anything.
create or replace function public.mark_listing_sold(p_listing_id uuid)
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

  if v_buyer_id is not null then
    select id into v_conv from public.conversations
    where target_type = 'listing' and target_id = p_listing_id
      and buyer_id = v_buyer_id
    limit 1;

    -- Same block gate, same reasoning, as release_hold above.
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
$$;

revoke execute on function public.mark_listing_sold(uuid) from public, anon;
grant   execute on function public.mark_listing_sold(uuid) to authenticated;

-- respond_to_offer: accepting now records WHO the item is held for.
--
-- The body below is the live function as of this migration, captured with
-- `pg_get_functiondef` and diffed byte-for-byte against its declaration in
-- 20260830100000_message_offers.sql (identical). Every guard it accumulated
-- over review -- the auth check, the `if not found` assertions after BOTH the
-- conversations and listings selects, the participant check, the
-- target_type = 'listing' check, the blocked_users check, the self-response
-- guard, the `for update` row lock, the responder-is-the-other-party
-- derivation, and the accept-only `status <> 'available'` refusal -- is
-- reproduced unchanged and intentionally.
--
-- The ONLY functional change is the listing_holds upsert in the accept branch.
-- The v_buyer comment is also retouched: it referenced this migration by
-- number as future work, and the work is now here.
create or replace function public.respond_to_offer(
  p_offer_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_msg       record;
  v_conv      record;
  v_listing   record;
  v_responder uuid;
  v_buyer     uuid;
  v_recipient uuid;
  v_body      text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_action not in ('accept', 'decline') then
    raise exception 'invalid action';
  end if;

  -- FOR UPDATE: the pending check below and the status flip further down are
  -- two separate statements, so without the row lock two concurrent accepts
  -- both read 'pending', both pass, and the item gets held twice (and the
  -- system row emitted twice). The lock serializes them -- the loser re-reads
  -- 'accepted' and raises 'offer is no longer pending'.
  select id, conversation_id, sender_id, offer_amount, offer_status, kind
    into v_msg
  from public.messages
  where id = p_offer_id
  for update;

  if not found or v_msg.kind <> 'offer' then
    raise exception 'offer not found';
  end if;

  -- Nobody responds to their own offer -- a seller must not be able to accept
  -- their own counter at a price the buyer never agreed to. Strictly this is
  -- implied by the responder check further down (which also excludes the
  -- sender), but it is kept: it fires before any lookup, it is the guard that
  -- has to hold if that derivation is ever edited, and it names the actual
  -- mistake instead of "not the responder". Checked before any mutation.
  if v_msg.sender_id = v_uid then
    raise exception 'cannot respond to your own offer';
  end if;

  if v_msg.offer_status <> 'pending' then
    raise exception 'offer is no longer pending';
  end if;

  select id, buyer_id, seller_id, target_type, target_id
    into v_conv
  from public.conversations where id = v_msg.conversation_id;

  -- `not found` leaves the record's fields NULL, and `NULL <> v_uid` is NULL,
  -- which IF treats as false -- so a missing row would SKIP the authorization
  -- checks below rather than fail them. Both lookups must assert found. This is
  -- not hypothetical: production already holds listing conversations whose
  -- target listing has been deleted.
  if not found then
    raise exception 'conversation not found';
  end if;

  if v_uid <> v_conv.buyer_id and v_uid <> v_conv.seller_id then
    raise exception 'not a participant';
  end if;

  if v_conv.target_type <> 'listing' then
    raise exception 'offers are only supported on listings';
  end if;

  -- SECURITY DEFINER bypasses RLS: replicate the blocked_users predicate from
  -- the "Participants can send messages" INSERT policy, which would otherwise
  -- have blocked the system row this function inserts.
  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_conv.buyer_id and b.blocked_id = v_conv.seller_id)
       or (b.blocker_id = v_conv.seller_id and b.blocked_id = v_conv.buyer_id)
  ) then
    raise exception 'cannot respond to offers in a blocked conversation';
  end if;

  -- FOR UPDATE: send_offer's one-pending-offer rule is scoped per
  -- CONVERSATION, not per listing, and it only rejects a 'sold' listing -- so
  -- two different buyers can each hold a pending offer on the same listing,
  -- as two different messages rows. The FOR UPDATE on the offer row above does
  -- NOT serialize those two accepts; each locks a different message. Locking
  -- the listing row here does: it serializes accepts on that listing, so the
  -- loser re-reads 'pending' under EvalPlanQual and hits the accept-only
  -- availability guard below ('listing is no longer available') instead of
  -- silently winning the race and overwriting the other buyer's hold.
  select id, user_id, title, status into v_listing
  from public.listings where id = v_conv.target_id
  for update;

  if not found then
    raise exception 'listing not found';
  end if;

  -- Authorization: the responder is the participant who did NOT send this
  -- offer. Owner-only was correct in exactly one direction. It handled a
  -- buyer's offer (sender = buyer, responder = seller = owner) and made a
  -- seller's COUNTER unacceptable by anyone -- its sender is the seller, so the
  -- self-response guard above stopped the seller and this check stopped the
  -- buyer, leaving an offer that could be sent and never answered.
  --
  -- The CASE is written to yield NULL rather than a participant if the offer's
  -- sender is somehow neither party, and the `is null` arm rejects that
  -- explicitly. Comparing against a bare NULL would have reproduced the same
  -- fall-through the `not found` guards above exist to prevent: `v_uid <> NULL`
  -- is NULL, and IF treats NULL as false, so the exception would be SKIPPED.
  -- Non-participants are already turned away by the participant check above;
  -- this narrows the two participants down to the one entitled to answer.
  v_responder := case
                   when v_msg.sender_id = v_conv.buyer_id  then v_conv.seller_id
                   when v_msg.sender_id = v_conv.seller_id then v_conv.buyer_id
                 end;

  if v_responder is null or v_responder <> v_uid then
    raise exception 'only the other party can respond to this offer';
  end if;

  -- Accepting writes listings.status, and this function is SECURITY DEFINER --
  -- so the owner-only UPDATE policy on listings does NOT apply here. Since a
  -- seller's counter is accepted by the BUYER, without this guard a non-owner
  -- could overwrite someone else's listing status at any later time: buyer
  -- offers -> seller sells elsewhere (status='sold') -> the offer is still
  -- pending -> accepting it resurrects the item as 'pending'. send_offer has
  -- the mirror-image check at send time; this is the check at respond time.
  --
  -- 'pending' is refused as well as 'sold': the item is already held for some
  -- buyer, and accepting a second offer would silently re-point that hold.
  -- DECLINE stays legal in every status, so a stale offer on a sold item can
  -- still be cleared. Checked before the offer_status update below, so a
  -- refused accept mutates nothing.
  if p_action = 'accept' and v_listing.status <> 'available' then
    raise exception 'listing is no longer available';
  end if;

  -- Two different people, and they stop coinciding the moment a seller's
  -- counter is in play, so neither may be read off v_msg.sender_id:
  --
  --   v_buyer     -- who the item is held FOR. Always the conversation's buyer.
  --                  On a buyer's offer that happens to be the offer's sender;
  --                  on a seller's counter it is v_uid, the accepter. Only
  --                  v_conv.buyer_id is right in both directions, and it is
  --                  what the listing_holds upsert below consumes.
  --   v_recipient -- who the system notice is addressed to: the participant who
  --                  did not just act, i.e. never v_uid.
  v_buyer     := v_conv.buyer_id;
  v_recipient := case when v_uid = v_conv.buyer_id then v_conv.seller_id
                      else v_conv.buyer_id end;

  update public.messages
  set offer_status = case when p_action = 'accept' then 'accepted' else 'declined' end
  where id = p_offer_id;

  -- Both bodies are deliberately actor-free. The same row is generated whether
  -- the seller accepted a buyer's offer or the buyer accepted the seller's
  -- counter, and it is rendered to both parties, so any "you"/"the seller"
  -- phrasing would be false in one direction. State the amount and the
  -- resulting state; sender_id and recipient_id carry who did it and who it is
  -- for.
  if p_action = 'accept' then
    update public.listings set status = 'pending' where id = v_listing.id;

    -- ON CONFLICT rather than a plain INSERT: the accept guard above refuses a
    -- listing that is not 'available', so a live hold should never be here to
    -- collide with -- but a hold row left behind by a status edit that went
    -- around these RPCs would otherwise raise a PK violation and fail an
    -- otherwise legitimate acceptance. Upserting re-points it at the accepted
    -- buyer, which is the state the rest of this branch is about to assert.
    insert into public.listing_holds (listing_id, buyer_id, offer_id)
    values (v_listing.id, v_buyer, p_offer_id)
    on conflict (listing_id) do update
      set buyer_id = excluded.buyer_id,
          offer_id = excluded.offer_id,
          created_at = now();

    v_body := 'Offer accepted -- $'
              || trim(to_char(v_msg.offer_amount, 'FM999999990.00'))
              || '. This item is on hold.';
  else
    v_body := 'Offer declined.';
  end if;

  insert into public.messages
    (conversation_id, sender_id, body, kind, recipient_id)
  values
    (v_msg.conversation_id, v_uid, v_body, 'system', v_recipient);
end;
$$;

revoke execute on function public.respond_to_offer(uuid, text) from public, anon;
grant   execute on function public.respond_to_offer(uuid, text) to authenticated;
