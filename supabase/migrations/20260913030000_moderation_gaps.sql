-- Moderation gaps exposed by the Sheffman case (2026-09-12).
--
-- A two-day-old account made a 200 dollar offer on a 10 dollar listing and
-- pressed the seller, Maria, for personal photos. Justin reported him. Every
-- step after that needed hand-written SQL, because the tools could not:
--
--   1. SEE a reported account's other conversations. The reporter's thread
--      was readable; the Sheffman<->Maria thread, where the actual harm was,
--      was not -- Maria never filed a report.
--   2. WARN anyone but the reporter. mod_send_safety_notice resolved only the
--      reporter<->reported thread, so the person at risk could not be reached.
--   3. STOP A SUSPENDED ACCOUNT'S OFFERS. Suspension blocked new messages and
--      offers, but a pending offer stayed acceptable -- and a suspended user
--      could still accept or decline offers, because respond_to_offer changes
--      offer_status with an UPDATE, which the insert-only suspension trigger
--      never sees.
--
-- Also: moderator READS were audited, but moderator ACTIONS were not. Hide,
-- suspend, status changes and notices done from the app left no trace. They
-- are all logged now.
--
-- Access boundary, deliberately: a moderator can list and read every
-- conversation of a reported account while that report is open or resolved.
-- Once a report is DISMISSED -- a moderator decided there was nothing there --
-- that wider access ends; only the reporter<->reported thread stays readable,
-- as before.

