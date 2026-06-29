import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';
import { pacificWallClock } from '../utils/time.js';

// Cineplex API configuration
const API_BASE = 'https://apis.cineplex.com/prod/cpx/theatrical/api/v1';
const API_KEY = '477f072109904a55927ba2c3bf9f77e3';

// Theatre configuration
const THEATRES = [
  { id: 1147, name: 'Intl Village' },
  { id: 1149, name: 'Fifth Ave' },
  { id: 1422, name: 'Scotiabank' },
  { id: 1405, name: 'Langley' },
];

// Number of days to fetch showtimes for
const DAYS_TO_FETCH = 12;

// Cineplex API response types
interface CineplexSession {
  showStartDateTime: string; // Local Pacific time, e.g. "2026-02-15T12:30:00"
  showStartDateTimeUtc: string;
  ticketingUrl: string;
  deeplinkUrl: string;
  auditorium: string; // e.g. "Aud #1"
  seatsRemaining: number;
  isSoldOut: boolean;
}

interface CineplexExperience {
  experienceTypes: string[]; // e.g. ["Regular"], ["IMAX"], ["VIP"]
  sessions: CineplexSession[];
}

interface CineplexMovie {
  id: number;
  name: string;
  filmUrl: string;
  runtimeInMinutes: number;
  localRating: string;
  experiences: CineplexExperience[];
}

interface CineplexDate {
  startDate: string;
  movies: CineplexMovie[];
}

export interface CineplexTheatreResponse {
  theatre: string;
  theatreId: number;
  dates: CineplexDate[];
}

async function fetchShowtimes(theatreId: number, date: Date): Promise<CineplexTheatreResponse[]> {
  // Format date as M/D/YYYY (Cineplex API format)
  const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

  const url = `${API_BASE}/showtimes?language=en&locationId=${theatreId}&date=${dateStr}`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'ocp-apim-subscription-key': API_KEY,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Cineplex API request failed: ${response.status} ${response.statusText}`);
  }

  // Handle empty responses (no showtimes for this date)
  const text = await response.text();
  if (!text || text.trim() === '') {
    return [];
  }

  return JSON.parse(text);
}

// Pure parse step, separated from fetching so it can be tested against
// fixtures. `venueName` is the short venue prefix (e.g. "Fifth Ave") that gets
// combined with the session's auditorium into the theatre name.
export function parseCineplexResponses(
  theatreResponses: CineplexTheatreResponse[],
  venueName: string,
): Screening[] {
  const screenings: Screening[] = [];

  for (const theatreResponse of theatreResponses) {
    for (const dateData of theatreResponse.dates) {
      for (const movie of dateData.movies) {
        for (const experience of movie.experiences) {
          for (const session of experience.sessions) {
            // Build theatre name with auditorium
            const theatreName = `${venueName} ${session.auditorium}`;

            // The API gives the UTC instant directly — use it as-is.
            const datetime = new Date(session.showStartDateTimeUtc);

            const { title, note } = cleanMovieTitle(movie.name);

            const movieModel: Movie = {
              id: null,
              title,
              year: null,
              director: null,
              runtime: movie.runtimeInMinutes,
            };

            screenings.push({
              id: null,
              datetime,
              theatreName,
              bookingUrl: session.deeplinkUrl,
              note,
              movie: movieModel,
            });
          }
        }
      }
    }
  }

  return screenings;
}

// Deduplicate: the API can return the same showtime in responses for adjacent
// days (the `dates` array spans multiple days), so fetching day-by-day
// produces duplicates at the overlap.
export function dedupeScreenings(screenings: Screening[]): Screening[] {
  const seen = new Set<string>();
  return screenings.filter((s) => {
    const key = `${s.theatreName}\t${s.movie.title}\t${s.datetime.getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function scrapeCineplex(): Promise<Screening[]> {
  const screenings: Screening[] = [];

  try {
    for (const theatre of THEATRES) {
      // Fetch showtimes for each day, starting from today's Pacific date.
      const nowPacific = pacificWallClock(new Date());
      for (let dayOffset = 0; dayOffset < DAYS_TO_FETCH; dayOffset++) {
        const date = new Date(nowPacific);
        date.setDate(date.getDate() + dayOffset);

        try {
          const theatreResponses = await fetchShowtimes(theatre.id, date);
          screenings.push(...parseCineplexResponses(theatreResponses, theatre.name));

          // Small delay between requests to be polite
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.warn(
            `Failed to fetch showtimes for ${theatre.name} on ${date.toDateString()}:`,
            error,
          );
          // Continue with other dates
        }
      }
    }

    return dedupeScreenings(screenings);
  } catch (error) {
    console.error('Error scraping Cineplex:', error);
    throw error;
  }
}
