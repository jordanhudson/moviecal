import puppeteer from 'puppeteer';
import { Movie, Screening } from '../models.js';
import { cleanMovieTitle } from '../utils/title-cleaner.js';
import { parseMonthName, parse12HourTime } from '../utils/time.js';

// Cinematheque-specific internal models (not exported)
interface CinemathequeScreening {
  date: string;
  time: string;
  title: string;
  url: string;
}

export async function scrapeCinematheque(): Promise<Screening[]> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://thecinematheque.ca/films/calendar', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract all screenings from the calendar
    const cinemathequeScreenings = await page.evaluate(() => {
      const results: CinemathequeScreening[] = [];

      // Find the calendar
      const calendar = document.querySelector('#eventCalendar');

      if (!calendar) {
        return results;
      }

      // Iterate through each day (li elements)
      const dayElements = calendar.querySelectorAll(':scope > li');

      dayElements.forEach((dayElement) => {
        // Get the date from the span
        const dateSpan = dayElement.querySelector('span');
        const dateText = dateSpan ? dateSpan.textContent?.trim() : '';

        // Also try getting text directly from the li if no span
        const altDateText = !dateText ? dayElement.firstChild?.textContent?.trim() : '';
        const finalDateText = dateText || altDateText || '';

        if (!finalDateText) {
          return;
        }

        // Find the screenings list for this day
        const screeningsList = dayElement.querySelector('ol');
        if (!screeningsList) {
          return;
        }

        // Iterate through each screening
        const screeningElements = screeningsList.querySelectorAll('li');

        screeningElements.forEach((screeningEl, sIndex) => {
          // Get all links - first is usually time, rest might be title + "Tickets"
          const links = screeningEl.querySelectorAll('a');

          if (links.length < 2) {
            return;
          }

          // First link is the time - extract from span inside it
          const timeLink = links[0];
          const timeSpan = timeLink.querySelector('span');
          const time = timeSpan ? timeSpan.textContent?.trim() || '' : timeLink.textContent?.trim() || '';

          // Check if the span has "am" or "pm" class
          const isAM = timeSpan?.classList.contains('am');
          const isPM = timeSpan?.classList.contains('pm');
          const ampm = isPM ? 'pm' : (isAM ? 'am' : '');

          // Find the title link - it's usually the second link, but skip "Tickets" links
          let titleLink = null;
          let title = '';
          let url = '';

          for (let i = 1; i < links.length; i++) {
            const linkText = links[i].textContent?.trim() || '';
            if (linkText && linkText !== 'Tickets') {
              titleLink = links[i];
              title = linkText;
              url = links[i].href;
              break;
            }
          }

          if (title && time) {
            const timeWithAmPm = ampm ? `${time} ${ampm}` : time;
            results.push({
              date: finalDateText,
              time: timeWithAmPm,
              title: title,
              url: url,
            });
          }
        });
      });

      return results;
    });

    // Convert to global Screening models
    const screenings: Screening[] = [];

    for (const cineScreening of cinemathequeScreenings) {
      const movie: Movie = {
        id: null,
        title: cleanMovieTitle(cineScreening.title),
        year: null,
        director: null,
        runtime: null,
      };

      const screening: Screening = {
        id: null,
        datetime: parseDateTime(cineScreening.date, cineScreening.time),
        theatreName: 'The Cinematheque',
        bookingUrl: cineScreening.url,
        movie: movie,
      };

      screenings.push(screening);
    }

    return screenings;

  } finally {
    await browser.close();
  }
}

// Helper function to parse Cinematheque date and time strings into a Date object
function parseDateTime(dateStr: string, timeStr: string): Date {
  // dateStr format: "Sunday\n      04\n      January\n      2026" (with lots of whitespace)
  // timeStr format: "3:00 pm" or "12:30 am" (12-hour format with am/pm)

  // Clean up whitespace and extract parts
  const cleanDate = dateStr.replace(/\s+/g, ' ').trim();
  const parts = cleanDate.split(' ');

  // Parts should be: [DayOfWeek, Day, Month, Year] or [DayOfWeek, Day, Month]
  let day, monthName, year;

  if (parts.length >= 4) {
    day = parseInt(parts[1], 10);
    monthName = parts[2];
    year = parseInt(parts[3], 10);
  } else if (parts.length >= 3) {
    day = parseInt(parts[1], 10);
    monthName = parts[2];
    year = new Date().getFullYear();
  } else {
    // Fallback to current date if parsing fails
    return new Date();
  }

  const time = parse12HourTime(timeStr);
  const hour24 = time ? time.hour : 0;
  const mins = time ? time.minute : 0;

  const monthIndex = parseMonthName(monthName);
  if (monthIndex === -1) {
    return new Date();
  }

  return new Date(year, monthIndex, day, hour24, mins);
}
