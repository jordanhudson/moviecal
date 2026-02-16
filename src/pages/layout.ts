export const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23555'/%3E%3Cpath d='M8 12Q8 40 12 44L12 12Z' fill='%23ccc'/%3E%3Cpath d='M56 12Q56 40 52 44L52 12Z' fill='%23ccc'/%3E%3Crect x='14' y='14' width='36' height='22' rx='1' fill='%23fff'/%3E%3Ccircle cx='19' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='15' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3Ccircle cx='32' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='28' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3Ccircle cx='45' cy='42' r='4' fill='%23ddd'/%3E%3Crect x='41' y='46' width='8' height='8' rx='2' fill='%23ddd'/%3E%3C/svg%3E`;

const BASE_STYLES = `
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

    .no-screenings {
      color: #606060;
      font-style: italic;
    }

    @media (max-width: 800px) {
      body {
        padding: 12px;
      }
    }`;

export function footer(): string {
  return `<footer style="text-align: center; padding: 24px 16px; color: #555; font-size: 12px;">
    A better cinema clock for Vancouver &middot; Made by <a href="https://github.com/jordanhudson" target="_blank" style="color: #6a9a9a;">Jordan Hudson</a>
  </footer>`;
}

export interface PageOptions {
  title: string;
  styles?: string;
  body: string;
}

export function renderPage({ title, styles, body }: PageOptions): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="${FAVICON}">
  <title>${title}</title>
  <style>${BASE_STYLES}
    ${styles || ''}
  </style>
</head>
<body>
  ${body}
  ${footer()}
</body>
</html>
  `;
}
