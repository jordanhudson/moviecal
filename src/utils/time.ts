// Shared time/date utilities

const PACIFIC_TZ = 'America/Vancouver';

/**
 * Get current date/time as a naive Date representing Pacific time.
 * Useful when the server runs in UTC but times are stored as Pacific-naive.
 */
export function pacificNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: PACIFIC_TZ }));
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
    new Date().toLocaleTimeString('en-GB', { timeZone: PACIFIC_TZ, hour12: false }).split(':')[0]
  );
}

const MONTHS_LONG = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Parse a month name (full or abbreviated, case-insensitive) to a 0-based index.
 * Returns -1 if not recognized.
 */
export function parseMonthName(name: string): number {
  const lower = name.toLowerCase();
  const index = MONTHS_LONG.findIndex(m => m.startsWith(lower.substring(0, 3)));
  return index;
}

/**
 * Parse a 12-hour time string like "7pm", "6:30 PM", "12:00am" into { hour24, minute }.
 * Returns null if the string can't be parsed.
 */
export function parse12HourTime(timeStr: string): { hour: number; minute: number } | null {
  const match = timeStr.toLowerCase().trim().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
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
