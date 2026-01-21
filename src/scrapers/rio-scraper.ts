import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';

/**
 * Convert a UTC date to a "naive" date that represents Pacific time.
 * This is needed because the Rio API returns correct UTC times (with +00:00),
 * but the rest of the system expects naive timestamps that represent Pacific time
 * (since other scrapers return times without timezone info).
 *
 * Example: "2025-12-20T05:30:00+00:00" (UTC) = "2025-12-19T21:30:00" (Pacific)
 * We return a Date object representing Dec 19, 21:30 as if it were UTC,
 * so when stored/displayed on a UTC server, it shows "9:30 PM".
 */
function utcToPacificNaive(utcDate: Date): Date {
  // Format the UTC date in Pacific timezone to get the "local" time components
  const pacificStr = utcDate.toLocaleString('en-US', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Parse "MM/DD/YYYY, HH:MM:SS" format
  const match = pacificStr.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
  if (!match) {
    console.warn(`Could not parse Pacific time: ${pacificStr}`);
    return utcDate;
  }

  const [, month, day, year, hour, minute, second] = match.map(Number);

  // Create a new Date using these components as if they were UTC
  // This gives us a "naive" timestamp that represents Pacific time
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

// Rio Theatre API response types
interface RioApiEvent {
  id: number;
  event: {
    id: number;
    title: string;
    link: string;
  };
  start_time: string; // ISO 8601 format
  end_time: string;
  tickets_link: string;
  premiere: boolean;
}

export async function scrapeRio(): Promise<Screening[]> {
  try {
    // Calculate date range: 1 month back to 2 months forward
    const now = new Date();
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - 1);
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 2);

    // Build API URL with date range
    const apiUrl = new URL('https://riotheatre.ca/wp-json/barker/v1/listings');
    apiUrl.searchParams.set('_embed', 'true');
    apiUrl.searchParams.set('status', 'publish');
    apiUrl.searchParams.set('page', '1');
    apiUrl.searchParams.set('per_page', '500');
    apiUrl.searchParams.set('start_date', startDate.toISOString());
    apiUrl.searchParams.set('end_date', endDate.toISOString());

    // Fetch events from API
    const response = await fetch(apiUrl.toString());
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const events: RioApiEvent[] = await response.json();

    // Convert to global Screening models
    const screenings: Screening[] = events.map(event => {
      const movie: Movie = {
        id: null,
        title: cleanMovieTitle(event.event.title),
        year: null,
        director: null,
        runtime: null,
      };

      // Prefer tickets_link, fall back to event.link
      const bookingUrl = event.tickets_link || event.event.link;

      // Convert UTC time to Pacific-naive format to match other scrapers
      const utcDate = new Date(event.start_time);
      const pacificNaive = utcToPacificNaive(utcDate);

      return {
        id: null,
        datetime: pacificNaive,
        theatreName: 'The Rio',
        bookingUrl,
        movie,
      };
    });

    return screenings;

  } catch (error) {
    console.error('Error scraping Rio Theatre:', error);
    throw error;
  }
}
