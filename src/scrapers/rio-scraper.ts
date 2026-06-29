import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';

// Rio Theatre API response types
export interface RioApiEvent {
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

// Pure parse step, separated from fetching so it can be tested against fixtures.
export function parseRioEvents(events: RioApiEvent[]): Screening[] {
  return events.map((event) => {
    const { title, note } = cleanMovieTitle(event.event.title);

    const movie: Movie = {
      id: null,
      title,
      year: null,
      director: null,
      runtime: null,
    };

    // Prefer tickets_link, fall back to event.link
    const bookingUrl = event.tickets_link || event.event.link;

    // The API gives an ISO time with an offset, so this is already the correct
    // absolute instant.
    return {
      id: null,
      datetime: new Date(event.start_time),
      theatreName: 'The Rio',
      bookingUrl,
      note,
      movie,
    };
  });
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
    const response = await fetch(apiUrl.toString(), {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const events: RioApiEvent[] = await response.json();
    return parseRioEvents(events);
  } catch (error) {
    console.error('Error scraping Rio Theatre:', error);
    throw error;
  }
}