-- ── Shared helpers ────────────────────────────────────────────────────────
-- Who a report is about. Was an identical CASE in four functions.
create or replace function public.mod_report_subject(p_report_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select case r.target_type
    when 'profile' then r.target_id
    when 'sale'    then (select s.user_id from public.sales s    where s.id = r.target_id)
    when 'listing' then (select l.user_id from public.listings l where l.id = r.target_id)
  end
  from public.reports r
  where r.id = p_report_id;
$fn$;

-- Internal only. Callable by the SECURITY DEFINER functions below (they run
-- as the owner); a client must not be able to resolve who a report targets.
revoke all on function public.mod_report_subject(uuid) from public, anon, authenticated;

-- The notice text, in one place. "with someone you have not met" replaces
-- "with a buyer you have not met": the notice can now reach a BUYER who is
-- being worked by a reported seller, and the old wording was only right for a
-- seller.
create or replace function public.mod_safety_notice_text()
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $fn$
  select 'Safety notice from Trove: keep this deal in person and in the app. '
      || 'Never accept payment before handoff, overpayment, wire transfers, or '
      || 'gift cards, and do not share your home address or personal details '
      || 'with someone you have not met. If a conversation feels off, use Block '
      || 'and Report.';
$fn$;

-- ── Gap 3: a reported account's conversations ────────────────────────────
-- Storage access for photos follows the same boundary as reading: any
-- conversation of a reported account while the report is not dismissed, plus
-- the reporter<->reported thread regardless of status (unchanged).
create or replace function public.is_reported_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  -- Operators only, so it cannot be used to probe whether a conversation
  -- has been reported. SECURITY DEFINER because reports is reporter-only: an
  -- inline RLS subquery here would be blind to the rows it needs.
  select public.is_operator() and exists (
    select 1
    from public.reports r
    join public.conversations c on c.id = p_conversation_id
    where public.mod_report_subject(r.id) in (c.buyer_id, c.seller_id)
      and (
        r.reporter_id in (c.buyer_id, c.seller_id)
        or r.status <> 'dismissed'
      )
  );
$fn$;

create or replace function public.mod_list_subject_conversations(p_report_id uuid)
returns table (
  conversation_id uuid,
  other_id uuid,
  other_name text,
  is_reporter boolean,
  target_type text,
  target_title text,
  message_count integer,
  last_message_at timestamptz,
  pending_offers integer,
  notice_sent boolean
)
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_report  public.reports%rowtype;
  v_subject uuid;
begin
  if not public.is_operator() then
    raise exception 'not authorized';
  end if;

  -- Every column below is alias-qualified: the OUT names (conversation_id,
  -- target_type, last_message_at...) are PL/pgSQL variables for the whole body.
  select r.* into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'report not found';
  end if;
  if v_report.status = 'dismissed' then
    raise exception 'this report was dismissed';
  end if;

  v_subject := public.mod_report_subject(p_report_id);
  if v_subject is null then
    raise exception 'could not resolve who was reported';
  end if;

  -- Metadata, not message text -- but still a look at who a person talks to.
  insert into public.moderation_audit (moderator_id, report_id, action, detail)
  values (v_uid, p_report_id, 'list_conversations', 'subject ' || v_subject::text);

  return query
  select
    c.id,
    o.other,
    (select p.display_name from public.profiles p where p.id = o.other),
    o.other = v_report.reporter_id,
    c.target_type,
    case c.target_type
      when 'sale'    then (select s.title from public.sales s    where s.id = c.target_id)
      when 'listing' then (select l.title from public.listings l where l.id = c.target_id)
    end,
    (select count(*)::int from public.messages m where m.conversation_id = c.id),
    c.last_message_at,
    (select count(*)::int from public.messages m
      where m.conversation_id = c.id and m.kind = 'offer' and m.offer_status = 'pending'),
    exists (
      select 1 from public.messages m
      where m.conversation_id = c.id
        and m.kind = 'system'
        and m.recipient_id = o.other
        and m.body like 'Safety notice from Trove:%'
    )
  from public.conversations c
  cross join lateral (
    select case when c.buyer_id = v_subject then c.seller_id else c.buyer_id end as other
  ) o
  where v_subject in (c.buyer_id, c.seller_id)
  order by c.last_message_at desc;
end;
$fn$;

grant execute on function public.mod_list_subject_conversations(uuid) to authenticated;

-- Optional conversation: null keeps the old behaviour (the reporter's thread).
-- Adding a parameter is a new signature, so the old one is dropped first; a
-- client on an older bundle calling with only p_report_id still resolves here
-- through the default.
drop function if exists public.mod_get_report_messages(uuid);

create or replace function public.mod_get_report_messages(
  p_report_id uuid,
  p_conversation_id uuid default null
)
returns table (
  id uuid,
  created_at timestamptz,
  sender_id uuid,
  sender_name text,
  body text,
  kind text,
  offer_amount numeric,
  offer_status text,
  image_url text,
  from_reported boolean
)
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_report  public.reports%rowtype;
  v_subject uuid;
  v_conv    uuid;
begin
  if not public.is_operator() then
    raise exception 'not authorized';
  end if;

  select r.* into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'report not found';
  end if;

  v_subject := public.mod_report_subject(p_report_id);
  if v_subject is null then
    raise exception 'could not resolve who was reported';
  end if;

  if p_conversation_id is null then
    select c.id into v_conv
    from public.conversations c
    where (c.buyer_id = v_report.reporter_id and c.seller_id = v_subject)
       or (c.buyer_id = v_subject and c.seller_id = v_report.reporter_id)
    order by c.last_message_at desc
    limit 1;
    if v_conv is null then
      raise exception 'the reporter and the reported account have no conversation';
    end if;
  else
    if v_report.status = 'dismissed' then
      raise exception 'this report was dismissed';
    end if;
    select c.id into v_conv
    from public.conversations c
    where c.id = p_conversation_id
      and v_subject in (c.buyer_id, c.seller_id);
    if v_conv is null then
      raise exception 'that conversation does not involve the reported account';
    end if;
  end if;

  -- Logged before any row is returned, so an abandoned read is still recorded.
  insert into public.moderation_audit (moderator_id, report_id, action, detail)
  values (v_uid, p_report_id, 'view_messages', v_conv::text);

  return query
  select
    m.id,
    m.created_at,
    m.sender_id,
    (select p.display_name from public.profiles p where p.id = m.sender_id),
    m.body,
    m.kind,
    m.offer_amount,
    m.offer_status,
    m.image_url,
    m.sender_id = v_subject
  from public.messages m
  where m.conversation_id = v_conv
  order by m.created_at asc;
end;
$fn$;

grant execute on function public.mod_get_report_messages(uuid, uuid) to authenticated;

-- ── Gap 2: warn anyone the reported account has talked to ────────────────
drop function if exists public.mod_send_safety_notice(uuid);

create or replace function public.mod_send_safety_notice(
  p_report_id uuid,
  p_conversation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid       uuid := (select auth.uid());
  v_report    public.reports%rowtype;
  v_subject   uuid;
  v_conv      uuid;
  v_recipient uuid;
  v_msg       uuid;
begin
  if not public.is_operator() then
    raise exception 'not authorized';
  end if;

  select r.* into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'report not found';
  end if;

  v_subject := public.mod_report_subject(p_report_id);
  if v_subject is null then
    raise exception 'could not resolve who was reported';
  end if;

  if p_conversation_id is null then
    -- Unchanged: the reporter, in their thread with the reported account.
    select c.id into v_conv
    from public.conversations c
    where (c.buyer_id = v_report.reporter_id and c.seller_id = v_subject)
       or (c.buyer_id = v_subject and c.seller_id = v_report.reporter_id)
    order by c.last_message_at desc
    limit 1;
    if v_conv is null then
      raise exception 'no conversation between the reporter and the reported account';
    end if;
    v_recipient := v_report.reporter_id;
  else
    if v_report.status = 'dismissed' then
      raise exception 'this report was dismissed';
    end if;
    select c.id, case when c.buyer_id = v_subject then c.seller_id else c.buyer_id end
      into v_conv, v_recipient
    from public.conversations c
    where c.id = p_conversation_id
      and v_subject in (c.buyer_id, c.seller_id);
    if v_conv is null then
      raise exception 'that conversation does not involve the reported account';
    end if;
  end if;

  if v_recipient = v_subject then
    raise exception 'cannot send the notice to the reported account';
  end if;

  -- A mis-tap should not push the same warning twice. System rows cannot be
  -- written by clients (the INSERT policy pins kind = 'text'), so matching on
  -- the prefix is not spoofable.
  if exists (
    select 1 from public.messages m
    where m.conversation_id = v_conv
      and m.kind = 'system'
      and m.recipient_id = v_recipient
      and m.body like 'Safety notice from Trove:%'
      and m.created_at > now() - interval '24 hours'
  ) then
    raise exception 'a safety notice was already sent to this person here in the last 24 hours';
  end if;

  insert into public.messages (conversation_id, sender_id, body, kind, recipient_id)
  values (v_conv, v_uid, public.mod_safety_notice_text(), 'system', v_recipient)
  returning id into v_msg;

  insert into public.moderation_audit (moderator_id, report_id, action, detail)
  values (
    v_uid, p_report_id, 'safety_notice',
    'conversation ' || v_conv::text || ', recipient ' || v_recipient::text
  );

  return v_msg;
end;
$fn$;

grant execute on function public.mod_send_safety_notice(uuid, uuid) to authenticated;

-- ── Gap 1: suspension ends a suspended account's offers ──────────────────
create or replace function public.mod_set_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid     uuid := (select auth.uid());
  v_found   integer;
  v_expired integer := 0;
begin
  if not public.is_operator() then
    raise exception 'not authorized';
  end if;
  -- Suspending yourself is unrecoverable in-app: undoing it needs direct SQL.
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
  get diagnostics v_found = row_count;
  if v_found = 0 then
    raise exception 'account not found';
  end if;

  -- Every pending offer the account is party to, BOTH directions: offers they
  -- made (so nobody accepts a suspended scammer's bid) and offers made to them
  -- (so a buyer is not left waiting on someone who can no longer answer).
  -- Holds are deliberately left alone -- whether an item stays held is the
  -- seller's decision, not a moderation side effect.
  if p_suspended then
    update public.messages m
      set offer_status = 'expired'
      from public.conversations c
      where m.conversation_id = c.id
        and m.kind = 'offer'
        and m.offer_status = 'pending'
        and p_user_id in (c.buyer_id, c.seller_id);
    get diagnostics v_expired = row_count;
  end if;

  insert into public.moderation_audit (moderator_id, report_id, action, detail)
  values (
    v_uid, null,
    case when p_suspended then 'suspend' else 'unsuspend' end,
    'user ' || p_user_id::text
      || case when p_suspended then ', expired ' || v_expired || ' pending offer(s)' else '' end
  );
end;
$fn$;

-- A suspended user must not accept or decline offers. respond_to_offer flips
-- offer_status with an UPDATE, so the insert-only block_suspended_writes
-- trigger never saw it. Only a RESPONSE is blocked: 'expired' must still go
-- through, because mark_listing_sold and release_hold write it on the seller's
-- behalf, and blocking those would let a suspension strand a hold -- the same
-- reason system rows are exempt from the insert trigger.
create or replace function public.block_suspended_offer_response()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.offer_status in ('accepted', 'declined')
     and new.offer_status is distinct from old.offer_status
     and exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.suspended_at is not null
     )
  then
    raise exception 'This account is suspended.' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists block_suspended_offer_response on public.messages;
create trigger block_suspended_offer_response
  before update of offer_status on public.messages
  for each row execute function public.block_suspended_offer_response();

-- Catch up: any account already suspended keeps no pending offers.
update public.messages m
  set offer_status = 'expired'
  from public.conversations c, public.profiles p
  where m.conversation_id = c.id
    and p.id in (c.buyer_id, c.seller_id)
    and p.suspended_at is not null
    and m.kind = 'offer'
    and m.offer_status = 'pending';

-- ── Audit the remaining actions ──────────────────────────────────────────
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
declare
  v_uid uuid := (select auth.uid());
  v_n   integer;
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
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into public.moderation_audit (moderator_id, report_id, action, detail)
    values (
      v_uid, null,
      case when p_hidden then 'hide' else 'unhide' end,
      p_target_type || ' ' || p_target_id::text
    );
  end if;
end;
$fn$;

create or replace function public.mod_set_report_status(p_report_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_n   integer;
begin
  if not public.is_operator() then
    raise exception 'not authorized';
  end if;
  if p_status not in ('open', 'resolved', 'dismissed') then
    raise exception 'invalid status: %', p_status;
  end if;
  update public.reports set status = p_status where id = p_report_id;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into public.moderation_audit (moderator_id, report_id, action, detail)
    values (v_uid, p_report_id, 'report_' || p_status, null);
  end if;
end;
$fn$;
