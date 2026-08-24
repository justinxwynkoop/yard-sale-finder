// Thin Supabase REST reader for the public share pages + sitemap.
//
// Uses the publishable key (public read via RLS — the same key shipped in
// the app binary and in ops.html). Kept separate from ./share.js so the
// pure helpers stay importable in unit tests with zero network surface.

const BASE = 'https://dxahcamntwtuzftxbxgx.supabase.co/rest/v1/';
const KEY = 'sb_publishable_mpxg4esDmwVJ6CkJTTJ6CA__-6QrZqJ';

/**
 * GET the first query variant that succeeds. A 400 falls through to the
 * next variant — that is how the optional `hidden_at` / `updated_at`
 * columns degrade before their migrations land (unknown column/filter =>
 * PostgREST 400). Any other failure throws.
 */
async function supaTry(variants) {
  let lastStatus = null;
  for (const path of variants) {
    const r = await fetch(BASE + path, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
    });
    if (r.ok) return r.json();
    lastStatus = r.status;
    if (r.status !== 400) break;
  }
  throw new Error('supabase request failed (' + lastStatus + ')');
}

module.exports = { supaTry };
