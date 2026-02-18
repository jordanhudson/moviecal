import * as cheerio from 'cheerio';
import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';
import { parseMonthName, parse12HourTime } from '../utils/time.js';

const CRAWL_DELAY_MS = 500;

interface MovieCard {
  title: string;
  eventUrl: string;
  ticketUrl: string;
}

export async function scrapeHollywood(): Promise<Screening[]> {
  // Fetch the movies page
  const moviesResponse = await fetch('https://www.hollywoodtheatre.ca/movies', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!moviesResponse.ok) {
    throw new Error(`Failed to fetch movies page: ${moviesResponse.status}`);
  }

  const moviesHtml = await moviesResponse.text();

  // Extract movie cards from the HTML
  const movieCards = parseMoviesPage(moviesHtml);

  // Fetch each event page to get the full datetime
  const screenings: Screening[] = [];

  for (const card of movieCards) {
    try {
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, CRAWL_DELAY_MS));

      const eventUrl = `https://www.hollywoodtheatre.ca${card.eventUrl}`;
      const eventResponse = await fetch(eventUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!eventResponse.ok) {
        console.warn(`Failed to fetch event page ${eventUrl}: ${eventResponse.status}`);
        continue;
      }

      const eventHtml = await eventResponse.text();
      const eventDetails = parseEventPage(eventHtml);

      if (!eventDetails) {
        console.warn(`Could not extract datetime from ${eventUrl}`);
        continue;
      }

      const movie: Movie = {
        id: null,
        title: cleanMovieTitle(card.title),
        year: null,
        director: null,
        runtime: null,
      };

      const screening: Screening = {
        id: null,
        datetime: eventDetails.datetime,
        theatreName: 'Hollywood Theatre',
        bookingUrl: card.ticketUrl || eventUrl,
        movie: movie,
      };

      screenings.push(screening);
    } catch (error) {
      console.warn(`Failed to scrape event page ${card.eventUrl}:`, (error as Error).message);
      continue;
    }
  }

  return screenings;
}

// Parse the /movies page HTML to extract movie cards
function parseMoviesPage(html: string): MovieCard[] {
  const $ = cheerio.load(html);
  const results: MovieCard[] = [];
  const seenUrls = new Set<string>();

  $('a[href^="/events/"]').each((_, el) => {
    const $link = $(el);
    const eventUrl = $link.attr('href')!;

    if (seenUrls.has(eventUrl)) return;

    // Extract title from the dedicated name element within the link
    let title = $link.find('[fs-cmsfilter-field="name"]').text().trim();

    if (!title || title.length < 3) return;

    // Convert ALL CAPS to Title Case
    if (title === title.toUpperCase()) {
      title = title.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    // Find ticket URL: look for a sibling or nearby link to showpass.com or opendate.io
    // Walk up to the parent container, then search within it
    const $parent = $link.parent();
    let ticketUrl = '';
    const $ticketLink = $parent.find('a[href*="showpass.com"], a[href*="opendate.io"]');
    if ($ticketLink.length) {
      ticketUrl = $ticketLink.first().attr('href') || '';
    } else {
      // Try the next siblings at the parent level
      const $nextTicket = $parent.nextAll().find('a[href*="showpass.com"], a[href*="opendate.io"]').first();
      if ($nextTicket.length) {
        ticketUrl = $nextTicket.attr('href') || '';
      }
    }

    seenUrls.add(eventUrl);
    results.push({ title, eventUrl, ticketUrl });
  });

  return results;
}

// Parse an event page HTML to extract datetime
function parseEventPage(html: string): { datetime: Date } | null {
  const $ = cheerio.load(html);
  const textContent = $('body').text().replace(/\s+/g, ' ');

  // Find the full date (e.g., "Monday, February 2, 2026")
  const dateMatch = textContent.match(/(\w+day),?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (!dateMatch) {
    return null;
  }

  const monthName = dateMatch[2];
  const day = parseInt(dateMatch[3], 10);
  const year = parseInt(dateMatch[4], 10);

  // Find show time (prefer "Show Xpm" over "Doors Xpm")
  let showTime = '7pm'; // default

  const showMatch = textContent.match(/Show\s+(\d{1,2}(?::\d{2})?\s*[ap]m)/i);
  if (showMatch) {
    showTime = showMatch[1];
  } else {
    const doorsMatch = textContent.match(/Doors\s+(\d{1,2}(?::\d{2})?\s*[ap]m)/i);
    if (doorsMatch) {
      showTime = doorsMatch[1];
    }
  }

  const datetime = parseDateTime(monthName, day, year, showTime);
  return { datetime };
}

// Helper function to parse datetime components into a Date object
function parseDateTime(monthName: string, day: number, year: number, timeStr: string): Date {
  const time = parse12HourTime(timeStr);
  const hour = time ? time.hour : 19; // Default to 7pm
  const minute = time ? time.minute : 0;

  const monthIndex = parseMonthName(monthName);
  if (monthIndex === -1) {
    console.warn(`Could not parse month: ${monthName}, defaulting to January`);
    return new Date(year, 0, day, hour, minute);
  }

  return new Date(year, monthIndex, day, hour, minute);
}
