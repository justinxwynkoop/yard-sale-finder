import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Review, ReviewSummary } from '../types';

/**
 * Reviews for a target user. Fetched in two parts:
 * - The aggregate (avg + count) via the `review_summary` RPC — cheap
 *   for the PublicProfile header.
 * - The list of reviews (with author profile joined) for the body.
 *
 * Realtime is intentionally not subscribed — reviews are write-rare
 * and the PublicProfile screen refetches on focus.
 */
export function useReviews(userId: string | undefined) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary>({
    avg_stars: 0,
    review_count: 0,
  });
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [{ data: rows }, { data: agg }] = await Promise.all([
        supabase
          .from('reviews')
          .select('*, author:profiles!reviews_author_user_id_fkey(*)')
          .eq('subject_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.rpc('review_summary', { p_user_id: userId }),
      ]);
      setReviews((rows ?? []) as Review[]);
      const first = Array.isArray(agg) ? agg[0] : agg;
      if (first) {
        setSummary({
          avg_stars: Number(first.avg_stars) || 0,
          review_count: Number(first.review_count) || 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { reviews, summary, loading, refetch };
}

/**
 * Single-shot review submission. Used by the (future) "Leave a review"
 * flow on a finished sale. Keeps the surface tiny — the screens that
 * need this can wire it up without a dedicated hook each time.
 */
export async function submitReview(input: {
  subjectUserId: string;
  saleId?: string | null;
  stars: number;
  body?: string | null;
}): Promise<{ id?: string; error?: { message: string } }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return { error: { message: 'You must be signed in to leave a review.' } };
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      subject_user_id: input.subjectUserId,
      author_user_id: auth.user.id,
      sale_id: input.saleId ?? null,
      stars: input.stars,
      body: input.body ?? null,
    })
    .select('id')
    .single();
  if (error) return { error: { message: error.message } };
  return { id: data?.id };
}
