-- Deleting a thread must hide it for ME only — not hard-delete the shared
-- conversation row.
--
-- Migration 20260527214900 added a participant DELETE policy. Because a
-- conversation is a single shared row (one buyer_id + one seller_id) and
-- messages cascade on delete, EITHER participant deleting the thread wiped it
-- — and the entire message history — for BOTH sides. That's the data-loss bug.
--
-- Fix: per-user soft delete. Each side stamps its own *_deleted_at; the inbox
-- hides a thread for whoever stamped it, and brings it back if a newer message
-- arrives (last_message_at > their *_deleted_at) — standard chat behavior.

alter table public.conversations
  add column if not exists buyer_deleted_at  timestamptz,
  add column if not exists seller_deleted_at timestamptz;

-- Remove the shared hard-delete path entirely.
drop policy if exists "Participants can delete their conversations"
  on public.conversations;

-- Hide a conversation for the CALLING participant only.
create or replace function public.hide_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
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
      set buyer_deleted_at = now()
      where id = p_conversation_id;
  elsif v_conv.seller_id = v_uid then
    update public.conversations
      set seller_deleted_at = now()
      where id = p_conversation_id;
  else
    raise exception 'not a participant';
  end if;
end;
$$;

revoke execute on function public.hide_conversation(uuid) from public, anon;
grant   execute on function public.hide_conversation(uuid) to authenticated;
