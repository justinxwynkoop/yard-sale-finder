-- Let a sale's creator turn off messaging for that specific yard sale.
--
-- Adds sales.allow_messages (default true) and enforces it in
-- start_conversation so a buyer can't open a thread on a sale whose host has
-- disabled messaging. The client also hides the "Message" button, but the RPC
-- is the real gate.

alter table public.sales
  add column if not exists allow_messages boolean not null default true;

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
  v_allow_messages  boolean := true;
  v_conversation_id uuid;
begin
  if v_buyer_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_target_type = 'sale' then
    select user_id, allow_messages
      into v_seller_id, v_allow_messages
      from public.sales where id = p_target_id;
  elsif p_target_type = 'listing' then
    select user_id into v_seller_id from public.listings where id = p_target_id;
  else
    raise exception 'invalid target_type: %', p_target_type;
  end if;

  if v_seller_id is null then
    raise exception 'target not found';
  end if;

  if p_target_type = 'sale' and v_allow_messages is false then
    raise exception 'messaging is off for this sale';
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
    set target_type = excluded.target_type
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

revoke execute on function public.start_conversation(text, uuid) from public, anon;
grant   execute on function public.start_conversation(text, uuid) to authenticated;
