import { isOpenNow } from '../saleStatus';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('isOpenNow', () => {
  it('returns false for ended sales regardless of times', () => {
    expect(
      isOpenNow({
        status: 'ended',
        start_date: todayDate(),
        end_date: todayDate(),
        start_time: '00:00',
        end_time: '23:59',
      }),
    ).toBe(false);
  });

  it('returns false when today is outside the date range', () => {
    expect(
      isOpenNow({
        status: 'active',
        start_date: tomorrowDate(),
        end_date: tomorrowDate(),
        start_time: '00:00',
        end_time: '23:59',
      }),
    ).toBe(false);
  });

  it('returns true when in window today', () => {
    expect(
      isOpenNow({
        status: 'active',
        start_date: todayDate(),
        end_date: todayDate(),
        start_time: '00:00',
        end_time: '23:59',
      }),
    ).toBe(true);
  });

  it('tolerates HH:MM:SS time formats from Supabase', () => {
    expect(
      isOpenNow({
        status: 'active',
        start_date: todayDate(),
        end_date: todayDate(),
        start_time: '00:00:00',
        end_time: '23:59:59',
      }),
    ).toBe(true);
  });
});
