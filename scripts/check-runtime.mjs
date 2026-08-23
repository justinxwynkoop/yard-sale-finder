#!/usr/bin/env node
// Pre-publish gate for `npm run ota`: refuse to publish an OTA unless the
// runtime version in app.json matches the live production iOS build.
//
// Why this exists: on 2026-08-23 an OTA went out under a fingerprint-derived
// runtime that no installed build had (the fingerprint had drifted on an npm
// script edit), so it was published "successfully" and reached nobody. The
// runtime version is now a pinned string in app.json, and this script is
// the tripwire that makes a mismatch loud instead of silent.
//
// Usage: node scripts/check-runtime.mjs            (gate — exits 1 on mismatch)
//        node scripts/check-runtime.mjs --print    (just show both values)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  checkRuntime,
  pinnedRuntime,
  liveRuntime,
} = require('./lib/runtime.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLATFORM = 'ios'; // the only platform with a store build today

const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));

let builds;
try {
  const out = execFileSync(
    'npx',
    [
      'eas',
      'build:list',
      '--platform',
      PLATFORM,
      '--build-profile',
      'production',
      '--status',
      'finished',
      '--limit',
      '1',
      '--json',
      '--non-interactive',
    ],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  builds = JSON.parse(out);
} catch (err) {
  console.error(
    '✖ Could not read the production build list from EAS:',
    err.message,
  );
  process.exit(1);
}

if (process.argv.includes('--print')) {
  console.log(
    `app.json runtimeVersion : ${pinnedRuntime(appJson) ?? '(policy-derived)'}`,
  );
  console.log(
    `live ${PLATFORM} build runtime : ${liveRuntime(builds, PLATFORM) ?? '(none)'}`,
  );
  process.exit(0);
}

const result = checkRuntime({ appJson, builds, platform: PLATFORM });
if (!result.ok) {
  console.error('\n✖ OTA runtime check failed\n  ' + result.reason + '\n');
  process.exit(1);
}
console.log('✔ ' + result.reason);
