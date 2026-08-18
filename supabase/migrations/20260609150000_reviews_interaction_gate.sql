-- Tighten review inserts — close the review-bombing hole.
--
-- The original INSERT policy only required auth.uid() = author_user_id,
-- which left two abuse paths open to any authenticated user via the raw
-- PostgREST API (no UI needed):
--   1. No interaction gating: you could review anyone you'd never met.
--   2. sale_id was never validated to belong to the subject, so the
--      (subject, author, sale_id) uniqueness could be defeated by
--      attaching arbitrary sale ids — unlimited 1-star reviews per pair.
--
-- New rule: you can review someone only if you actually interacted —
-- you have a conversation with them (the closest thing to a transaction
-- record in an off-platform marketplace) or you marked one of their
-- sales visited. And a sale-scoped review must reference a sale the
-- subject actually owns.

drop policy if exists "Users can write their own reviews" on public.reviews;
create policy "Users can write their own reviews"
  on public.reviews for insert
  with check (
    auth.uid() = author_user_id
    -- A sale-scoped review must be about one of the subject's sales.
    and (
      sale_id is null
      or exists (
        select 1 from public.sales s
        where s.id = sale_id and s.user_id = subject_user_id
      )
    )
    -- Interaction gate: a conversation in either direction, or a
    -- visited mark on one of the subject's sales.
    and (
      exists (
        select 1 from public.conversations c
        where (c.buyer_id = auth.uid() and c.seller_id = subject_user_id)
           or (c.seller_id = auth.uid() and c.buyer_id = subject_user_id)
      )
      or exists (
        select 1
        from public.sale_visits v
        join public.sales sv on sv.id = v.sale_id
        where v.user_id = auth.uid() and sv.user_id = subject_user_id
      )
    )
  );

-- Helper for the client: "may I review this user, and have I already?"
-- Mirrors the INSERT policy's interaction gate so the UI can show or
-- hide the entry point without duplicating the predicate in JS.
create or replace function public.can_review(p_subject uuid)
returns table (eligible boolean, already_reviewed boolean)
language sql stable security invoker as $$
  select
    (
      exists (
        select 1 from public.conversations c
        where (c.buyer_id = auth.uid() and c.seller_id = p_subject)
           or (c.seller_id = auth.uid() and c.buyer_id = p_subject)
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
