// Home page - Timeline view (desktop) and Agenda view (mobile)

export interface ScreeningWithMovie {
  screening_id: number;
  datetime: Date;
  theatre_name: string;
  booking_url: string;
  movie_id: number;
  movie_title: string;
  movie_year: number | null;
  movie_runtime: number | null;
  poster_url: string | null;
  tmdb_url: string | null;
}

export interface TheatreRow {
  theatre: string;
  screenings: ScreeningWithMovie[];
}

// Helper to format date for display
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Shorter date format for mobile
function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

// Helper to get prev/next day
function getPrevDay(date: Date): string {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 1);
  return prev.toISOString().split('T')[0];
}

function getNextDay(date: Date): string {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next.toISOString().split('T')[0];
}

// Calculate position and width for a screening (desktop timeline)
function calculatePosition(datetime: Date, runtime: number | null): { left: string; width: string } {
  const hours = datetime.getHours();
  const minutes = datetime.getMinutes();

  const startMinutes = 10 * 60;
  const endMinutes = 26 * 60; // 2am next day
  const totalMinutes = endMinutes - startMinutes;

  let screeningMinutes = hours * 60 + minutes;
  if (screeningMinutes < startMinutes) {
    screeningMinutes += 24 * 60; // treat post-midnight as next-day continuation
  }
  const minutesFromStart = screeningMinutes - startMinutes;
  const leftPercent = (minutesFromStart / totalMinutes) * 100;

  const movieRuntime = runtime || 105;
  const effectiveRuntime = Math.max(movieRuntime, 90);
  const widthPercent = (effectiveRuntime / totalMinutes) * 100;

  return {
    left: `${Math.max(0, leftPercent)}%`,
    width: `${widthPercent}%`
  };
}

