-- perf(db): wrap auth.* in (select ...) so RLS evaluates it once per query
-- instead of once per row (Supabase auth_rls_initplan). Behavior-identical;
-- generated from the live policy definitions.

drop policy if exists "Users can delete their own blocks" on public.blocked_users;
create policy "Users can delete their own blocks" on public.blocked_users
  as permissive for delete to public
  using (((select auth.uid()) = blocker_id));

drop policy if exists "Users can insert their own blocks" on public.blocked_users;
create policy "Users can insert their own blocks" on public.blocked_users
  as permissive for insert to public
  with check (((select auth.uid()) = blocker_id));

drop policy if exists "Users can read their own blocks" on public.blocked_users;
create policy "Users can read their own blocks" on public.blocked_users
  as permissive for select to public
  using (((select auth.uid()) = blocker_id));

drop policy if exists "Participants can read their conversations" on public.conversations;
create policy "Participants can read their conversations" on public.conversations
  as permissive for select to public
  using (((((select auth.uid()) = buyer_id) OR ((select auth.uid()) = seller_id)) AND (NOT (EXISTS ( SELECT 1
   FROM blocked_users b
  WHERE (((b.blocker_id = conversations.buyer_id) AND (b.blocked_id = conversations.seller_id)) OR ((b.blocker_id = conversations.seller_id) AND (b.blocked_id = conversations.buyer_id))))))));

drop policy if exists "Users can delete own favorites" on public.favorites;
create policy "Users can delete own favorites" on public.favorites
  as permissive for delete to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can insert own favorites" on public.favorites;
create policy "Users can insert own favorites" on public.favorites
  as permissive for insert to public
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users can read own favorites" on public.favorites;
create policy "Users can read own favorites" on public.favorites
  as permissive for select to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can follow others" on public.follows;
create policy "Users can follow others" on public.follows
  as permissive for insert to public
  with check (((select auth.uid()) = follower_id));

drop policy if exists "Users can unfollow" on public.follows;
create policy "Users can unfollow" on public.follows
  as permissive for delete to public
  using (((select auth.uid()) = follower_id));

drop policy if exists "Users can update their own follows" on public.follows;
create policy "Users can update their own follows" on public.follows
  as permissive for update to public
  using (((select auth.uid()) = follower_id))
  with check (((select auth.uid()) = follower_id));

drop policy if exists "Users can delete their own listing favorites" on public.listing_favorites;
create policy "Users can delete their own listing favorites" on public.listing_favorites
  as permissive for delete to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can insert their own listing favorites" on public.listing_favorites;
create policy "Users can insert their own listing favorites" on public.listing_favorites
  as permissive for insert to public
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users can read their own listing favorites" on public.listing_favorites;
create policy "Users can read their own listing favorites" on public.listing_favorites
  as permissive for select to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can manage media for their own listings" on public.listing_media;
create policy "Users can manage media for their own listings" on public.listing_media
  as permissive for all to public
  using (((select auth.uid()) = ( SELECT listings.user_id
   FROM listings
  WHERE (listings.id = listing_media.listing_id))));

drop policy if exists "Users can delete their own listings" on public.listings;
create policy "Users can delete their own listings" on public.listings
  as permissive for delete to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can insert their own listings" on public.listings;
create policy "Users can insert their own listings" on public.listings
  as permissive for insert to public
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users can update their own listings" on public.listings;
create policy "Users can update their own listings" on public.listings
  as permissive for update to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Participants can read their messages" on public.messages;
create policy "Participants can read their messages" on public.messages
  as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.buyer_id = (select auth.uid())) OR (c.seller_id = (select auth.uid()))) AND (NOT (EXISTS ( SELECT 1
           FROM blocked_users b
          WHERE (((b.blocker_id = c.buyer_id) AND (b.blocked_id = c.seller_id)) OR ((b.blocker_id = c.seller_id) AND (b.blocked_id = c.buyer_id))))))))));

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages
  as permissive for insert to public
  with check ((((select auth.uid()) = sender_id) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.buyer_id = (select auth.uid())) OR (c.seller_id = (select auth.uid()))) AND (NOT (EXISTS ( SELECT 1
           FROM blocked_users b
          WHERE (((b.blocker_id = c.buyer_id) AND (b.blocked_id = c.seller_id)) OR ((b.blocker_id = c.seller_id) AND (b.blocked_id = c.buyer_id)))))))))));

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  as permissive for insert to public
  with check (((select auth.uid()) = id));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  as permissive for update to public
  using (((select auth.uid()) = id));

drop policy if exists "Users can create reports" on public.reports;
create policy "Users can create reports" on public.reports
  as permissive for insert to public
  with check (((select auth.uid()) = reporter_id));

drop policy if exists "Users can read their own reports" on public.reports;
create policy "Users can read their own reports" on public.reports
  as permissive for select to public
  using (((select auth.uid()) = reporter_id));

drop policy if exists "Users can delete their own reviews" on public.reviews;
create policy "Users can delete their own reviews" on public.reviews
  as permissive for delete to public
  using (((select auth.uid()) = author_user_id));

drop policy if exists "Users can update their own reviews" on public.reviews;
create policy "Users can update their own reviews" on public.reviews
  as permissive for update to public
  using (((select auth.uid()) = author_user_id));

drop policy if exists "Users can write their own reviews" on public.reviews;
create policy "Users can write their own reviews" on public.reviews
  as permissive for insert to public
  with check ((((select auth.uid()) = author_user_id) AND (sale_id IS NULL) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((((c.buyer_id = (select auth.uid())) AND (c.seller_id = reviews.subject_user_id)) OR ((c.seller_id = (select auth.uid())) AND (c.buyer_id = reviews.subject_user_id))) AND (( SELECT count(*) AS count
           FROM messages m
          WHERE ((m.conversation_id = c.id) AND (m.sender_id = (select auth.uid())))) >= 2) AND (EXISTS ( SELECT 1
           FROM messages m2
          WHERE ((m2.conversation_id = c.id) AND (m2.sender_id = reviews.subject_user_id)))))))));

drop policy if exists "Users can manage media for their own sales" on public.sale_media;
create policy "Users can manage media for their own sales" on public.sale_media
  as permissive for all to public
  using (((select auth.uid()) = ( SELECT sales.user_id
   FROM sales
  WHERE (sales.id = sale_media.sale_id))));

drop policy if exists "Users can delete their own visits" on public.sale_visits;
create policy "Users can delete their own visits" on public.sale_visits
  as permissive for delete to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can insert their own visits" on public.sale_visits;
create policy "Users can insert their own visits" on public.sale_visits
  as permissive for insert to public
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users can read their own visits" on public.sale_visits;
create policy "Users can read their own visits" on public.sale_visits
  as permissive for select to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can delete their own sales" on public.sales;
create policy "Users can delete their own sales" on public.sales
  as permissive for delete to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can insert their own sales" on public.sales;
create policy "Users can insert their own sales" on public.sales
  as permissive for insert to public
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users can update their own sales" on public.sales;
create policy "Users can update their own sales" on public.sales
  as permissive for update to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users delete own location" on public.user_locations;
create policy "Users delete own location" on public.user_locations
  as permissive for delete to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users insert own location" on public.user_locations;
create policy "Users insert own location" on public.user_locations
  as permissive for insert to public
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users read own location" on public.user_locations;
create policy "Users read own location" on public.user_locations
  as permissive for select to public
  using (((select auth.uid()) = user_id));

drop policy if exists "Users update own location" on public.user_locations;
create policy "Users update own location" on public.user_locations
  as permissive for update to public
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

-- policies rewritten: 37

