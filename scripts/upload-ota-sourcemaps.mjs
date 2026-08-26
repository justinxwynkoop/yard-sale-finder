#!/usr/bin/env node
// Upload the just-exported OTA bundle's source maps to Sentry, so stack
// traces from OTA'd code symbolicate. Chained after `eas update` in
// `npm run ota` (native builds upload their own maps at build time via
// SENTRY_DISABLE_AUTO_UPLOAD=false; this covers the update path, which
// sentry-expo-upload-sourcemaps handles using the debug IDs the metro
// config already injects).
//
// The Sentry CLI reads SENTRY_AUTH_TOKEN from the environment but does not
// load dotenv files itself — this wrapper sources .env.local (where the
// token lives) and then hands off. Missing token/dist degrades to a loud
// warning, not a failed deploy: symbolication is worth having, not worth
// blocking an OTA over.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

if (!existsSync(DIST)) {
  console.warn('⚠ dist/ not found — run this right after `eas update` exports. Skipping source-map upload.');
  process.exit(0);
}

if (!process.env.SENTRY_AUTH_TOKEN) {
  for (const file of ['.env.local', '.env']) {
    const p = join(ROOT, file);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^SENTRY_AUTH_TOKEN=(.+)$/m);
    if (m) {
      process.env.SENTRY_AUTH_TOKEN = m[1].trim();
      break;
    }
  }
}

if (!process.env.SENTRY_AUTH_TOKEN) {
  console.warn('⚠ SENTRY_AUTH_TOKEN not found in env, .env.local, or .env — skipping source-map upload.');
  process.exit(0);
}

const res = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['sentry-expo-upload-sourcemaps', 'dist'],
  { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);
process.exit(res.status ?? 1);
