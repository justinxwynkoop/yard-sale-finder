import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * The operator's report queue.
 *
 * Every call here is a `mod_*` SECURITY DEFINER RPC, because none of this is
 * reachable with normal privileges: `reports` is `auth.uid() = reporter_id`
 * (the operator cannot read other people's reports at all) and sales/listings
 * are owner-write-only. The RPCs each re-check `is_operator()` server-side, so
 * the UI gate on `profile.is_operator` is a courtesy, not the control.
 *
 * Mutations return `{ error }` and never throw -- same contract as
 * useConversation's send/sendOffer, so callers read `err.message` themselves.
 */

export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type ReportTargetType = 'sale' | 'listing' | 'profile';

export interface ModerationReport {
  id: string;
  created_at: string;
  status: ReportStatus;
  reason: string;
  notes: string | null;
  target_type: ReportTargetType;
  target_id: string;
  /** Sale/listing title, or the reported person's display name. */
  target_title: string | null;
  target_hidden: boolean;
  /** Who owns the reported thing. For a profile report, the reported user. */
  owner_id: string | null;
  owner_name: string | null;
  owner_suspended: boolean;
  reporter_name: string | null;
  /** Distinct reporters on this same target -- auto-hide trips at 3. */
  distinct_reporters: number;
}

/** Mirrors REASON_LABELS in the notify-new-report edge function. */
const REASON_LABELS: Record<string, string> = {
  inappropriate: 'Inappropriate content',
  spam_misleading: 'Spam or misleading',
  illegal: 'Illegal items',
  safety: 'Safety concern',
  off_topic: "Doesn't belong here",
  other: 'Something else',
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

export function useModeration(status: ReportStatus | null = 'open') {
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.rpc('mod_list_reports', {
      p_status: status,
    });
    if (err) {
      setError(err.message);
    } else {
      setError(null);
      setReports((data ?? []) as ModerationReport[]);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setHidden = useCallback(
    async (targetType: ReportTargetType, targetId: string, hidden: boolean) => {
      const { error: err } = await supabase.rpc('mod_set_hidden', {
        p_target_type: targetType,
        p_target_id: targetId,
        p_hidden: hidden,
      });
      if (!err) await refresh();
      return { error: err };
    },
    [refresh],
  );

  const setReportStatus = useCallback(
    async (reportId: string, next: ReportStatus) => {
      const { error: err } = await supabase.rpc('mod_set_report_status', {
        p_report_id: reportId,
        p_status: next,
      });
      if (!err) await refresh();
      return { error: err };
    },
    [refresh],
  );

  const setSuspended = useCallback(
    async (userId: string, suspended: boolean) => {
      const { error: err } = await supabase.rpc('mod_set_suspended', {
        p_user_id: userId,
        p_suspended: suspended,
      });
      if (!err) await refresh();
      return { error: err };
    },
    [refresh],
  );

  // Server-side this resolves the reporter and the thread they share with the
  // reported account, so there is nothing for the caller to pick. It raises
  // when no such thread exists rather than inventing one.
  const sendSafetyNotice = useCallback(async (reportId: string) => {
    const { error: err } = await supabase.rpc('mod_send_safety_notice', {
      p_report_id: reportId,
    });
    return { error: err };
  }, []);

  return {
    reports,
    loading,
    error,
    refresh,
    setHidden,
    setReportStatus,
    setSuspended,
    sendSafetyNotice,
  };
}
