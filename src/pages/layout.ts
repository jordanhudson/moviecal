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
  <link rel="icon" type="image/png" href="/favicon.png">
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
