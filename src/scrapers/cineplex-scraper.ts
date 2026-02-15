import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';

/**
 * Parse a local Pacific time string into a "naive" Date object.
 * The Cineplex API returns times like "2026-02-15T12:30:00" which are Pacific time.
 * We create a Date using UTC with the same components, so it stores/displays correctly.
 */
function parsePacificNaive(dateTimeStr: string): Date {
  // Parse "2026-02-15T12:30:00" format
  const match = dateTimeStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) {
    console.warn(`Could not parse datetime: ${dateTimeStr}`);
    return new Date(dateTimeStr);
  }

  const [, year, month, day, hour, minute, second] = match.map(Number);

  // Create Date using UTC with Pacific time components
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

// Cineplex API configuration
const API_BASE = 'https://apis.cineplex.com/prod/cpx/theatrical/api/v1';
const API_KEY = '477f072109904a55927ba2c3bf9f77e3';

// Theatre configuration - just Fifth Avenue for now
const THEATRES = [
  { id: 1149, name: 'Fifth Ave' },
];

// Number of days to fetch showtimes for
const DAYS_TO_FETCH = 7;

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

interface CineplexTheatreResponse {
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
      'Accept': 'application/json',
      'ocp-apim-subscription-key': API_KEY,
    },
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

export async function scrapeCineplex(): Promise<Screening[]> {
  const screenings: Screening[] = [];

  try {
    for (const theatre of THEATRES) {
      // Fetch showtimes for each day
      for (let dayOffset = 0; dayOffset < DAYS_TO_FETCH; dayOffset++) {
        const date = new Date();
        date.setDate(date.getDate() + dayOffset);

        try {
          const theatreResponses = await fetchShowtimes(theatre.id, date);

          for (const theatreResponse of theatreResponses) {
            for (const dateData of theatreResponse.dates) {
              for (const movie of dateData.movies) {
                for (const experience of movie.experiences) {
                  for (const session of experience.sessions) {
                    // Build theatre name with auditorium
                    const theatreName = `${theatre.name} ${session.auditorium}`;

                    // Parse showStartDateTime as Pacific-naive timestamp
                    // The API returns local Pacific time without timezone info
                    const datetime = parsePacificNaive(session.showStartDateTime);

                    const movieModel: Movie = {
                      id: null,
                      title: cleanMovieTitle(movie.name),
                      year: null,
                      director: null,
                      runtime: movie.runtimeInMinutes,
                    };

                    const screening: Screening = {
                      id: null,
                      datetime,
                      theatreName,
                      bookingUrl: session.deeplinkUrl,
                      movie: movieModel,
                    };

                    screenings.push(screening);
                  }
                }
              }
            }
          }

          // Small delay between requests to be polite
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          console.warn(`Failed to fetch showtimes for ${theatre.name} on ${date.toDateString()}:`, error);
          // Continue with other dates
        }
      }
    }

    return screenings;

  } catch (error) {
    console.error('Error scraping Cineplex:', error);
    throw error;
  }
}
