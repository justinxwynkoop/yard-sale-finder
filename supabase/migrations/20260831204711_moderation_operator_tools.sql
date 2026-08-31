-- Operator moderation tools.
--
-- Until now every moderation action was run by hand against the database:
-- hiding spam, warning a targeted seller, checking the report queue. The
-- operator gets a push when something is reported and had nowhere to act on it.
-- This is the server half of an in-app moderation screen.
--
-- reports is owner-read-only (auth.uid() = reporter_id) and sales/listings are
-- owner-write-only, so EVERY operator action has to go through a SECURITY
-- DEFINER RPC. The client is not trusted with any of it: the screen is gated in
-- the UI as a courtesy, and each RPC re-checks for itself.

-- ── Operator + suspension flags ───────────────────────────────────────────
alter table public.profiles
  add column if not exists is_operator boolean not null default false;
alter table public.profiles
  add column if not exists suspended_at timestamptz;

-- Both columns stay SELECTable. The app does `select *` on profiles in several
-- hooks, and revoking a column's SELECT makes PostgREST reject the whole
-- request, not just that column.
--
-- UPDATE is what must be locked down: the profiles update policy is
-- `auth.uid() = id`, and RLS cannot restrict WHICH columns an update touches.
-- Without this revoke, any user could promote themselves to operator or clear
-- their own suspension with a one-line update.
revoke update (is_operator, suspended_at) on public.profiles from anon, authenticated;

comment on column public.profiles.is_operator is
  'Moderator. Not settable by clients (column UPDATE revoked); set via SQL.';
comment on column public.profiles.suspended_at is
  'Set by mod_set_suspended. Blocks posting/messaging via the triggers below.';

-- ── Helpers ───────────────────────────────────────────────────────────────
create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(
    (select p.is_operator from public.profiles p where p.id = (select auth.uid())),
    false
  );
$fn$;

grant execute on function public.is_operator() to authenticated;

-- ── Suspension enforcement ────────────────────────────────────────────────
-- A TRIGGER, not a policy clause. Triggers fire inside SECURITY DEFINER
-- functions too, so this covers send_offer and start_conversation without
-- rewriting either body -- reconstructing an existing function from memory is
-- how can_review nearly got broken during the offers work.
--
-- 'system' rows are exempt: those are server-generated notices (a released
-- hold, a sold item) that carry a participant's id as sender. Gating them on
-- that participant's suspension would let a suspension strand a hold.
create or replace function public.block_suspended_writes()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor uuid;
begin
  if tg_table_name = 'messages' and new.kind = 'system' then
    return new;
  end if;

  v_actor := case tg_table_name
    when 'messages'      then new.sender_id
    when 'conversations' then new.buyer_id
    when 'sales'         then new.user_id
    when 'listings'      then new.user_id
  end;

  if v_actor is not null and exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.suspended_at is not null
  ) then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

drop trigger if exists block_suspended_messages on public.messages;
create trigger block_suspended_messages
  before insert on public.messages
  for each row execute function public.block_suspended_writes();

drop trigger if exists block_suspended_conversations on public.conversations;
create trigger block_suspended_conversations
  before insert on public.conversations
  for each row execute function public.block_suspended_writes();

drop trigger if exists block_suspended_sales on public.sales;
create trigger block_suspended_sales
  before insert on public.sales
  for each row execute function public.block_suspended_writes();

drop trigger if exists block_suspended_listings on public.listings;
create trigger block_suspended_listings
  before insert on public.listings
  for each row execute function public.block_suspended_writes();

