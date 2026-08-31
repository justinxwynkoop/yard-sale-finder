-- Let a moderator read the thread a report is about.
--
-- messages SELECT is participants-only, so the queue showed "reported for
-- spam" and nothing else -- you could hide content or suspend an account
-- without ever seeing what was said. That is the wrong way round.
--
-- This is private correspondence, so the access is deliberately narrow:
--
--   * Keyed on a REPORT id, never a conversation id. There is no way to ask
--     for an arbitrary thread; you can only read one somebody reported.
--   * Resolves to the single thread between the reporter and the reported
--     account. Not the reported account's other conversations.
--   * Read-only, and every read is written to moderation_audit. That matters
--     now that there is a second moderator who can open threads they are not
--     a participant in.
--   * Image bodies are reported as a flag, not a URL. message-media is a
--     private bucket whose signing path is participant-scoped; handing back
--     a URL a moderator cannot sign would be a broken affordance, and
--     widening storage access is a bigger decision than this migration.

create table if not exists public.moderation_audit (
  id           uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references auth.users(id) on delete cascade,
  report_id    uuid references public.reports(id) on delete set null,
  action       text not null,
  detail       text,
  created_at   timestamptz not null default now()
);

create index if not exists moderation_audit_created_idx
  on public.moderation_audit (created_at desc);

alter table public.moderation_audit enable row level security;
-- Deliberately NO policies: the table is written and read only by SECURITY
-- DEFINER functions. A moderator cannot read or edit the record of their own
-- access, which is the entire point of keeping one.

comment on table public.moderation_audit is
  'Append-only record of moderator actions. No RLS policies by design; only SECURITY DEFINER functions touch it.';

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
  has_image boolean,
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

  select c.id into v_conv
  from public.conversations c
  where (c.buyer_id = v_report.reporter_id and c.seller_id = v_subject)
     or (c.buyer_id = v_subject and c.seller_id = v_report.reporter_id)
  order by c.last_message_at desc
  limit 1;

  if v_conv is null then
    raise exception 'the reporter and the reported account have no conversation';
  end if;

  -- Logged BEFORE the rows are returned, so a read is recorded even if the
  -- caller abandons the result.
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
    m.image_url is not null,
    m.sender_id = v_subject
  from public.messages m
  where m.conversation_id = v_conv
  order by m.created_at asc;
end;
$fn$;

grant execute on function public.mod_get_report_messages(uuid) to authenticated;
