-- Ratings are for people you've actually communicated with — not for someone
-- whose yard sale you attended.
--
-- Previously you could rate a host if you'd messaged them (with a reply) OR if
-- you'd marked one of their sales "visited." Drop the visited-a-sale path and
-- stop tying reviews to a specific sale, so a rating only reflects a real
-- two-way conversation.

drop policy if exists "Users can write their own reviews" on public.reviews;
create policy "Users can write their own reviews"
  on public.reviews for insert
  with check (
    auth.uid() = author_user_id
    -- No longer tied to a specific sale.
    and sale_id is null
    -- Must have a conversation where the subject actually replied (two-way
    -- contact that can't be self-manufactured via start_conversation).
    and exists (
      select 1
      from public.conversations c
      join public.messages m on m.conversation_id = c.id
      where (
        (c.buyer_id = auth.uid() and c.seller_id = subject_user_id)
        or (c.seller_id = auth.uid() and c.buyer_id = subject_user_id)
      )
      and m.sender_id = subject_user_id
    )
  );

-- Keep can_review() in lockstep: eligible only via a replied-to conversation.
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
    ) and auth.uid() is not null and auth.uid() <> p_subject,
    exists (
      select 1 from public.reviews r
      where r.subject_user_id = p_subject
        and r.author_user_id = auth.uid()
        and r.sale_id is null
    );
$$;
