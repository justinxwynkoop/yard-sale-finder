-- In-app messaging.
--
-- See docs/MESSAGING.md for the full design rationale. Short version:
--   * One conversation per (target_type, target_id, buyer_id) tuple
--     -- buyers get separate threads with the same seller for
--     different items, which matches the Marketplace mental model.
--   * Text-only for v1. Offers / images deferred.
--   * RLS gates everything to the two participants; blocked users
--     can't start new conversations or send new messages, but
--     existing history stays readable on both sides.
--   * No push notifications in this migration -- those come with a
--     follow-up that adds expo-notifications + push_tokens + an
--     edge function trigger.

-- =====================================================================
-- conversations
-- =====================================================================

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  -- The thing being discussed. target_id deliberately has no FK --
  -- it points at either public.sales.id or public.listings.id and
  -- Postgres doesn't support polymorphic FKs. The start_conversation
  -- RPC validates the target exists before insert; if a sale is
  -- deleted the conversation lingers as orphan history (acceptable
  -- v1 trade-off; we can add a cleanup job later).
  target_type     text not null check (target_type in ('sale', 'listing')),
  target_id       uuid not null,
  -- The owner of the target. Stored explicitly (rather than re-derived
  -- via a join on every read) so RLS / block checks stay cheap.
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  buyer_id        uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz default now() not null,
  last_message_at timestamptz default now() not null,
  -- Each side's "I've read up to here" marker. NULL means the side
  -- has never opened the thread -- treated as "all unread" by the
  -- inbox badge. Bumped from the client when a screen mounts.
  buyer_last_read_at  timestamptz,
  seller_last_read_at timestamptz,
  -- One thread per (item, buyer). The seller's identity is implicit
  -- in the target ownership, so it doesn't need to be in the unique
  -- constraint.
  unique (target_type, target_id, buyer_id),
  check (seller_id <> buyer_id)
);

alter table public.conversations enable row level security;

-- Both participants can read.
drop policy if exists "Participants can read their conversations" on public.conversations;
create policy "Participants can read their conversations"
  on public.conversations for select using (
    auth.uid() = buyer_id or auth.uid() = seller_id
  );

-- No direct INSERT/UPDATE/DELETE policies for end users. Insertion
-- happens via the start_conversation RPC (security definer). Updates
-- happen via the mark_conversation_read RPC. This keeps the seller_id
-- field tamper-proof -- a malicious client can't claim to be the
-- seller of someone else's sale by writing whatever they want.

create index if not exists conversations_seller_last_msg_idx
  on public.conversations (seller_id, last_message_at desc);
create index if not exists conversations_buyer_last_msg_idx
  on public.conversations (buyer_id, last_message_at desc);
create index if not exists conversations_target_idx
  on public.conversations (target_type, target_id);

-- =====================================================================
-- messages
-- =====================================================================

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null check (length(trim(body)) between 1 and 2000),
  created_at      timestamptz default now() not null
);

alter table public.messages enable row level security;

-- Read: both participants of the conversation.
drop policy if exists "Participants can read their messages" on public.messages;
create policy "Participants can read their messages"
  on public.messages for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

-- Insert: sender must be the auth user AND be a participant AND not
-- blocked by the other side AND not have blocked the other side.
drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages"
  on public.messages for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        and not exists (
          select 1 from public.blocked_users b
          where (b.blocker_id = c.buyer_id and b.blocked_id = c.seller_id)
             or (b.blocker_id = c.seller_id and b.blocked_id = c.buyer_id)
        )
    )
  );

-- No UPDATE / DELETE policies: end users can't edit or unsend
-- messages. Keeps the moderation trail intact.

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc);

create index if not exists messages_sender_recent_idx
  on public.messages (sender_id, created_at desc);

-- Enroll in realtime so clients can subscribe to live inserts.
alter publication supabase_realtime add table public.messages;

-- =====================================================================
-- Helper functions / triggers
-- =====================================================================

-- 1. Update last_message_at on the conversation whenever a message
-- lands. Drives the inbox sort order.
create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_insert_bump_conversation on public.messages;
create trigger on_message_insert_bump_conversation
  after insert on public.messages
  for each row execute procedure public.bump_conversation_last_message();

revoke execute on function public.bump_conversation_last_message() from public, anon, authenticated;

-- 2. Rate-limit: any single sender to 20 messages per rolling minute.
-- Server-side enforcement so a misbehaving client can't spam.
create or replace function public.check_message_rate_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_recent_count int;
begin
  select count(*) into v_recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '1 minute';
  if v_recent_count >= 20 then
    raise exception 'Slow down -- you can send up to 20 messages per minute.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists before_message_insert_rate_limit on public.messages;
create trigger before_message_insert_rate_limit
  before insert on public.messages
  for each row execute procedure public.check_message_rate_limit();

-- 3. start_conversation: client gives us (target_type, target_id).
-- We look up the seller from the target row, refuse self-conversation
-- + blocked pairs, then insert-or-return the conversation.
create or replace function public.start_conversation(
  p_target_type text,
  p_target_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_buyer_id        uuid := auth.uid();
  v_seller_id       uuid;
  v_conversation_id uuid;
begin
  if v_buyer_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_target_type = 'sale' then
    select user_id into v_seller_id from public.sales where id = p_target_id;
  elsif p_target_type = 'listing' then
    select user_id into v_seller_id from public.listings where id = p_target_id;
  else
    raise exception 'invalid target_type: %', p_target_type;
  end if;

  if v_seller_id is null then
    raise exception 'target not found';
  end if;

  if v_seller_id = v_buyer_id then
    raise exception 'cannot start a conversation with yourself';
  end if;

  if exists (
    select 1 from public.blocked_users
    where (blocker_id = v_buyer_id  and blocked_id = v_seller_id)
       or (blocker_id = v_seller_id and blocked_id = v_buyer_id)
  ) then
    raise exception 'cannot message this user';
  end if;

  insert into public.conversations (target_type, target_id, seller_id, buyer_id)
  values (p_target_type, p_target_id, v_seller_id, v_buyer_id)
  on conflict (target_type, target_id, buyer_id) do update
    -- No-op SET so we can use RETURNING to get the existing row's id.
    set target_type = excluded.target_type
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

revoke execute on function public.start_conversation(text, uuid) from public, anon;
grant   execute on function public.start_conversation(text, uuid) to authenticated;

-- 4. mark_conversation_read: bump the caller's last_read_at to now()
-- on the given conversation. Lets us update only the side the caller
-- owns without giving them a general UPDATE policy on the table.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_conv record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select buyer_id, seller_id into v_conv
  from public.conversations
  where id = p_conversation_id;

  if not found then
    raise exception 'conversation not found';
  end if;

  if v_conv.buyer_id = v_uid then
    update public.conversations
      set buyer_last_read_at = now()
      where id = p_conversation_id;
  elsif v_conv.seller_id = v_uid then
    update public.conversations
      set seller_last_read_at = now()
      where id = p_conversation_id;
  else
    raise exception 'not a participant';
  end if;
end;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant   execute on function public.mark_conversation_read(uuid) to authenticated;
