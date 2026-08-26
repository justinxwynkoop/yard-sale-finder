import { saleScheduleTiles } from '../saleSchedule';

const HOURS = '8 AM–4 PM';

// A fixed "today" far from every test date so relative labels stay off
// unless a test opts in.
const FAR_AWAY = new Date(2026, 0, 1);

describe('saleScheduleTiles', () => {
  it('renders one tile per day for a two-day sale, date joined to weekday', () => {
    expect(saleScheduleTiles('2026-08-28', '2026-08-29', HOURS, FAR_AWAY)).toEqual([
      { label: 'Fri · Aug 28', value: HOURS },
      { label: 'Sat · Aug 29', value: HOURS },
    ]);
  });

  it('renders a single tile for a one-day sale', () => {
    expect(saleScheduleTiles('2026-08-28', '2026-08-28', HOURS, FAR_AWAY)).toEqual([
      { label: 'Fri · Aug 28', value: HOURS },
    ]);
  });

  it('renders three tiles for a three-day sale, middle day included', () => {
    expect(saleScheduleTiles('2026-08-28', '2026-08-30', HOURS, FAR_AWAY)).toEqual([
      { label: 'Fri · Aug 28', value: HOURS },
      { label: 'Sat · Aug 29', value: HOURS },
      { label: 'Sun · Aug 30', value: HOURS },
    ]);
  });

  it("labels the current day 'Today'", () => {
    const friday = new Date(2026, 7, 28, 13, 30);
    expect(saleScheduleTiles('2026-08-28', '2026-08-29', HOURS, friday)).toEqual([
      { label: 'Today · Aug 28', value: HOURS },
      { label: 'Sat · Aug 29', value: HOURS },
    ]);
  });

  it('collapses spans longer than three days into one range tile', () => {
    expect(saleScheduleTiles('2026-08-28', '2026-08-31', HOURS, FAR_AWAY)).toEqual([
      { label: 'Aug 28 – 31 · Daily', value: HOURS },
    ]);
  });

  it('spells out both months when a collapsed span crosses a month boundary', () => {
    expect(saleScheduleTiles('2026-08-30', '2026-09-02', HOURS, FAR_AWAY)).toEqual([
      { label: 'Aug 30 – Sep 2 · Daily', value: HOURS },
    ]);
  });

  it('falls back to a single start-day tile when end precedes start', () => {
    expect(saleScheduleTiles('2026-08-28', '2026-08-27', HOURS, FAR_AWAY)).toEqual([
      { label: 'Fri · Aug 28', value: HOURS },
    ]);
  });
});