-- ── The report queue ──────────────────────────────────────────────────────
-- Guarded in the WHERE rather than by raising: it fails closed, so a
-- non-operator gets an empty list instead of an error confirming rows exist.
create or replace function public.mod_list_reports(p_status text default null)
returns table (
  id uuid,
  created_at timestamptz,
  status text,
  reason text,
  notes text,
  target_type text,
  target_id uuid,
  target_title text,
  target_hidden boolean,
  owner_id uuid,
  owner_name text,
  owner_suspended boolean,
  reporter_name text,
  distinct_reporters integer
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  with base as (
    select
      r.id            as r_id,
      r.created_at    as r_created_at,
      r.reason        as r_reason,
      r.notes         as r_notes,
      r.target_type   as r_target_type,
      r.target_id     as r_target_id,
      r.reporter_id   as r_reporter_id,
      coalesce(r.status, 'open') as eff_status,
      case r.target_type
        when 'sale'    then (select s.user_id from public.sales s    where s.id = r.target_id)
        when 'listing' then (select l.user_id from public.listings l where l.id = r.target_id)
        when 'profile' then r.target_id
      end as owner
    from public.reports r
    where public.is_operator()
  )
  select
    b.r_id,
    b.r_created_at,
    b.eff_status,
    b.r_reason,
    b.r_notes,
    b.r_target_type,
    b.r_target_id,
    case b.r_target_type
      when 'sale'    then (select s.title        from public.sales s    where s.id = b.r_target_id)
      when 'listing' then (select l.title        from public.listings l where l.id = b.r_target_id)
      when 'profile' then (select p.display_name from public.profiles p where p.id = b.r_target_id)
    end,
    coalesce(
      case b.r_target_type
        when 'sale'    then (select s.hidden_at is not null from public.sales s    where s.id = b.r_target_id)
        when 'listing' then (select l.hidden_at is not null from public.listings l where l.id = b.r_target_id)
      end,
      false
    ),
    b.owner,
    (select p.display_name from public.profiles p where p.id = b.owner),
    coalesce((select p.suspended_at is not null from public.profiles p where p.id = b.owner), false),
    (select p.display_name from public.profiles p where p.id = b.r_reporter_id),
    (select count(distinct r2.reporter_id)::int
       from public.reports r2
      where r2.target_type = b.r_target_type and r2.target_id = b.r_target_id)
  from base b
  where p_status is null or b.eff_status = p_status
  order by b.r_created_at desc;
$fn$;

grant execute on function public.mod_list_reports(text) to authenticated;

-- ── Actions ───────────────────────────────────────────────────────────────
-- Hiding is reversible on purpose: hidden_at is cleared, never a tombstone.
create or replace function public.mod_set_hidden(
  p_target_type text,
  p_target_id uuid,
  p_hidden boolean
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if not public.is_operator() then
    raise exception 'not authorized';
  end if;

  if p_target_type = 'sale' then
    update public.sales
      set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
      where id = p_target_id;
  elsif p_target_type = 'listing' then
    update public.listings
      set hidden_at = case when p_hidden then coalesce(hidden_at, now()) else null end
      where id = p_target_id;
  else
    -- A profile has no hidden_at; suspending the account is the lever there.
    raise exception 'only a sale or listing can be hidden';
  end if;
end;
$fn$;

grant execute on function public.mod_set_hidden(text, uuid, boolean) to authenticated;

create or replace function public.mod_set_report_status(
  p_report_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if not public.is_operator() then
    raise exception 'not authorized';
  end if;
  if p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'invalid status: %', p_status;
  end if;
  update public.reports set status = p_status where id = p_report_id;
end;
$fn$;

grant execute on function public.mod_set_report_status(uuid, text) to authenticated;

create or replace function public.mod_set_suspended(
  p_user_id uuid,
  p_suspended boolean
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_operator() then
    raise exception 'not authorized';
  end if;
  -- Suspending yourself is unrecoverable in-app: the column's UPDATE grant is
  -- revoked, so undoing it would need direct SQL access.
  if p_user_id = v_uid then
    raise exception 'cannot suspend yourself';
  end if;
  if p_suspended and exists (
    select 1 from public.profiles where id = p_user_id and is_operator
  ) then
    raise exception 'cannot suspend another operator';
  end if;

  update public.profiles
    set suspended_at = case when p_suspended then coalesce(suspended_at, now()) else null end
    where id = p_user_id;
end;
$fn$;

grant execute on function public.mod_set_suspended(uuid, boolean) to authenticated;

-- One tap for the notice that was sent by hand on 2026-08-31. Addressed to the
-- REPORTER (the person exposed), in the thread they share with the reported
-- account. Worded as general guidance rather than an accusation, because the
-- reported party can read the same thread -- and because a report is not a
-- finding.
create or replace function public.mod_send_safety_notice(p_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_report  public.reports%rowtype;
  v_subject uuid;
  v_conv    uuid;
  v_msg     uuid;
begin
  if not public.is_operator() then
    raise exception 'not authorized';
  end if;

  select * into v_report from public.reports where id = p_report_id;
  if not found then
    raise exception 'report not found';
  end if;

  v_subject := case v_report.target_type
    when 'profile' then v_report.target_id
    when 'sale'    then (select s.user_id from public.sales s    where s.id = v_report.target_id)
    when 'listing' then (select l.user_id from public.listings l where l.id = v_report.target_id)
  end;
  if v_subject is null then
    raise exception 'could not resolve who was reported';
  end if;

  -- Most recent thread between the reporter and the reported account.
  select c.id into v_conv
  from public.conversations c
  where (c.buyer_id = v_report.reporter_id and c.seller_id = v_subject)
     or (c.buyer_id = v_subject and c.seller_id = v_report.reporter_id)
  order by c.last_message_at desc
  limit 1;

  if v_conv is null then
    raise exception 'no conversation between the reporter and the reported account';
  end if;

  insert into public.messages (conversation_id, sender_id, body, kind, recipient_id)
  values (
    v_conv,
    v_uid,
    'Safety notice from Trove: keep this deal in person and in the app. '
      || 'Never accept payment before handoff, overpayment, wire transfers, or '
      || 'gift cards, and do not share your home address or personal details '
      || 'with a buyer you have not met. If a conversation feels off, use Block '
      || 'and Report.',
    'system',
    v_report.reporter_id
  )
  returning id into v_msg;

  return v_msg;
end;
$fn$;

grant execute on function public.mod_send_safety_notice(uuid) to authenticated;
