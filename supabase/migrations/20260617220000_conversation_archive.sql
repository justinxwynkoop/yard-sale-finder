-- Per-user conversation archive (a reopenable folder), mirroring the per-user
-- delete model. Archiving moves a thread out of the inbox into an Archived
-- view; a newer message brings it back (last_message_at > *_archived_at), and
-- the user can unarchive manually. Per-user — the other participant is
-- unaffected.

alter table public.conversations
  add column if not exists buyer_archived_at  timestamptz,
  add column if not exists seller_archived_at timestamptz;

create or replace function public.set_conversation_archived(
  p_conversation_id uuid,
  p_archived boolean
)
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
      set buyer_archived_at = case when p_archived then now() else null end
      where id = p_conversation_id;
  elsif v_conv.seller_id = v_uid then
    update public.conversations
      set seller_archived_at = case when p_archived then now() else null end
      where id = p_conversation_id;
  else
    raise exception 'not a participant';
  end if;
end;
$$;

revoke execute on function public.set_conversation_archived(uuid, boolean) from public, anon;
grant   execute on function public.set_conversation_archived(uuid, boolean) to authenticated;
