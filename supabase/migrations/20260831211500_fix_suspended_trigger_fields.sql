-- URGENT correctness fix for block_suspended_writes (20260831204711).
--
-- The actor was picked with a single CASE expression:
--
--   v_actor := case tg_table_name
--     when 'messages'      then new.sender_id
--     when 'conversations' then new.buyer_id
--     when 'sales'         then new.user_id
--     ...
--
-- PL/pgSQL hands that whole expression to the SQL planner, which resolves
-- EVERY branch's column references regardless of which one would be taken. On
-- a messages insert there is no new.buyer_id, so planning failed with
-- 42703 "record new has no field ..." -- and because the trigger is BEFORE
-- INSERT on messages, conversations, sales and listings, that error hit every
-- insert on all four tables, not just a suspended user's.
--
-- Separate IF branches instead: PL/pgSQL prepares each statement on first
-- execution, so a branch that never runs is never planned, and each field
-- reference is only compiled against the table it belongs to.
create or replace function public.block_suspended_writes()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor uuid;
begin
  if tg_table_name = 'messages' then
    -- 'system' rows are server-generated notices (a released hold, a sold
    -- item) that carry a participant's id as sender. Gating them on that
    -- participant's suspension would let a suspension strand a hold.
    if new.kind = 'system' then
      return new;
    end if;
    v_actor := new.sender_id;
  elsif tg_table_name = 'conversations' then
    v_actor := new.buyer_id;
  elsif tg_table_name = 'sales' then
    v_actor := new.user_id;
  elsif tg_table_name = 'listings' then
    v_actor := new.user_id;
  else
    return new;
  end if;

  if v_actor is not null and exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.suspended_at is not null
  ) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;

  return new;
end;
$fn$;
