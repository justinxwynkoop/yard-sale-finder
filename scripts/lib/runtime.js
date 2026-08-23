// Pure helpers behind scripts/check-runtime.mjs — the pre-publish gate that
// stops an OTA from being published under a runtime version no installed
// build has. CommonJS so jest's repo-wide testMatch picks up the tests
// without config changes (same arrangement as releases.js).

/**
 * Read the runtime version string from a parsed app.json. Returns null when
 * it's missing or policy-derived (e.g. `{ policy: 'fingerprint' }`) — the gate
 * refuses to run in that mode because the value is computed at publish time
 * from inputs that drift on non-native edits (npm scripts, .gitignore), which
 * is exactly how an update ends up orphaned.
 */
function pinnedRuntime(appJson) {
  const rv = appJson?.expo?.runtimeVersion;
  return typeof rv === 'string' && rv.trim() ? rv.trim() : null;
}

/**
 * Pick the runtime version a store build is actually running. `builds` is the
 * parsed output of `eas build:list --json`, newest first. Only FINISHED
 * production builds count — an errored build never shipped.
 */
function liveRuntime(builds, platform) {
  const live = (Array.isArray(builds) ? builds : []).find(
    (b) =>
      b &&
      b.status === 'FINISHED' &&
      b.buildProfile === 'production' &&
      (!platform || b.platform?.toLowerCase() === platform),
  );
  return live?.runtimeVersion ?? null;
}

/**
 * Decide whether an update published from this app.json would reach the
 * live build. Returns { ok, reason }.
 */
function checkRuntime({ appJson, builds, platform }) {
  const pinned = pinnedRuntime(appJson);
  if (!pinned) {
    return {
      ok: false,
      reason:
        'app.json runtimeVersion is not a pinned string. With a policy-derived ' +
        'runtime the value is recomputed at publish time and drifts on ' +
        'non-native edits, so the update can silently target a runtime no ' +
        "phone has. Pin it to the live build's runtime version.",
    };
  }
  const live = liveRuntime(builds, platform);
  if (!live) {
    return {
      ok: false,
      reason:
        `No FINISHED production ${platform ?? ''} build found to compare against.`.replace(
          '  ',
          ' ',
        ),
    };
  }
  if (live !== pinned) {
    return {
      ok: false,
      reason:
        `app.json runtimeVersion is "${pinned}" but the live production ` +
        `${platform ?? ''} build runs "${live}". Publishing now would target a ` +
        'runtime no installed app has — nobody would receive it. Either set ' +
        `runtimeVersion to "${live}" (JS-only change) or ship a new build first.`,
    };
  }
  return {
    ok: true,
    reason: `runtime ${pinned} matches the live production build`,
  };
}

module.exports = { pinnedRuntime, liveRuntime, checkRuntime };
