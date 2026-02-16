import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';
import { parseMonthName, parse12HourTime } from '../utils/time.js';

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
      await new Promise(resolve => setTimeout(resolve, 500));

      const eventUrl = `https://www.hollywoodtheatre.ca${card.eventUrl}`;
      const eventResponse = await fetch(eventUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
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
  const results: MovieCard[] = [];
  const seenUrls = new Set<string>();

  // Find all event links with their surrounding context
  // Pattern: <a href="/events/...">...</a> followed by ticket link
  const eventLinkRegex = /<a[^>]*href="(\/events\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = eventLinkRegex.exec(html)) !== null) {
    const eventUrl = match[1];
    const linkContent = match[2];

    if (seenUrls.has(eventUrl)) continue;

    // Extract title from the link content
    // Look for text that's not just a date (month abbreviation + day)
    const textContent = linkContent.replace(/<[^>]*>/g, ' ').trim();
    const lines = textContent.split(/\s+/).filter(s => s.length > 0);

    let title = '';
    for (let i = 0; i < lines.length; i++) {
      const word = lines[i];
      // Skip month abbreviations and day numbers
      if (word.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i)) continue;
      if (word.match(/^\d{1,2}$/)) continue;

      // Collect remaining words as title
      title = lines.slice(i).join(' ');
      break;
    }

    if (!title || title.length < 3) continue;

    // Convert ALL CAPS to Title Case
    if (title === title.toUpperCase()) {
      title = title.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }

    // Find ticket URL near this event link
    // Look for showpass.com or opendate.io links in the surrounding HTML
    const eventPosition = match.index;
    const surroundingHtml = html.substring(eventPosition, eventPosition + 2000);
    const ticketMatch = surroundingHtml.match(/href="(https:\/\/(?:www\.)?(?:showpass\.com|app\.opendate\.io)[^"]+)"/i);
    const ticketUrl = ticketMatch ? ticketMatch[1] : '';

    seenUrls.add(eventUrl);
    results.push({
      title,
      eventUrl,
      ticketUrl,
    });
  }

  return results;
}

// Parse an event page HTML to extract datetime
function parseEventPage(html: string): { datetime: Date } | null {
  // Remove HTML tags for easier text parsing
  const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Look for pattern: "Monday, February 2, 2026" ... "Doors 6pm" ... "Show 7pm"
  // The date and times might be separated by other content

  // First, find the full date
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
    // Fall back to doors time
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
