import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { REPORT_REASONS } from './useReports';
import { ReportTargetType } from '../types';

/**
 * The operator's report queue.
 *
 * Every call here is a `mod_*` SECURITY DEFINER RPC, because none of this is
 * reachable with normal privileges: `reports` is `auth.uid() = reporter_id`
 * (the operator cannot read other people's reports at all) and sales/listings
 * are owner-write-only. The RPCs each re-check `is_operator()` server-side, so
 * the UI gate on `profile.is_operator` is a courtesy, not the control.
 *
 * Every read AND every action is written to moderation_audit server-side.
 *
 * Mutations return `{ error }` and never throw -- same contract as
 * useConversation's send/sendOffer, so callers read `err.message` themselves.
 */

export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type { ReportTargetType };

/**
 * One message from a reported account's thread. image_url is the storage PATH,
 * not a URL -- the client signs it, which works for moderators because a
 * storage policy grants read on media from reported accounts' conversations.
 */
export interface ModerationMessage {
  id: string;
  created_at: string;
  sender_id: string;
  sender_name: string | null;
  body: string | null;
  kind: string;
  offer_amount: number | null;
  offer_status: string | null;
  /** Storage path; sign with getSignedMessageImage. Null for text rows. */
  image_url: string | null;
  /** Sent by the reported account. Drives bubble side. */
  from_reported: boolean;
}

/**
 * One conversation the reported account is part of. Metadata only -- but
 * listing these is recorded, and opening one records a read.
 */
export interface ModerationConversation {
  conversation_id: string;
  other_id: string;
  other_name: string | null;
  /** The other person is the one who filed this report. */
  is_reporter: boolean;
  target_type: 'sale' | 'listing';
  target_title: string | null;
  message_count: number;
  last_message_at: string;
  /** Offers in this thread still awaiting a response. */
  pending_offers: number;
  /** A safety notice has already been sent to the other person here. */
  notice_sent: boolean;
}

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

/**
 * REPORT_REASONS (useReports) already calls itself the source of truth for
 * "any future moderation tooling that wants to render the reason in a UI" --
 * so use it rather than keeping a second copy in sync by hand. The
 * notify-new-report edge function still has its own map because Deno cannot
 * import from the app bundle; that copy is pinned by a test.
 *
 * Falls back to the raw value so a reason added to the DB check constraint
 * before the client knows about it still renders as something.
 */
export function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
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

  // Suspending also expires every pending offer the account is party to, in
  // both directions, and blocks them from accepting or declining offers.
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

  // With no conversation: the reporter, in their thread with the reported
  // account. With one: whoever the reported account was talking to there --
  // which is how someone at risk who never filed a report gets warned. The
  // server refuses a conversation the reported account isn't in, a dismissed
  // report, and a repeat notice to the same person within 24 hours.
  const sendSafetyNotice = useCallback(
    async (reportId: string, conversationId?: string) => {
      const { error: err } = await supabase.rpc('mod_send_safety_notice', {
        p_report_id: reportId,
        ...(conversationId ? { p_conversation_id: conversationId } : {}),
      });
      return { error: err };
    },
    [],
  );

  // Everyone the reported account has messaged. Refused once the report is
  // dismissed -- a moderator decided there was nothing there.
  const listSubjectConversations = useCallback(async (reportId: string) => {
    const { data, error: err } = await supabase.rpc(
      'mod_list_subject_conversations',
      { p_report_id: reportId },
    );
    return {
      conversations: (data ?? []) as ModerationConversation[],
      error: err,
    };
  }, []);

  // With no conversation: the reporter's thread with the reported account,
  // readable at any report status. With one: any of the reported account's
  // threads, while the report is not dismissed. Every read is recorded.
  const getReportMessages = useCallback(
    async (reportId: string, conversationId?: string) => {
      const { data, error: err } = await supabase.rpc('mod_get_report_messages', {
        p_report_id: reportId,
        ...(conversationId ? { p_conversation_id: conversationId } : {}),
      });
      return {
        messages: (data ?? []) as ModerationMessage[],
        error: err,
      };
    },
    [],
  );

  return {
    reports,
    loading,
    error,
    refresh,
    setHidden,
    setReportStatus,
    setSuspended,
    sendSafetyNotice,
    getReportMessages,
    listSubjectConversations,
  };
}
