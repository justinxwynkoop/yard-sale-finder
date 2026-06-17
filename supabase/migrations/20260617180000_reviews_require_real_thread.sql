-- Tighten the review gate: you can only rate a host after a real back-and-forth
-- about an item — YOU (the reviewer) sent at least 2 messages in a conversation
-- with them AND they replied at least once. A single ping (or one-tap
-- "message then rate") no longer unlocks a rating.

drop policy if exists "Users can write their own reviews" on public.reviews;
create policy "Users can write their own reviews"
  on public.reviews for insert
  with check (
    auth.uid() = author_user_id
    and sale_id is null
    and exists (
      select 1
      from public.conversations c
      where (
        (c.buyer_id = auth.uid() and c.seller_id = subject_user_id)
        or (c.seller_id = auth.uid() and c.buyer_id = subject_user_id)
      )
      and (
        select count(*) from public.messages m
        where m.conversation_id = c.id and m.sender_id = auth.uid()
      ) >= 2
      and exists (
        select 1 from public.messages m2
        where m2.conversation_id = c.id and m2.sender_id = subject_user_id
      )
    )
  );

create or replace function public.can_review(p_subject uuid)
returns table (eligible boolean, already_reviewed boolean)
language sql stable security invoker as $$
  select
    (
      exists (
        select 1
        from public.conversations c
        where (
          (c.buyer_id = auth.uid() and c.seller_id = p_subject)
          or (c.seller_id = auth.uid() and c.buyer_id = p_subject)
        )
        and (
          select count(*) from public.messages m
          where m.conversation_id = c.id and m.sender_id = auth.uid()
        ) >= 2
        and exists (
          select 1 from public.messages m2
          where m2.conversation_id = c.id and m2.sender_id = p_subject
        )
      )
    ) and auth.uid() is not null and auth.uid() <> p_subject,
    exists (
      select 1 from public.reviews r
      where r.subject_user_id = p_subject
        and r.author_user_id = auth.uid()
        and r.sale_id is null
    );
$$;
