// Private ops metrics for trove.sale/ops.
//
// The dashboard page is passcode-gated client-side, but RLS (correctly)
// blocks the public key from reading private tables — so those counts come
// through here instead. This function holds the Supabase service-role key
// as a Vercel env var and only answers when the caller presents the ops
// passcode (verified against its SHA-256 hash, also an env var). Secrets
// never appear in the page or this file.
const crypto = require('crypto');

const SUPA = 'https://dxahcamntwtuzftxbxgx.supabase.co/rest/v1/';

async function count(table, filter, key) {
  // select=* — some tables (follows, blocked_users, user_push_tokens) have
  // composite or user_id keys and no `id` column; select=id 400s on those.
  const url = SUPA + table + '?select=*' + (filter ? '&' + filter : '');
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: 'Bearer ' + key, Prefer: 'count=exact' },
    });
    const total = (r.headers.get('content-range') || '').split('/')[1];
    return total && total !== '*' ? parseInt(total, 10) : null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  const pass = req.headers['x-ops-key'] || '';
  const hash = crypto.createHash('sha256').update(String(pass)).digest('hex');
  if (!process.env.OPS_PASS_HASH || hash !== process.env.OPS_PASS_HASH) {
    res.statusCode = 401;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  const key = process.env.SUPABASE_SERVICE_KEY;
  const since48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  const [
    conversations,
    messages,
    messages48h,
    push,
    reports,
    blocks,
    follows,
    totalUsers,
    seedUsers,
    appleUsers,
    newest,
  ] =
    await Promise.all([
      count('conversations', null, key),
      count('messages', null, key),
      count('messages', 'created_at=gt.' + since48h, key),
      count('user_push_tokens', null, key),
      count('reports', null, key),
      count('blocked_users', null, key),
      count('follows', null, key),
      // Account exclusions: seed sellers and Apple's App Review accounts are
      // only identifiable by email, which lives in owner-only private_profiles
      // — hence counted here, not client-side. Review accounts always sign in
      // with Apple + Hide My Email, so they surface as @privaterelay.appleid.com.
      // (A genuine user who hides their email is excluded too — best signal
      // available without tracking reviewers by hand.)
      count('profiles', null, key),
      count('private_profiles', 'email=like.*@localhauls.test', key),
      count('private_profiles', 'email=like.*@privaterelay.appleid.com', key),
      // Newest signup timestamp (aggregate only — no identity data leaves here).
      fetch(SUPA + 'profiles?select=created_at&order=created_at.desc&limit=1', {
        headers: { apikey: key, Authorization: 'Bearer ' + key },
      })
        .then((r) => r.json())
        .then((rows) => (rows && rows[0] ? rows[0].created_at : null))
        .catch(() => null),
    ]);

  // Accounts = everything minus seed sellers; realUsers additionally drops
  // Apple App Review sign-ins. Null-safe: a failed sub-count yields null
  // rather than a silently-wrong number.
  const accounts =
    totalUsers === null || seedUsers === null ? null : totalUsers - seedUsers;
  const realUsers =
    accounts === null || appleUsers === null ? null : accounts - appleUsers;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    JSON.stringify({
      conversations,
      messages,
      messages48h,
      push,
      reports,
      blocks,
      follows,
      accounts,
      realUsers,
      seedUsers,
      appleUsers,
      newestSignupAt: newest,
    }),
  );
};
