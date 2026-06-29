import puppeteer from 'puppeteer';
import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';
import { parseMonthName, parse12HourTime, pacificWallClockToInstant } from '../utils/time.js';

// Park-specific internal models (not exported)
interface ParkScreening {
  title: string;
  datetime: string; // e.g., "Wed, Mar 18, 6:30 pm" or "6:20pm - Thursday, Jan 8, 2026"
  url: string;
}

export async function scrapePark(): Promise<Screening[]> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://tickets.theparktheatre.ca/', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait a bit for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Extract all screenings from the page
    const parkScreenings = await page.evaluate(() => {
      const results: ParkScreening[] = [];

      // Find all event/movie listings
      const eventElements = document.querySelectorAll('div.single-event');

      eventElements.forEach((element) => {
        // Find title - it's in a p tag with class "event-headline"
        const titleElement = element.querySelector('p.event-headline');
        const title = titleElement ? titleElement.textContent?.trim() : '';

        // Find datetime - it's in a p tag with class "event-date"
        const dateElement = element.querySelector('p.event-date');
        const datetime = dateElement ? dateElement.textContent?.trim() : '';

        // Find booking URL - it's in a div with class "event-buttons-wrapper" containing an <a> tag
        const buttonWrapper = element.querySelector('div.event-buttons-wrapper');
        const buttonLink = buttonWrapper ? buttonWrapper.querySelector('a') : null;
        let url = '';

        if (buttonLink) {
          const href = buttonLink.getAttribute('href') || '';
          // Build full URL if it's relative
          if (href.startsWith('/')) {
            url = 'https://tickets.theparktheatre.ca' + href;
          } else if (href.startsWith('http')) {
            url = href;
          } else {
            url = 'https://tickets.theparktheatre.ca/' + href;
          }
        }

        if (title && url && datetime) {
          results.push({
            title: title,
            datetime: datetime,
            url: url,
          });
        }
      });

      return results;
    });

    // Convert to global Screening models
    const screenings: Screening[] = [];

    for (const parkScreening of parkScreenings) {
      const { title, note } = cleanMovieTitle(parkScreening.title);

      const movie: Movie = {
        id: null,
        title,
        year: null,
        director: null,
        runtime: null,
      };

      const screening: Screening = {
        id: null,
        datetime: parseDateTime(parkScreening.datetime),
        theatreName: 'The Park',
        bookingUrl: parkScreening.url,
        note,
        movie: movie,
      };

      screenings.push(screening);
    }

    return screenings;
  } finally {
    await browser.close();
  }
}

// Helper function to parse Park Theatre datetime strings into a Date object
function parseDateTime(datetimeStr: string): Date {
  // Old format: "6:20pm - Thursday, Jan 8, 2026"
  const oldMatch = datetimeStr.match(
    /(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*-\s*\w+,?\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/i,
  );

  // New format: "Wed, Mar 18, 6:30 pm"
  const newMatch = datetimeStr.match(
    /\w+,\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i,
  );

  if (oldMatch) {
    const timeStr = oldMatch[1];
    const monthName = oldMatch[2];
    const day = parseInt(oldMatch[3], 10);
    const year = parseInt(oldMatch[4], 10);

    const time = parse12HourTime(timeStr);
    const monthIndex = parseMonthName(monthName);
    if (monthIndex === -1) return new Date();

    return pacificWallClockToInstant(
      year,
      monthIndex + 1,
      day,
      time ? time.hour : 19,
      time ? time.minute : 0,
    );
  }

  if (newMatch) {
    const monthName = newMatch[1];
    const day = parseInt(newMatch[2], 10);
    const timeStr = newMatch[3];

    const time = parse12HourTime(timeStr);
    const monthIndex = parseMonthName(monthName);
    if (monthIndex === -1) {
      console.warn(`Could not parse month: ${monthName}`);
      return new Date();
    }

    // No year in new format — infer from current date
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, monthIndex, day);
    // If the date is more than 2 months in the past, assume next year
    if (candidate.getTime() < now.getTime() - 60 * 24 * 60 * 60 * 1000) {
      year++;
    }

    return pacificWallClockToInstant(
      year,
      monthIndex + 1,
      day,
      time ? time.hour : 19,
      time ? time.minute : 0,
    );
  }

  console.warn(`Could not parse datetime: ${datetimeStr}`);
  return new Date();
}
