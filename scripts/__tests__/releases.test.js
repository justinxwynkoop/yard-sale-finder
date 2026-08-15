// Parser behind the ops-page deployment feed. Pure — no git, no filesystem —
// so the stamper script around it stays a thin shell.
const {
  classify,
  buildRecord,
  splitMessage,
  plural,
} = require('../lib/releases');

describe('classify', () => {
  it('maps a feat: commit to a feature', () => {
    expect(classify('feat: listing drafts')).toEqual({
      type: 'feature',
      text: 'Listing drafts',
    });
  });

  it('maps a scoped feat(db): commit to a feature and drops the scope', () => {
    expect(classify('feat(db): neighborhood sale events')).toEqual({
      type: 'feature',
      text: 'Neighborhood sale events',
    });
  });

  it('maps a fix: commit to a fix', () => {
    expect(
      classify('fix: count listing views only on successful load'),
    ).toEqual({
      type: 'fix',
      text: 'Count listing views only on successful load',
    });
  });

  it('maps a scoped fix(map): commit to a fix', () => {
    expect(classify('fix(map): recenter when location resolves').type).toBe(
      'fix',
    );
  });

  it.each([
    'docs: drafts design spec',
    'test: async storage mock',
    'chore: bump deps',
  ])('treats %s as internal', (subject) => {
    expect(classify(subject).type).toBe('other');
  });

  it('treats a subject with no conventional prefix as internal', () => {
    expect(classify('bumped the version').type).toBe('other');
  });

  it('strips a trailing period from the display text', () => {
    expect(classify('fix: stray BOM in CreateSaleScreen.').text).toBe(
      'Stray BOM in CreateSaleScreen',
    );
  });

  it('leaves an already-capitalized subject alone', () => {
    expect(classify('feat: DraftBanner and DraftRow components').text).toBe(
      'DraftBanner and DraftRow components',
    );
  });
});

describe('buildRecord', () => {
  const base = {
    headSha: '2bdeb1b',
    sinceSha: 'e7026b3',
    appVersion: '1.0.0',
    deployedAt: '2026-08-13T22:41:07Z',
    source: 'stamped',
  };

  it('splits user-facing changes from an internal count', () => {
    const record = buildRecord({
      ...base,
      commits: [
        {
          sha: 'f681ca2',
          subject: 'feat: address and pin editing in Edit Sale',
        },
        { sha: '2bdeb1b', subject: 'docs: CLAUDE.md corrections' },
        {
          sha: '458ba9e',
          subject: 'fix: count listing views only on successful load',
        },
        { sha: 'b4c73a8', subject: 'test: official AsyncStorage mock' },
      ],
    });

    expect(record.changes).toEqual([
      {
        type: 'feature',
        text: 'Address and pin editing in Edit Sale',
        sha: 'f681ca2',
      },
      {
        type: 'fix',
        text: 'Count listing views only on successful load',
        sha: '458ba9e',
      },
    ]);
    expect(record.otherCount).toBe(2);
  });

  it('preserves the newest-first order git log hands it', () => {
    const record = buildRecord({
      ...base,
      commits: [
        { sha: 'aaa', subject: 'fix: newest' },
        { sha: 'bbb', subject: 'feat: middle' },
        { sha: 'ccc', subject: 'fix: oldest' },
      ],
    });

    expect(record.changes.map((c) => c.sha)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('yields no changes but a real count when the range is all internal', () => {
    const record = buildRecord({
      ...base,
      commits: [
        { sha: 'aaa', subject: 'docs: spec' },
        { sha: 'bbb', subject: 'chore: lint' },
      ],
    });

    expect(record.changes).toEqual([]);
    expect(record.otherCount).toBe(2);
  });

  it('carries the deploy metadata through untouched', () => {
    const record = buildRecord({ ...base, commits: [] });

    expect(record).toMatchObject({
      deployedAt: '2026-08-13T22:41:07Z',
      channel: 'production',
      appVersion: '1.0.0',
      headSha: '2bdeb1b',
      sinceSha: 'e7026b3',
      source: 'stamped',
    });
  });

  it('accepts a null sinceSha for the oldest record', () => {
    expect(
      buildRecord({ ...base, sinceSha: null, commits: [] }).sinceSha,
    ).toBeNull();
  });
});

describe('splitMessage', () => {
  it('returns a single change for a plain conventional message', () => {
    expect(
      splitMessage('fix: my listings/sales refresh counts on focus'),
    ).toEqual([
      { type: 'fix', text: 'My listings/sales refresh counts on focus' },
    ]);
  });

  it('splits a semicolon-separated message into one change per item', () => {
    expect(splitMessage('feat: delete listing; guest views now count')).toEqual(
      [
        { type: 'feature', text: 'Delete listing' },
        { type: 'feature', text: 'Guest views now count' },
      ],
    );
  });

  it('lets a later item override the inherited type with its own prefix', () => {
    const items = splitMessage(
      'Map: small dot pins; fix item search; Following list',
    );
    expect(items.map((i) => i.type)).toEqual(['feature', 'fix', 'feature']);
    expect(items.map((i) => i.text)).toEqual([
      'Map: small dot pins',
      'Item search',
      'Following list',
    ]);
  });

  it('splits a comma list when the message opens with a plural fixes: prefix', () => {
    expect(
      splitMessage(
        'fixes: live-status accuracy, map US-center flash, tab-root headers',
      ),
    ).toEqual([
      { type: 'fix', text: 'Live-status accuracy' },
      { type: 'fix', text: 'Map US-center flash' },
      { type: 'fix', text: 'Tab-root headers' },
    ]);
  });

  it('does not split a comma that is part of one description', () => {
    expect(
      splitMessage('feat: pins with zoom thinning, live and saved states'),
    ).toHaveLength(1);
  });

  it('treats an unprefixed message as a feature', () => {
    expect(splitMessage('Enable Sentry crash reporting (DSN)')).toEqual([
      { type: 'feature', text: 'Enable Sentry crash reporting (DSN)' },
    ]);
  });

  it('returns nothing for a message that never interpolated', () => {
    expect(splitMessage('$(git log -1 --pretty=%s)')).toEqual([]);
  });

  it('returns nothing for an empty message', () => {
    expect(splitMessage('   ')).toEqual([]);
  });
});

describe('plural', () => {
  it('leaves a count of one singular', () => {
    expect(plural(1, 'feature')).toBe('1 feature');
  });

  it('adds s to a regular word', () => {
    expect(plural(2, 'feature')).toBe('2 features');
  });

  it('adds es to a word ending in x', () => {
    expect(plural(0, 'fix')).toBe('0 fixes');
    expect(plural(54, 'fix')).toBe('54 fixes');
  });

  it('adds es to a word ending in s', () => {
    expect(plural(3, 'class')).toBe('3 classes');
  });

  it('keeps a count of one singular even for an -x word', () => {
    expect(plural(1, 'fix')).toBe('1 fix');
  });
});
