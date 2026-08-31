-- mod_get_report_messages raised 42702 "column reference id is ambiguous" on
-- every call.
--
-- `returns table (id uuid, created_at timestamptz, ...)` declares those names
-- as PL/pgSQL OUT variables for the whole function body, so the unqualified
--
--   select * into v_report from public.reports where id = p_report_id;
--
-- could mean either the OUT variable `id` or reports.id, and Postgres refuses
-- to guess. Every other statement in the function was already alias-qualified;
-- this one was not.
--
-- Alias the table rather than reaching for `#variable_conflict use_column`:
-- the pragma fixes this line but leaves the next unqualified reference to
-- silently resolve the other way.
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
