const DAY_MS = 86_400_000;
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Two adjacent seven-day periods, excluding the unfinished Argentina day.
 * Date-only keys are for daily ad rows; instants are for order timestamps.
 * Every upper bound is exclusive, preserving sub-millisecond timestamps.
 */
export function anomalyPeriods(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid anomaly date");
  const today = new Date(now.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
  const end = new Date(today + "T00:00:00.000-03:00");
  const start = new Date(end.getTime() - 7 * DAY_MS);
  const previousStart = new Date(start.getTime() - 7 * DAY_MS);
  const dateKey = (value: Date) => new Date(value.getTime() - AR_OFFSET_MS).toISOString().slice(0, 10);
  return { fromCurrent: start, toCurrent: end, fromPrev: previousStart, toPrev: start,
    currentDateFrom: dateKey(start), currentDateTo: today,
    previousDateFrom: dateKey(previousStart), previousDateTo: dateKey(start) };
}
