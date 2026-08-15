#!/usr/bin/env node
// ONE-TIME reconstruction of production OTA history into site/releases.json.
// NOT part of the deploy path — new deploys are stamped by build-releases.mjs
// with real wall-clock times and itemized from git.
//
// Why this can't be itemized from git: the historical deploy messages were
// written by hand, not taken from commit subjects (only 1 of 25 matches a
// commit, even fuzzily). So the EAS message IS the surviving record of what
// shipped, and splitMessage() turns it into change lines.
//
// Two further limits, both deliberate:
//   - EAS's CLI reports a RELATIVE age ("6 days ago"), not a timestamp, so
//     every date here is reconstructed. Records are marked source:"backfill"
//     and the ops page labels those rows approximate. A reconstructed date
//     must never read as a measured one.
//   - Deploy order comes from EAS, not from the reconstructed dates — coarse
//     ages tie (six deploys all read "1 month ago") and sorting on them would
//     scramble a sequence EAS already has right.
//
// Usage: node scripts/backfill-releases.mjs <eas-update-list.json>
//   input: `eas update:list --branch production --limit 50 --json`

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { splitMessage } = require('./lib/releases.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASES = join(ROOT, 'site', 'releases.json');

const input = process.argv[2];
if (!input) {
  console.error(
    'usage: node scripts/backfill-releases.mjs <eas-update-list.json>',
  );
  process.exit(1);
}

// `"subject" (6 days ago by someone)` → subject, age
const MESSAGE = /^"([\s\S]*)"\s*\((.+?)\s+by\s+.+\)$/;
const AGE = /^(?:about\s+)?(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago$/;
const AGE_MS = {
  minute: 60e3,
  hour: 3600e3,
  day: 86400e3,
  week: 7 * 86400e3,
  month: 30 * 86400e3,
  year: 365 * 86400e3,
};

// Each deploy publishes one update per platform; they share a message.
// Collapse to unique messages, preserving the CLI's newest-first order.
const page = JSON.parse(readFileSync(input, 'utf8')).currentPage;
const deploys = [];
const byMessage = new Map();

for (const update of page) {
  if (!byMessage.has(update.message)) {
    const entry = { raw: update.message, platforms: new Set() };
    byMessage.set(update.message, entry);
    deploys.push(entry);
  }
  for (const platform of String(update.platforms).split(',')) {
    byMessage.get(update.message).platforms.add(platform.trim());
  }
}

const now = Date.now();

const records = deploys.map((deploy) => {
  const match = MESSAGE.exec(deploy.raw);
  const subject = match ? match[1].trim() : deploy.raw.trim();
  const age = match && AGE.exec(match[2].trim());
  const deployedAt = age
    ? new Date(now - Number(age[1]) * AGE_MS[age[2]]).toISOString()
    : null;

  const changes = splitMessage(subject);

  return {
    deployedAt,
    channel: 'production',
    appVersion: null,
    headSha: null,
    sinceSha: null,
    platforms: [...deploy.platforms].sort(),
    changes,
    otherCount: 0,
    source: 'backfill',
    // Nothing survives about this deploy's contents — say so rather than
    // rendering a blank row that just looks like a bug.
    ...(changes.length ? {} : { note: 'Deploy message was not recorded' }),
  };
});

// The newest record carries the diff cursor for the first stamped release.
// Without it build-releases.mjs sees headSha: null on every backfilled row,
// treats the feed as empty, and stamps the ENTIRE repo history as one deploy.
// HEAD is the right cursor: everything committed up to now is already live.
if (records.length) {
  records[0].headSha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
}

writeFileSync(RELEASES, JSON.stringify(records, null, 2) + '\n');

const lines = records.reduce((n, r) => n + r.changes.length, 0);
const blank = records.filter((r) => r.note).length;
console.log(
  `Backfilled ${records.length} production deploys, ${lines} change lines` +
    (blank ? `, ${blank} with no recorded message` : '') +
    '.',
);
