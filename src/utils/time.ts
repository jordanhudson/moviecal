// Shared time/date utilities

const PACIFIC_TZ = 'America/Vancouver';

// Formatter that yields the Pacific wall-clock components of an instant.
// Uses the IANA zone (not a hardcoded offset) so DST and any future rule change
// are handled by the platform's tz database.
const PACIFIC_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Pacific wall-clock components of an instant (hour normalized 0–23). */
function pacificParts(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = PACIFIC_PARTS.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  // Intl can render midnight as "24"; normalize to 0.
  const hour = get('hour') % 24;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Pacific UTC offset (ms) in effect at the given instant — negative west of UTC. */
function pacificOffsetMs(instant: Date): number {
  const p = pacificParts(instant);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - instant.getTime();
}

/**
 * Convert Pacific wall-clock components to the real instant they denote.
 * Scrapers that learn a screening's local Pacific time use this to produce the
 * absolute `Date` stored in the `timestamptz` column. `month` is 1-based.
 */
export function pacificWallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  const wallAsUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  // Two passes so a wall time near a DST transition lands on the right offset.
  let offset = pacificOffsetMs(new Date(wallAsUTC));
  offset = pacificOffsetMs(new Date(wallAsUTC - offset));
  return new Date(wallAsUTC - offset);
}

/**
 * Project an instant into a "naive" Date whose LOCAL components equal its
 * Pacific wall-clock time. Display code (getHours/getDate, toLocale* without a
 * timeZone) can then read off Pacific time regardless of the server's timezone.
 */
export function pacificWallClock(instant: Date): Date {
  const p = pacificParts(instant);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/**
 * Get today's date in Pacific time as a YYYY-MM-DD string.
 */
export function pacificToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: PACIFIC_TZ });
}

/**
 * Get the current hour (0-23) in Pacific time.
 */
export function pacificHour(): number {
  return parseInt(
    new Date().toLocaleTimeString('en-GB', { timeZone: PACIFIC_TZ, hour12: false }).split(':')[0],
  );
}

const MONTHS_LONG = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/**
 * Parse a month name (full or abbreviated, case-insensitive) to a 0-based index.
 * Returns -1 if not recognized.
 */
export function parseMonthName(name: string): number {
  const lower = name.toLowerCase();
  const index = MONTHS_LONG.findIndex((m) => m.startsWith(lower.substring(0, 3)));
  return index;
}

/**
 * Parse a 12-hour time string like "7pm", "6:30 PM", "12:00am" into { hour24, minute }.
 * Returns null if the string can't be parsed.
 */
export function parse12HourTime(timeStr: string): { hour: number; minute: number } | null {
  const match = timeStr
    .toLowerCase()
    .trim()
    .match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const isPM = match[3] === 'pm';

  if (isPM && hour !== 12) {
    hour += 12;
  } else if (!isPM && hour === 12) {
    hour = 0;
  }

  return { hour, minute };
}
