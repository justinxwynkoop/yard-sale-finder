import * as fs from 'fs';
import * as path from 'path';
import { REPORT_REASONS } from '../useReports';
import { reasonLabel } from '../useModeration';
import { ReportReason } from '../../types';

// Both hooks import the Supabase client, which throws at import time when the
// EXPO_PUBLIC_* env vars are absent (they are, in jest). Nothing under test
// touches it -- REPORT_REASONS and reasonLabel are pure data and a lookup.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));

/**
 * The report-reason vocabulary is duplicated by necessity: the app bundle and
 * the notify-new-report edge function (Deno, cannot import from the bundle).
 * It had drifted into FIVE copies before this; two of them are now one, and
 * these tests pin what remains.
 */

// Compile-time exhaustiveness: adding a member to ReportReason without adding
// it here fails typecheck, which is the reminder to update REPORT_REASONS too.
const ALL_REASONS: Record<ReportReason, true> = {
  inappropriate: true,
  spam_misleading: true,
  illegal: true,
  safety: true,
  off_topic: true,
  other: true,
};

describe('REPORT_REASONS', () => {
  it('covers every ReportReason exactly once', () => {
    const declared = Object.keys(ALL_REASONS).sort();
    const listed = REPORT_REASONS.map((r) => r.value).sort();
    expect(listed).toEqual(declared);
  });

  it('gives every reason a non-empty label', () => {
    for (const r of REPORT_REASONS) {
      expect(r.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('reasonLabel', () => {
  it('reads from REPORT_REASONS rather than a second copy', () => {
    for (const r of REPORT_REASONS) {
      expect(reasonLabel(r.value)).toBe(r.label);
    }
  });

  it('falls back to the raw value for a reason the client does not know', () => {
    // The DB check constraint could gain a value before the app ships.
    expect(reasonLabel('brand_new_reason')).toBe('brand_new_reason');
  });
});

describe('notify-new-report edge function', () => {
  // Deno can't import from the app bundle, so that function keeps its own
  // REASON_LABELS map. It CAN be read as a file, so the two are pinned here --
  // an operator push saying "New report — spam_misleading" instead of "Spam or
  // misleading" is the failure this prevents.
  const source = fs.readFileSync(
    path.join(__dirname, '../../../supabase/functions/notify-new-report/index.ts'),
    'utf8',
  );

  it('labels exactly the same reasons, with the same words', () => {
    const block = source.match(
      /const REASON_LABELS: Record<string, string> = \{([\s\S]*?)\};/,
    );
    expect(block).not.toBeNull();

    const edge: Record<string, string> = {};
    for (const line of block![1].split('\n')) {
      const m = line.match(/^\s*([a-z_]+):\s*(['"])(.*?)\2,?\s*$/);
      if (m) edge[m[1]] = m[3];
    }

    const client = Object.fromEntries(
      REPORT_REASONS.map((r) => [r.value, r.label]),
    );
    expect(edge).toEqual(client);
  });
});
