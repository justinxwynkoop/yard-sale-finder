import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ReportReason, ReportTargetType } from '../types';
import { useAuth } from './useAuth';

export type ReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  notes?: string;
};

/**
 * Submit a content report.
 *
 * Returns { error: null } on success. The server-side RLS policy
 * pins reporter_id to auth.uid() via the insert check, so we always
 * pass user.id explicitly. The reports table has no update/delete
 * policies for end users — only the operator can triage.
 */
export function useReports() {
  const { user } = useAuth();

  const submit = useCallback(
    async (input: ReportInput) => {
      if (!user) return { error: new Error('not signed in') };
      const { error } = await supabase.from('reports').insert({
        reporter_id: user.id,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        notes: input.notes ?? null,
      });
      if (error) return { error };
      return { error: null };
    },
    [user],
  );

  return { submit };
}

/**
 * Human-readable label for each reason. Source of truth for the
 * ReportSheet's picker, and for any future moderation tooling that
 * wants to render the reason in a UI.
 */
export const REPORT_REASONS: { value: ReportReason; label: string; hint?: string }[] = [
  {
    value: 'inappropriate',
    label: 'Inappropriate content',
    hint: 'Nudity, violence, hateful or harassing material',
  },
  {
    value: 'spam_misleading',
    label: 'Spam or misleading',
    hint: 'Fake listing, misrepresented item, or repeated posts',
  },
  {
    value: 'illegal',
    label: 'Illegal items',
    hint: 'Weapons, drugs, stolen goods, or anything prohibited by law',
  },
  {
    value: 'safety',
    label: 'Safety concern',
    hint: 'Scam attempts, threats, or unsafe meetup conditions',
  },
  {
    value: 'off_topic',
    label: "Doesn't belong here",
    hint: 'Not a yard sale, or not relevant to this app',
  },
  {
    value: 'other',
    label: 'Something else',
    hint: 'Add a note below to tell us more',
  },
];
