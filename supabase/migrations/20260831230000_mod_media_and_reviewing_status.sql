-- Two loose ends from the moderation work.
--
-- 1. A moderator could read a reported thread's text but not its images.
--    message-media is private and its SELECT policy is participant-scoped, so
--    an image-only message showed as a placeholder -- fine for a spam-text
--    report, useless for an 'inappropriate content' one, where the image IS
--    the evidence.
--
-- 2. reports.status permits 'reviewing', which nothing can set:
--    mod_set_report_status accepts only open/resolved/dismissed and the queue
--    has three tabs. A fourth value no code can produce or display.

-- ── 1. Media on reported threads ─────────────────────────────────────────
-- Scoped to conversations that were actually reported, NOT all message media.
--
-- This MUST be a SECURITY DEFINER helper rather than an inline subquery over
-- public.reports. reports' select policy is `auth.uid() = reporter_id`, so a
-- policy subquery evaluated as the moderator -- who is not the reporter --
-- would see zero rows and the check would silently answer "not reported".
-- That is precisely the failure that made blocking useless until today
-- (20260831201724): an RLS subquery blind to the rows it needs to see.
create or replace function public.is_reported_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  -- Operators only. Otherwise this would let anyone probe whether a given
  -- conversation has been reported.
  select public.is_operator() and exists (
    select 1
    from public.reports r
    join public.conversations c on c.id = p_conversation_id
    where (
      -- The reported party, resolved the same way mod_get_report_messages
      -- resolves it, is on one side and the reporter on the other.
      case r.target_type
        when 'profile' then r.target_id
        when 'sale'    then (select s.user_id from public.sales s    where s.id = r.target_id)
        when 'listing' then (select l.user_id from public.listings l where l.id = r.target_id)
      end
    ) in (c.buyer_id, c.seller_id)
    and r.reporter_id in (c.buyer_id, c.seller_id)
  );
$fn$;

grant execute on function public.is_reported_conversation(uuid) to authenticated;

-- Path convention is <user_id>/<conversation_id>/<file>, which the existing
-- participant policy already relies on via foldername(name)[2].
drop policy if exists "Operators can read reported thread media" on storage.objects;
create policy "Operators can read reported thread media"
  on storage.objects
  for select
  using (
    bucket_id = 'message-media'
    and public.is_operator()
    and public.is_reported_conversation(
      ((storage.foldername(name))[2])::uuid
    )
  );

-- Hand the path back so the client can sign it, instead of only a flag.
-- has_image boolean -> image_url text is a RETURN TYPE change, which
-- create-or-replace refuses ("cannot change return type of existing
-- function"). Drop first.
drop function if exists public.mod_get_report_messages(uuid);

create or replace function public.mod_get_report_messages(p_report_id uuid)
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

  -- Alias the table: `returns table (id uuid, ...)` makes those names
  -- PL/pgSQL variables for the whole body, so an unqualified `id` here is
  -- ambiguous with the OUT column.
  select r.* into v_report
  from public.reports r
  where r.id = p_report_id;
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

  select c.id into v_conv
  from public.conversations c
  where (c.buyer_id = v_report.reporter_id and c.seller_id = v_subject)
     or (c.buyer_id = v_subject and c.seller_id = v_report.reporter_id)
  order by c.last_message_at desc
  limit 1;

  if v_conv is null then
    raise exception 'the reporter and the reported account have no conversation';
  end if;

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

grant execute on function public.mod_get_report_messages(uuid) to authenticated;

-- ── 2. Drop the unreachable 'reviewing' status ───────────────────────────
-- Safe: no row carries it (verified before writing this). If a claimed-by-a-
-- moderator state is wanted later it needs a claimant column to be meaningful
-- anyway, not just a bare fourth string.
alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports
  add constraint reports_status_check
  check (status = any (array['open'::text, 'resolved'::text, 'dismissed'::text]));
