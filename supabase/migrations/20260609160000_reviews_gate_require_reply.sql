-- Harden the review interaction gate.
--
-- The previous gate accepted "a conversation exists in either
-- direction" as proof of interaction. But start_conversation is
-- SECURITY DEFINER and lets a buyer open a thread against ANY seller's
-- sale with no seller consent — so an attacker could unlock reviewing
-- any active seller by tapping Message once, defeating the point.
--
-- Fix: the conversation branch now requires a message FROM the subject
-- (i.e. they actually replied), proving two-way contact that can't be
-- self-manufactured. The sale_visits branch stays — attending a public
-- sale you marked visited is a legitimate, deliberate act, and it's
-- still capped at one standalone review per (subject, author).

drop policy if exists "Users can write their own reviews" on public.reviews;
create policy "Users can write their own reviews"
  on public.reviews for insert
  with check (
    auth.uid() = author_user_id
    and (
      sale_id is null
      or exists (
        select 1 from public.sales s
        where s.id = sale_id and s.user_id = subject_user_id
      )
    )
    and (
      exists (
        select 1
        from public.conversations c
        join public.messages m on m.conversation_id = c.id
        where (
          (c.buyer_id = auth.uid() and c.seller_id = subject_user_id)
          or (c.seller_id = auth.uid() and c.buyer_id = subject_user_id)
        )
        and m.sender_id = subject_user_id
      )
      or exists (
        select 1
        from public.sale_visits v
        join public.sales sv on sv.id = v.sale_id
        where v.user_id = auth.uid() and sv.user_id = subject_user_id
      )
    )
  );

-- Keep can_review() in lockstep with the policy above.
create or replace function public.can_review(p_subject uuid)
returns table (eligible boolean, already_reviewed boolean)
language sql stable security invoker as $$
  select
    (
      exists (
        select 1
        from public.conversations c
        join public.messages m on m.conversation_id = c.id
        where (
          (c.buyer_id = auth.uid() and c.seller_id = p_subject)
          or (c.seller_id = auth.uid() and c.buyer_id = p_subject)
        )
        and m.sender_id = p_subject
      )
      or exists (
        select 1
        from public.sale_visits v
        join public.sales sv on sv.id = v.sale_id
        where v.user_id = auth.uid() and sv.user_id = p_subject
      )
    ) and auth.uid() is not null and auth.uid() <> p_subject,
    exists (
      select 1 from public.reviews r
      where r.subject_user_id = p_subject
        and r.author_user_id = auth.uid()
        and r.sale_id is null
    );
$$;
