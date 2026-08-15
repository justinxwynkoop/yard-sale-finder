#!/usr/bin/env node
// Stamps a production OTA deploy into site/releases.json — the feed behind
// the Deployments blade on trove.sale/ops.
//
// Runs AFTER `eas update` succeeds (see the `ota` npm script), so the file
// only ever records deploys that actually happened. All parsing lives in
// scripts/lib/releases.js; this is the git + filesystem shell around it.
//
// Usage: node scripts/build-releases.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildRecord, plural } = require('./lib/releases.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASES = join(ROOT, 'site', 'releases.json');
const APP_JSON = join(ROOT, 'app.json');

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function readReleases() {
  try {
    const parsed = JSON.parse(readFileSync(RELEASES, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Missing or unparseable — treat as a fresh feed rather than dying mid-deploy.
    return [];
  }
}

function readAppVersion() {
  try {
    return JSON.parse(readFileSync(APP_JSON, 'utf8')).expo?.version ?? null;
  } catch {
    return null;
  }
}

// Commits in `sinceSha..HEAD`, newest first. Full history when sinceSha is null.
function commitsSince(sinceSha) {
  const range = sinceSha ? `${sinceSha}..HEAD` : 'HEAD';
  const out = git('log', range, '--pretty=format:%h %s');
  if (!out) return [];
  return out.split('\n').map((line) => {
    // Split on the FIRST space only - subjects contain spaces.
    const gap = line.indexOf(' ');
    return { sha: line.slice(0, gap), subject: line.slice(gap + 1) };
  });
}

const releases = readReleases();
const sinceSha = releases[0]?.headSha ?? null;
const commits = commitsSince(sinceSha);

if (commits.length === 0) {
  console.log(
    `No new commits since ${sinceSha ?? 'the beginning'} — nothing to stamp.`,
  );
  process.exit(0);
}

const record = buildRecord({
  commits,
  headSha: git('rev-parse', '--short', 'HEAD'),
  sinceSha,
  appVersion: readAppVersion(),
  deployedAt: new Date().toISOString(),
  source: 'stamped',
});

writeFileSync(RELEASES, JSON.stringify([record, ...releases], null, 2) + '\n');

const features = record.changes.filter((c) => c.type === 'feature').length;
const fixes = record.changes.filter((c) => c.type === 'fix').length;
const internal = record.otherCount ? ` (+${record.otherCount} internal)` : '';

console.log(
  `Stamped release: ${plural(features, 'feature')}, ${plural(fixes, 'fix')}${internal}`,
);
console.log(
  '→ commit site/releases.json and redeploy the site for /ops to show it',
);