export function renderIndexPage(date: Date, theatres: TheatreRow[]): string {
  const prevDay = getPrevDay(date);
  const nextDay = getNextDay(date);
  const displayDate = formatDate(date);
  const displayDateShort = formatDateShort(date);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // Check if there are any screenings at all
  const hasScreenings = theatres.some(t => t.screenings.length > 0);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23555'/%3E%3Cpath d='M8 12Q8 40 12 44L12 12Z' fill='%23ccc'/%3E%3Cpath d='M56 12Q56 40 52 44L52 12Z' fill='%23ccc'/%3E%3Crect x='14' y='14' width='36' height='22' rx='1' fill='%23fff'/%3E%3Ccircle cx='19' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='15' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3Ccircle cx='32' cy='40' r='5' fill='%23ddd'/%3E%3Crect x='27' y='45' width='10' height='9' rx='2' fill='%23ddd'/%3E%3Ccircle cx='45' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='41' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3C/svg%3E">
  <title>MovieCal - ${displayDate}</title>
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

    /* Header */
    .header {
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }

    .header h1 {
      font-size: 24px;
      font-weight: 600;
      min-width: 360px;
      text-align: center;
    }

    .header .date-short {
      display: none;
    }

    .nav-button {
      padding: 8px 16px;
      background: #2a2a2a;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      cursor: pointer;
      text-decoration: none;
      color: #b0b0b0;
    }

    .nav-button:hover {
      background: #333333;
    }

    /* Desktop Timeline Styles */
    .timeline-container {
      background: #262626;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }

    .time-labels {
      display: flex;
      margin-bottom: 10px;
      padding-left: 150px;
      position: relative;
    }

    .time-label {
      flex: 1;
      text-align: left;
      font-size: 12px;
      color: #707070;
    }

    .theatre-row {
      display: flex;
      align-items: center;
      min-height: 80px;
      border-bottom: 1px solid #353535;
      position: relative;
    }

    .theatre-row:last-child {
      border-bottom: none;
    }

    .theatre-label {
      width: 150px;
      font-weight: 600;
      padding-right: 20px;
      flex-shrink: 0;
    }

    .theatre-label a {
      color: #c5c5c5;
      text-decoration: none;
    }

    .theatre-label a:hover {
      color: #6a9a9a;
      text-decoration: underline;
    }

    .timeline {
      flex: 1;
      position: relative;
      height: 60px;
      background: linear-gradient(to right,
        transparent 0%,
        transparent calc(100% - 1px),
        #353535 calc(100% - 1px),
        #353535 100%
      );
      background-size: calc(100% / 16) 100%;
    }

    .screening {
      position: absolute;
      height: 50px;
      background: #4a7c7c;
      border-radius: 4px;
      padding: 6px;
      color: white;
      font-size: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }

    .screening:hover {
      background: #5a8c8c;
    }

    .screening-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1;
    }

    .screening-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
    }

    .screening-title {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: white;
    }

    .screening-time {
      font-size: 10px;
      opacity: 0.9;
      margin-top: 2px;
    }

    .screening-links {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex-shrink: 0;
      position: relative;
      z-index: 2;
    }

    .screening-link {
      width: 20px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      text-decoration: none;
      color: white;
      font-size: 14px;
      transition: background 0.2s;
      filter: grayscale(100%);
    }

    .screening-link:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .no-screenings {
      text-align: center;
      padding: 40px;
      color: #606060;
    }

    /* Mobile Agenda Styles */
    .agenda-container {
      display: none;
    }

    .agenda-theatre {
      background: #262626;
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }

    .agenda-theatre-name {
      font-weight: 600;
      font-size: 14px;
      padding: 12px 16px;
      background: #2a2a2a;
      color: #a0a0a0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .agenda-theatre-name a {
      color: #a0a0a0;
      text-decoration: none;
    }

    .agenda-theatre-name a:active {
      color: #6a9a9a;
    }

    .agenda-screening {
      display: flex;
      align-items: center;
      padding: 14px 16px;
      border-bottom: 1px solid #353535;
      position: relative;
    }

    .agenda-screening:last-child {
      border-bottom: none;
    }

    .agenda-screening:active {
      background: #303030;
    }

    .agenda-screening-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1;
    }

    .agenda-movie-time {
      color: #808080;
      font-size: 14px;
      min-width: 70px;
      margin-right: 12px;
    }

    .agenda-movie-title {
      flex: 1;
      font-weight: 500;
      color: #d0d0d0;
    }

    .agenda-tix {
      padding: 6px 12px;
      background: #4a7c7c;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      font-size: 13px;
      position: relative;
      z-index: 2;
      margin-left: 12px;
    }

    .agenda-tix:active {
      background: #3d6868;
    }

    .agenda-empty {
      padding: 16px;
      color: #505050;
      font-style: italic;
      text-align: center;
    }

    /* Mobile breakpoint */
    @media (max-width: 800px) {
      body {
        padding: 12px;
      }

      .header {
        gap: 12px;
        margin-bottom: 16px;
      }

      .header h1 {
        font-size: 18px;
        min-width: 150px;
        text-align: center;
      }

      .header .date-full {
        display: none;
      }

      .header .date-short {
        display: inline;
      }

      .nav-button {
        padding: 8px 12px;
        font-size: 14px;
      }

      .timeline-container {
        display: none;
      }

      .agenda-container {
        display: block;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <a href="/?date=${prevDay}" class="nav-button">←</a>
    <h1>
      <span class="date-full">${displayDate}</span>
      <span class="date-short">${displayDateShort}</span>
    </h1>
    <a href="/?date=${nextDay}" class="nav-button">→</a>
  </div>

  <!-- Desktop Timeline View -->
  <div class="timeline-container">
    <div class="time-labels">
      <div class="time-label">10am</div>
      <div class="time-label">11am</div>
      <div class="time-label">12pm</div>
      <div class="time-label">1pm</div>
      <div class="time-label">2pm</div>
      <div class="time-label">3pm</div>
      <div class="time-label">4pm</div>
      <div class="time-label">5pm</div>
      <div class="time-label">6pm</div>
      <div class="time-label">7pm</div>
      <div class="time-label">8pm</div>
      <div class="time-label">9pm</div>
      <div class="time-label">10pm</div>
      <div class="time-label">11pm</div>
      <div class="time-label">12am</div>
      <div class="time-label">1am</div>
    </div>

    ${!hasScreenings ? '<div class="no-screenings">No screenings for this day</div>' : ''}

    ${theatres.map(({ theatre, screenings }) => {
      return `
        <div class="theatre-row">
          <div class="theatre-label"><a href="/theatre/${encodeURIComponent(theatre)}">${theatre}</a></div>
          <div class="timeline">
            ${screenings.map(screening => {
              const { left, width } = calculatePosition(new Date(screening.datetime), screening.movie_runtime);
              const time = new Date(screening.datetime).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
              });

              return `
                <div class="screening" style="left: ${left}; width: ${width};">
                  <a href="/movie/${screening.movie_id}?from_date=${dateStr}" class="screening-overlay" title="${screening.movie_title}"></a>
                  <div class="screening-content">
                    <span class="screening-title">${screening.movie_title}</span>
                    <div class="screening-time">${time}</div>
                  </div>
                  <div class="screening-links">
                    <a href="${screening.booking_url}" target="_blank" class="screening-link" title="Book tickets">🎟️</a>
                    ${screening.tmdb_url ? `<a href="${screening.tmdb_url}" target="_blank" class="screening-link" title="View on TMDB">🔍</a>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('')}
  </div>

  <!-- Mobile Agenda View -->
  <div class="agenda-container">
    ${!hasScreenings ? '<div class="no-screenings">No screenings for this day</div>' : ''}

    ${theatres.filter(t => t.screenings.length > 0).map(({ theatre, screenings }) => {
      return `
        <div class="agenda-theatre">
          <div class="agenda-theatre-name"><a href="/theatre/${encodeURIComponent(theatre)}">${theatre}</a></div>
          ${screenings.map(screening => {
            const time = new Date(screening.datetime).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit'
            });

            return `
              <div class="agenda-screening">
                <a href="/movie/${screening.movie_id}?from_date=${dateStr}" class="agenda-screening-overlay"></a>
                <span class="agenda-movie-time">${time}</span>
                <span class="agenda-movie-title">${screening.movie_title}</span>
                <a href="${screening.booking_url}" target="_blank" class="agenda-tix">Tix</a>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }).join('')}
  </div>
</body>
</html>
  `;
}
