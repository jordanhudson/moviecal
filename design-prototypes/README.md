# Design prototypes — NOT part of the active app

Static, self-contained HTML mockups of brand-new UI directions for MovieClock.
They are **reference / scratch only**: not imported, not built, not served by
`src/server.ts`, and safe to ignore in the build.

## Why these exist

We explored three full visual systems for a ground-up UI redesign. The chosen
direction is **C · Neon Night / Glass** (see `DESIGN-SPEC.md`). The other two are
kept deliberately: the long-term idea is a **user-selectable theme switcher**,
and each prototype is a candidate seed theme.

| File | Theme | Intended name |
|------|-------|---------------|
| `neon.html` | Deep indigo, frosted glass, violet→cyan glow | **Neon** (default / chosen) |
| `cinematic.html` | Near-black, poster-forward, serif, warm amber | **Cinematic** |
| `swiss.html` | Bright, gridded, tight sans, cobalt accent | **Daylight** |
| `index.html` | Launcher linking the three | — |

Each is one page (the home/browsing surface) and shares the same sample data so
they're compared on look alone. Posters are gradient placeholders; the real app
uses TMDB poster art.

## Theming note

All three are driven entirely by CSS custom properties on `:root`. That's
intentional: when we build the real UI, the token set becomes the contract, and
adding a theme = shipping another token block toggled via `[data-theme="..."]`.
These three files map directly onto those token blocks.

## Viewing

```bash
cd design-prototypes && python3 -m http.server 8910
# then open http://localhost:8910/index.html  (or your LAN IP for phone testing)
```

Breakpoint for mobile layout is 720px.
