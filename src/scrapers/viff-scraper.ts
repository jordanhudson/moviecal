import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';
import { pacificWallClockToInstant } from '../utils/time.js';

// The API gives local times with no offset (e.g. "2026-06-13T13:00:00"), which
// are Pacific wall-clock — resolve them to the real instant.
function viffLocalToInstant(iso: string): Date {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(iso);
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return pacificWallClockToInstant(y, mo, d, h, mi, s || 0);
}

// VIFF API response types
export interface VIFFApiEvent {
  start: string; // ISO 8601 datetime
  end: string;
  resourceId: string; // Venue ID like "viff-centre-viff-cinema"
  title: string; // HTML containing film title and booking link
  moreInfo: string;
  eventType: string; // e.g., "Film"
}

// Venue ID to human-readable name mapping
const VENUE_NAMES: Record<string, string> = {
  'viff-centre-viff-cinema': 'VIFF Cinema',
  'viff-centre-lochmaddy-studio-theatre': 'VIFF Lochmaddy Studio',
  'roundhouse-community-arts-recreation-centre': 'Roundhouse Community Arts & Recreation Centre',
};

// Format venue ID to human-readable name (e.g., "viff-centre-cinema" -> "Viff Centre Cinema")
function formatVenueName(venueId: string): string {
  return venueId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Pure parse step, separated from fetching so it can be tested against fixtures.
export function parseVIFFEvents(events: VIFFApiEvent[]): Screening[] {
  const screenings: Screening[] = [];

  for (const event of events) {
    // Extract film title from HTML (in h3.c-calendar-instance__title)
    const titleMatch = event.title.match(
      /<h3 class="c-calendar-instance__title">\s*(.+?)\s*<\/h3>/s,
    );
    if (!titleMatch) {
      console.warn(`Could not extract title from event: ${event.title.substring(0, 100)}`);
      continue;
    }

    const filmTitle = titleMatch[1].trim();

    // Extract booking URL from HTML (look for <a> tag with class containing "c-btn--ghost")
    const bookingUrlMatch = event.title.match(
      /<a[^>]+class="[^"]*c-btn--ghost[^"]*"[^>]+href="([^"]+)"/,
    );
    if (!bookingUrlMatch) {
      // Skip events without booking URLs (might be past events or special cases)
      continue;
    }

    const bookingUrl = bookingUrlMatch[1];

    // Calculate runtime from start/end times
    const startTime = viffLocalToInstant(event.start);
    const endTime = viffLocalToInstant(event.end);
    const runtimeMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

    // Map venue ID to human-readable name, or format it nicely
    const venueName = VENUE_NAMES[event.resourceId] || formatVenueName(event.resourceId);

    const { title, note } = cleanMovieTitle(filmTitle);

    const movie: Movie = {
      id: null,
      title,
      year: null,
      director: null,
      runtime: runtimeMinutes,
    };

    const screening: Screening = {
      id: null,
      datetime: startTime,
      theatreName: venueName,
      bookingUrl,
      note,
      movie,
    };

    screenings.push(screening);
  }

  return screenings;
}

export async function scrapeVIFF(): Promise<Screening[]> {
  try {
    // Fetch calendar events from VIFF API
    const response = await fetch('https://viff.org/wp-json/v1/attendable/calendar/instances', {
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const events: VIFFApiEvent[] = await response.json();
    return parseVIFFEvents(events);
  } catch (error) {
    console.error('Error scraping VIFF:', error);
    throw error;
  }
}
