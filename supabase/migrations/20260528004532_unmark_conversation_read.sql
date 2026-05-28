-- Security-definer RPC: mark a conversation as unread for the caller.
--
-- Because conversations has no direct UPDATE policy for end users,
-- the "Mark Unread" swipe action in the inbox must go through an RPC
-- that runs as the function owner (who does have table access).
--
-- Mirror of mark_conversation_read: instead of setting *_last_read_at
-- to NOW(), we set it to NULL so the unread check
--   (last_msg.created_at > last_read_at, or last_read_at IS NULL)
-- evaluates to true and the red dot reappears.

create or replace function public.unmark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid   := auth.uid();
  v_conv record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select buyer_id, seller_id
    into v_conv
    from public.conversations
   where id = p_conversation_id;

  if not found then
    raise exception 'conversation not found';
  end if;

  if v_conv.buyer_id = v_uid then
    update public.conversations
       set buyer_last_read_at = null
     where id = p_conversation_id;
  elsif v_conv.seller_id = v_uid then
    update public.conversations
       set seller_last_read_at = null
     where id = p_conversation_id;
  else
    raise exception 'not a participant';
  end if;
end;
$$;

-- Lock down execution: only authenticated users may call this function.
revoke execute on function public.unmark_conversation_read(uuid) from public, anon;
grant  execute on function public.unmark_conversation_read(uuid) to   authenticated;
