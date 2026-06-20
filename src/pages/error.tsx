/** @jsxImportSource hono/jsx */
import { renderPage } from './layout.js';

export function renderErrorPage(
  status: number,
  heading: string,
  message: string
): string {
  return renderPage({
    title: `${heading} — MovieClock`,
    body: (
      <div style="max-width: 560px; margin: 0 auto; padding: 96px 24px; text-align: center;">
        <div style="font-family: 'Space Grotesk', sans-serif; font-size: 72px; font-weight: 700; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; line-height: 1;">
          {status}
        </div>
        <h1 style="font-family: 'Space Grotesk', sans-serif; font-size: 24px; margin: 16px 0 8px;">{heading}</h1>
        <p style="color: var(--muted); margin: 0 0 28px;">{message}</p>
        <a
          href="/"
          style="display: inline-block; padding: 10px 22px; border-radius: var(--radius-chip); background: var(--glass2); border: 1px solid var(--line); color: var(--ink); text-decoration: none;"
        >
          Back to today's showtimes
        </a>
      </div>
    ),
  });
}
