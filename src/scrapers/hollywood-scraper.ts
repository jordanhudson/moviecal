import puppeteer from 'puppeteer';
import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';

// Hollywood-specific internal models (not exported)
interface HollywoodMovieCard {
  title: string;
  eventUrl: string;
  ticketUrl: string;
}

interface HollywoodEventDetails {
  datetime: Date;
  ticketUrl: string;
}

export async function scrapeHollywood(): Promise<Screening[]> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://www.hollywoodtheatre.ca/movies', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract all movie cards from the /movies page
    const movieCards = await page.evaluate(() => {
      // Helper to convert "IRON LUNG" to "Iron Lung"
      function toTitleCase(str: string): string {
        return str.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
      }

      const results: { title: string; eventUrl: string; ticketUrl: string }[] = [];

      // Find all links that go to /events/ pages
      const allLinks = document.querySelectorAll('a[href^="/events/"]');
      const seenUrls = new Set<string>();

      allLinks.forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (!href || seenUrls.has(href)) return;

        let title = '';

        // Try to find the title by looking at text content of children
        const textNodes = Array.from(link.querySelectorAll('div'));
        for (const node of textNodes) {
          const text = node.textContent?.trim() || '';
          // Skip short strings (like "Feb", "02") and look for longer title text
          if (text.length > 5 && !text.match(/^[A-Za-z]{3}$/)) {
            // Check if this is likely the title (not just a month/day combo)
            if (!text.match(/^[A-Za-z]{3}\s+\d{2}$/)) {
              title = text;
              break;
            }
          }
        }

        // If no title found in divs, try the link text itself
        if (!title) {
          const linkText = link.textContent?.trim() || '';
          // Remove date patterns and get the remaining text
          const withoutDate = linkText.replace(/[A-Za-z]{3}\s*\d{1,2}/g, '').trim();
          if (withoutDate.length > 2) {
            title = withoutDate;
          }
        }

        if (!title) return;

        // Find the sibling ticket link
        // The ticket button is usually a sibling <a> with href containing showpass or opendate
        const parent = link.parentElement;
        let ticketUrl = '';

        if (parent) {
          const ticketLink = parent.querySelector('a[href*="showpass.com"], a[href*="opendate.io"]');
          if (ticketLink) {
            ticketUrl = ticketLink.getAttribute('href') || '';
          }
        }

        seenUrls.add(href);
        results.push({
          title: title.toUpperCase() === title ? toTitleCase(title) : title,
          eventUrl: href,
          ticketUrl: ticketUrl,
        });
      });

      return results;
    });

    // Now visit each event page to get the full datetime
    const screenings: Screening[] = [];

    for (const card of movieCards) {
      const eventUrl = `https://www.hollywoodtheatre.ca${card.eventUrl}`;

      try {
        await page.goto(eventUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Extract the datetime from the event page
        const eventDetails = await page.evaluate(() => {
          // Look for text matching "DAY, MONTH DAY, YEAR | Doors Xpm, Show Xpm"
          // Example: "Monday, February 2, 2026 | Doors 6pm, Show 7pm"
          const bodyText = document.body.innerText;

          // Pattern for full date with doors/show times
          const dateTimeMatch = bodyText.match(
            /(\w+day),?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})\s*\|\s*Doors\s+(\d{1,2}(?::\d{2})?\s*[ap]m),?\s*Show\s+(\d{1,2}(?::\d{2})?\s*[ap]m)/i
          );

          if (dateTimeMatch) {
            return {
              dayOfWeek: dateTimeMatch[1],
              month: dateTimeMatch[2],
              day: parseInt(dateTimeMatch[3], 10),
              year: parseInt(dateTimeMatch[4], 10),
              doorsTime: dateTimeMatch[5],
              showTime: dateTimeMatch[6],
            };
          }

          // Fallback: try to find just the date
          const dateMatch = bodyText.match(
            /(\w+day),?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i
          );

          if (dateMatch) {
            return {
              dayOfWeek: dateMatch[1],
              month: dateMatch[2],
              day: parseInt(dateMatch[3], 10),
              year: parseInt(dateMatch[4], 10),
              doorsTime: null,
              showTime: null,
            };
          }

          return null;
        });

        if (!eventDetails) {
          console.warn(`Could not extract datetime from ${eventUrl}`);
          continue;
        }

        const datetime = parseDateTime(
          eventDetails.month,
          eventDetails.day,
          eventDetails.year,
          eventDetails.showTime || eventDetails.doorsTime || '7pm'
        );

        const movie: Movie = {
          id: null,
          title: cleanMovieTitle(card.title),
          year: null,
          director: null,
          runtime: null,
        };

        const screening: Screening = {
          id: null,
          datetime: datetime,
          theatreName: 'Hollywood Theatre',
          bookingUrl: card.ticketUrl || eventUrl,
          movie: movie,
        };

        screenings.push(screening);
      } catch (error) {
        console.warn(`Failed to scrape event page ${eventUrl}:`, error);
        continue;
      }
    }

    return screenings;

  } finally {
    await browser.close();
  }
}

// Helper function to parse Hollywood Theatre datetime components into a Date object
function parseDateTime(monthName: string, day: number, year: number, timeStr: string): Date {
  // Parse the time string (e.g., "7pm", "6:30pm")
  const timeMatch = timeStr.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);

  let hour = 19; // Default to 7pm
  let minute = 0;

  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const isPM = timeMatch[3] === 'pm';

    // Convert to 24-hour format
    if (isPM && hour !== 12) {
      hour += 12;
    } else if (!isPM && hour === 12) {
      hour = 0;
    }
  }

  // Convert month name to index
  const monthIndex = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december']
    .indexOf(monthName.toLowerCase());

  if (monthIndex === -1) {
    console.warn(`Could not parse month: ${monthName}, defaulting to January`);
    return new Date(year, 0, day, hour, minute);
  }

  return new Date(year, monthIndex, day, hour, minute);
}
