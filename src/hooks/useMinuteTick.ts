import { useEffect, useState } from 'react';

/**
 * Re-render once a minute, for UI derived from the wall clock -- a sale going
 * green at 8:00, or dropping off the map at close -- that has to change
 * without waiting for an unrelated render or a refetch. Returns the tick so it
 * can serve as a memo dependency.
 *
 * ONE shared timer for the whole app, not one per caller: SaleCard uses this
 * so a memoized card still relabels at close, and a list of 45 cards must not
 * mean 45 intervals. The timer is aligned to the wall-clock minute, so a sale
 * that closes at 2:00 drops at 2:01:00 rather than anywhere in the next 60
 * seconds, and every subscriber flips in the same frame.
 */
let tick = 0;
const listeners = new Set<(n: number) => void>();
let timeout: ReturnType<typeof setTimeout> | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

function emit() {
  tick += 1;
  listeners.forEach((l) => l(tick));
}

function start() {
  if (timeout || interval) return;
  const msToNextMinute = 60_000 - (Date.now() % 60_000);
  timeout = setTimeout(() => {
    timeout = null;
    emit();
    interval = setInterval(emit, 60_000);
  }, msToNextMinute);
}

function stopIfIdle() {
  if (listeners.size > 0) return;
  if (timeout) clearTimeout(timeout);
  if (interval) clearInterval(interval);
  timeout = null;
  interval = null;
}

export function useMinuteTick(): number {
  const [value, setValue] = useState(tick);
  useEffect(() => {
    listeners.add(setValue);
    start();
    return () => {
      listeners.delete(setValue);
      stopIfIdle();
    };
  }, []);
  return value;
}
