import { footer } from './layout.js';

// Theatre detail page

export interface TheatreScreening {
  id: number;
  datetime: Date;
  booking_url: string;
  movie_id: number;
  movie_title: string;
}

export function renderTheatrePage(theatreName: string, screenings: TheatreScreening[]): string {
  // Get current time in Pacific (screening times are stored as naive Pacific timestamps)
  const pacificNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const futureScreenings = screenings.filter(s => new Date(s.datetime) >= pacificNow);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23555'/%3E%3Cpath d='M8 12Q8 40 12 44L12 12Z' fill='%23ccc'/%3E%3Cpath d='M56 12Q56 40 52 44L52 12Z' fill='%23ccc'/%3E%3Crect x='14' y='14' width='36' height='22' rx='1' fill='%23fff'/%3E%3Ccircle cx='19' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='15' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3Ccircle cx='32' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='28' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3Ccircle cx='45' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='41' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3C/svg%3E">
  <title>${theatreName} - MovieCal</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      background: #1e1e1e;
      color: #c5c5c5;
    }

    .back-link {
      display: inline-block;
      margin-bottom: 20px;
      color: #6a9a9a;
      text-decoration: none;
    }

    .back-link:hover {
      text-decoration: underline;
    }

    .theatre-container {
      background: #262626;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      max-width: 900px;
      margin: 0 auto;
    }

    .theatre-title {
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 30px;
      padding-bottom: 15px;
      border-bottom: 1px solid #353535;
    }

    .screening-list {
      list-style: none;
    }

    .screening-item {
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #353535;
    }

    .screening-item:last-child {
      border-bottom: none;
    }

    .screening-date {
      width: 220px;
      font-weight: 500;
    }

    .screening-movie {
      flex: 1;
    }

    .screening-movie a {
      color: #6a9a9a;
      text-decoration: none;
    }

    .screening-movie a:hover {
      text-decoration: underline;
    }

    .screening-book {
      padding: 6px 12px;
      background: #4a7c7c;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
    }

    .screening-book:hover {
      background: #3d6868;
    }

    .no-screenings {
      color: #606060;
      font-style: italic;
    }

    /* Mobile: hide full button text, show short text */
    .screening-book .short-text {
      display: none;
    }

    @media (max-width: 800px) {
      body {
        padding: 12px;
      }

      .theatre-container {
        padding: 16px;
      }

      .screening-date {
        width: auto;
        min-width: 100px;
        text-align: left;
        line-height: 1.3;
        margin-right: 15px;
      }

      .screening-date .date-part {
        display: block;
      }

      .screening-date .time-part {
        display: block;
        font-weight: normal;
        font-size: 0.9em;
      }

      .screening-date .at-separator {
        display: none;
      }

      .screening-movie {
        margin-right: 5px;
      }

      .screening-book .full-text {
        display: none;
      }

      .screening-book .short-text {
        display: inline;
      }
    }
  </style>
</head>
<body>
  <a href="/" class="back-link">← Back to Calendar</a>

  <div class="theatre-container">
    <h1 class="theatre-title">${theatreName}</h1>

    ${futureScreenings.length === 0
      ? '<p class="no-screenings">No upcoming screenings</p>'
      : `<ul class="screening-list">
          ${futureScreenings.map(screening => {
            const screeningDate = new Date(screening.datetime);
            const dateStr = screeningDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });
            const timeStr = screeningDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });

            return `
              <li class="screening-item">
                <div class="screening-date"><span class="date-part">${dateStr}</span><span class="at-separator"> at </span><span class="time-part">${timeStr}</span></div>
                <div class="screening-movie"><a href="/movie/${screening.movie_id}">${screening.movie_title}</a></div>
                <a href="${screening.booking_url}" target="_blank" class="screening-book"><span class="full-text">Book Tickets</span><span class="short-text">Tix</span></a>
              </li>
            `;
          }).join('')}
        </ul>`
    }
  </div>
  ${footer()}
</body>
</html>
  `;
}
