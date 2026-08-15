// Pure parsing behind the ops-page deployment feed (site/ops.html).
//
// Deliberately knows nothing about git or the filesystem — build-releases.mjs
// shells out and writes files, this module just turns commit subjects and
// deploy messages into release records. That split is what makes the pipeline
// unit-testable.
//
// CommonJS on purpose: jest's testMatch is repo-wide, so this runs under the
// existing `npm test` with no config changes.

// Conventional-commit prefix, with an optional (scope).
const PREFIX = /^(feat|fix)(\([^)]*\))?:\s*(.+)$/i;

const TYPE_BY_PREFIX = { feat: 'feature', fix: 'fix' };

// Commit subject → display text: drop the prefix, capitalize, no trailing period.
function present(subject) {
  const text = String(subject).trim().replace(/\.$/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Classify a commit subject for the feed.
 * `feat*` → feature, `fix*` → fix, everything else → other (counted, not shown).
 */
function classify(subject) {
  const match = PREFIX.exec(String(subject || '').trim());
  if (!match) return { type: 'other', text: present(String(subject || '')) };

  return {
    type: TYPE_BY_PREFIX[match[1].toLowerCase()],
    text: present(match[3]),
  };
}

/**
 * Turn a commit range into one deploy record for site/releases.json.
 * `commits` arrives newest-first (git log order) and that order is preserved.
 */
function buildRecord({
  commits,
  headSha,
  sinceSha,
  appVersion,
  deployedAt,
  source,
}) {
  const changes = [];
  let otherCount = 0;

  for (const commit of commits || []) {
    const { type, text } = classify(commit.subject);
    if (type === 'other') otherCount += 1;
    else changes.push({ type, text, sha: commit.sha });
  }

  return {
    deployedAt,
    channel: 'production',
    appVersion,
    headSha,
    sinceSha: sinceSha ?? null,
    changes,
    otherCount,
    source,
  };
}

// Message-level prefix. Plural forms (fixes:, features:) signal a comma list.
const MESSAGE_PREFIX =
  /^(feat|feats|feature|features|fix|fixes)(\([^)]*\))?:\s*(.*)$/i;

// Item-level prefix, colon optional — historical messages wrote "fix item search".
const ITEM_PREFIX = /^(feat|fix)(\([^)]*\))?[:\s]\s*(.+)$/i;

// A deploy message whose $(git log ...) never interpolated: no record of content.
const UNINTERPOLATED = /^\$\(/;

/**
 * Split a deploy message into change lines.
 *
 * Used for backfilled history, where the EAS message is the only surviving
 * record of what shipped. Those messages were written by hand and are often
 * already itemized ("Map: dot pins; fix item search; Following list"), so
 * semicolons — and commas under a plural prefix — become separate lines.
 * An item without its own prefix inherits the message's type.
 */
function splitMessage(message) {
  const raw = String(message || '').trim();
  if (!raw || UNINTERPOLATED.test(raw)) return [];

  let baseType = 'feature';
  let body = raw;
  let commaSplit = false;

  const prefix = MESSAGE_PREFIX.exec(raw);
  if (prefix) {
    const word = prefix[1].toLowerCase();
    baseType = word.startsWith('fix') ? 'fix' : 'feature';
    commaSplit = /es$/.test(word);
    body = prefix[3];
  }

  let parts = body.split(';');
  if (parts.length === 1 && commaSplit) parts = body.split(',');

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const item = ITEM_PREFIX.exec(part);
      if (!item) return { type: baseType, text: present(part) };
      return {
        type: item[1].toLowerCase() === 'fix' ? 'fix' : 'feature',
        text: present(item[3]),
      };
    });
}

// Sibilant endings take -es. Narrow on purpose: the only words this ever
// pluralizes are "feature", "fix", and "deploy" — but "1 fix / 2 fixs" shipped
// once already, so it is worth getting right in one tested place.
const SIBILANT = /(?:s|x|z|ch|sh)$/i;

/** Count plus its noun, pluralized: `plural(2, 'fix')` → `2 fixes`. */
function plural(count, word) {
  if (count === 1) return count + ' ' + word;
  return count + ' ' + word + (SIBILANT.test(word) ? 'es' : 's');
}

module.exports = { classify, buildRecord, splitMessage, plural };
