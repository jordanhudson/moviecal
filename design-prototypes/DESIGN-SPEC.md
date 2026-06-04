# MovieClock — New UI Design Spec (“Neon Night / Glass”)

Ground-up redesign. Reuses **only** the existing data models and capabilities;
the entire visual system, layout, and page structure are new. Reference
prototype: `neon.html`.

---

## 0. Goals & principles

- **Same jobs, same route map — better interaction.** Everything in the app is *upcoming screenings sliced three ways* — by date, by movie, by theatre. Keep the existing routes (`/`, `/movies`, `/movie/:id`, `/theatre/:name`, `/internal-movies`); the consolidation is in *interaction*, not route count — a cleaner By-Date/By-Movie nav, a sticky date rail, and explicit theatre filter chips (replacing the hidden-footer hide/unhide).
- **Mobile-first.** The browsing surface must be excellent on a phone (this is a "what's on tonight?" app people check on the go). Bottom tab nav on mobile.
- **Posters are content.** TMDB art carries the visual weight; the chrome stays dark and recessive so art pops.
- **Token-driven.** Every color/size is a CSS custom property so the other prototypes (Cinematic, Daylight) can ship later as alternate themes.

---

## 1. Design tokens

All tokens live on `:root` (and override under `[data-theme="..."]` for future themes).

### Color

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#0a0a14` | Page canvas |
| `--bg-glow` | 3 fixed radial gradients (violet @ top-left, cyan @ top-right, pink @ bottom) | Ambient depth; `background-attachment:scroll` on mobile |
| `--ink` | `#eef0ff` | Primary text |
| `--muted` | `#9a9ec2` | Secondary text / meta |
| `--faint` | `#646891` | Tertiary / placeholder / labels |
| `--glass` | `rgba(255,255,255,.045)` | Card / control fill |
| `--glass2` | `rgba(255,255,255,.07)` | Raised fill (time chips, hovered) |
| `--line` | `rgba(255,255,255,.09)` | Hairline borders |
| `--violet` | `#8b5cf6` | Primary accent |
| `--cyan` | `#22d3ee` | Secondary accent / "live/now" |
| `--pink` | `#f472b6` | Notes / restorations / special badges |
| `--grad` | `linear-gradient(100deg,#8b5cf6,#22d3ee)` | Active states, logo wordmark, primary buttons |

Accessibility: body text (`--ink` on `--bg`) ≈ 15:1. `--muted` on `--bg` ≈ 6:1 (OK for ≥14px). Never put `--faint` on glass for essential text. Gradient buttons use near-black `#0a0a14` text (high contrast on the light gradient).

### Type
- **Display** — `Space Grotesk` (600/700): page H1, section H2, movie titles, time chips.
- **Body/UI** — `Inter` (400/500/600): meta, labels, nav, body copy.
- Scale (px): 11 label · 12.5 meta · 14.5 body · 16 film title · 20 section · `clamp(34,5.5vw,56)` page H1.
- Numerics: `font-variant-numeric: tabular-nums` on times so columns align.

### Geometry & motion
- Radius: `999px` pills (chips, search, pivot, day cells) · `20px` glass cards · `12–14px` posters · `11px` time chips · `9px` mini-posters.
- Spacing base unit 4px; section rhythm 26px; card padding 14–18px.
- Elevation = **glow, not shadow**: active day cell `0 8px 24px -6px rgba(139,92,246,.6)`; hovered time chip `0 0 14px -2px rgba(139,92,246,.5)`.
- Blur: top bar `blur(18px) saturate(140%)`, cards `blur(10px)`. **Cap/remove blur < 720px where it stacks** (perf).
- Motion: 120–180ms ease on hover transform/opacity/border; respect `prefers-reduced-motion`.

---

## 2. App shell

### Top bar (sticky, translucent)
`[ MovieClock wordmark ]  · · ·  [ nav: By Date | By Movie ]  · · ·  [ search ]`
- Wordmark: "Movie" in `--ink`, "Clock" in `--grad` clipped text.
- **Primary nav** = two destinations, matching prod today: **By Date** (`/`) and **By Movie** (`/movies`). Pill segmented control; active segment filled with `--grad`.
- **Search**: pill input, typeahead over movies-with-upcoming-screenings (existing `/api/`-free client list works the same). Focus → violet ring.

### View toggle (By Date page only, desktop only)
On the By Date page, a **Timeline | Listing** toggle picks how the day's screenings render. **Desktop only** — on mobile the toggle is hidden and the page always shows Listing (unchanged from prod). Choice persists in `localStorage`; default is **Timeline** on desktop.

### Date rail (sticky under top bar)
Horizontally scrollable day cells (`Tue 3`, `Wed 4`, …). Active day = `--grad` fill + glow. Replaces the prev/next arrows + date-picker; arrows kept as optional affordances at the rail ends, and a calendar icon opens a native date input for far-future jumps. Honors the existing **10pm → tomorrow** default selection.

### Theatre filter (chips)
Row of cinema chips below the rail. On = subtle violet ring; off = dimmed. **This replaces hide/unhide** — same `localStorage` persistence, but now an explicit always-visible filter instead of a hidden footer. Cineplex venues appear as one chip each (auditoriums collapsed), matching current `CINEPLEX_VENUES` grouping.

### Mobile (< 720px)
- Primary nav (By Date / By Movie) detaches to a **fixed bottom tab bar** (frosted, full-width).
- The Timeline/Listing toggle is **hidden**; By Date always renders Listing.
- Search goes full-width in the top bar; wordmark stays.
- Date rail + chips unchanged (already scroll).

---

## 3. Pages

### `/` — By Date (the home day-view)
A single day's screenings, with the date rail + theatre chips applied. Renders one of two ways via the desktop view toggle (mobile = always Listing):

**Timeline view** (desktop default) *(not in prototype — spec here)*
The existing desktop signature view, restyled. Theatre rows; horizontal axis = time (10am→2am, matching current `TIMELINE_START_HOUR`/`END_HOUR`); each screening is a glass block positioned by start time, width ∝ runtime (same `calculatePosition` math). Block shows title + start time; hover lifts with violet glow and reveals book + info icons. Time-axis labels along the top as faint ticks. **Desktop only** — never rendered on mobile.

**Listing view** (mobile always; desktop optional) *(the prototype's "By Theatre")*
Per-theatre `glasscard`; each row = `mini-poster | title + meta (+ note badge) | right-aligned time chips`. Theatre header links to the theatre page. Mobile: time chips reflow under the title. Cineplex auditoriums collapse into one card per venue (existing grouping).

**Empty state:** centered glass panel, "No screenings on Tue 3 — try another day," with the date rail still present.

### `/movies` — By Movie
Poster-grid of movie cards (`auto-fill, minmax(180px)`), each: poster, title, year/runtime, then a compact "venue · times" summary. **Sort** control (Date Added / Name / Popularity) carries over from current `/movies`. Theatre chips hide cards with no surviving showtimes. *(The prototype's "By Movie" tab.)*

### `/movie/:id` — Movie detail (kept, redesigned)
- **Hero:** large poster left (glass frame, soft glow), right column = title (Space Grotesk), meta row (year · runtime · director), and **external link buttons** (TMDB, Letterboxd) as outline-glass pills.
- **Screenings:** chronological glass list grouped by date; each row = theatre · time · note badge · **Book** (primary `--grad` button). *(Add-to-calendar pinned for future — see §8.)*
- Honors hidden/filtered theatres (same localStorage contract as today, incl. the "N hidden — show" toggle).
- **Admin TMDB fix-match modal** preserved exactly — same 10-clicks-on-poster trigger, `ADMIN_TOKEN`-gated. Restyled to the glass system.

### `/theatre/:name` — Theatre detail (kept, mostly SEO)
Functionally `/` pre-filtered to one theatre, but a distinct URL for deep-links/sitemap. Header = theatre name + location; body = chronological screening list (date · movie · time · note · book). Same JSON-LD `MovieTheater` schema.

### `/internal-movies` — left as-is
Admin-only list; barely used. **Not redesigned, not folded in** — stays exactly as it is in prod.

---

## 4. Component inventory

| Component | Notes |
|-----------|-------|
| **TopBar** | wordmark, By Date/By Movie nav, search; → fixed bottom nav on mobile |
| **ViewToggle** | Timeline ǀ Listing, By Date page, desktop only |
| **DateRail** | scrollable day cells; active = grad+glow; calendar-jump |
| **FilterChips** | theatre on/off, localStorage-backed (replaces hide/unhide) |
| **GlassCard** | frosted container; rounded 20px; the workhorse surface |
| **ScreeningRow** | mini-poster + title/meta + time chips (By Theatre) |
| **TimeChip** | tabular-nums pill; links to booking; hover glow |
| **MovieCard** | poster + title + meta + venue/time summary (By Movie) |
| **TimelineBlock** | absolutely-positioned glass block, width ∝ runtime |
| **NoteBadge** | pink outline pill ("4K Restoration", "Advance Screening") |
| **PosterFrame** | glass-framed TMDB image w/ gradient placeholder fallback |
| **LinkPill** | outline-glass external link (TMDB / Letterboxd) |
| **PrimaryButton** | `--grad` fill, dark text (Book Tickets) |
| **SearchTypeahead** | dropdown of matching movie titles |
| **TmdbModal** | existing admin fix-match, reskinned |
| **EmptyState** | centered glass panel |

---

## 5. Use-case → UI map (nothing lost)

| Current capability | Lands in new UI |
|--------------------|-----------------|
| "What's on tonight / a date?" | `/` By Date + DateRail (10pm flip preserved) |
| Timeline visualization | By Date → **Timeline** view (desktop only) |
| Theatre listing visualization | By Date → **Listing** view (mobile always; desktop optional) |
| Browse by movie + sort | `/movies` By Movie + Sort control |
| Hide/ignore theatres | **FilterChips** (same localStorage, now explicit) |
| Cineplex auditorium collapse | One chip + one card per venue (existing grouping) |
| When/where to see a movie | `/movie/:id` screenings list |
| What's at a theatre | `/theatre/:name` |
| Search a film | TopBar typeahead |
| Book tickets | TimeChip / PrimaryButton → `booking_url` |
| TMDB / Letterboxd links | LinkPills on movie page; info icon on timeline blocks |
| Screening notes | NoteBadge |
| Admin fix-match | TmdbModal (10-click trigger, `ADMIN_TOKEN`) — unchanged |
| Admin movie list (`/internal-movies`) | Left as-is, not redesigned |
| SEO: sitemap, robots, JSON-LD, OG | Unchanged server-side; pages keep `Movie`/`ScreeningEvent`/`MovieTheater` schema |

---

## 6. Theming architecture (for the future switcher)

- Ship **Neon** as `:root` defaults.
- `cinematic.html` → `[data-theme="cinematic"]` token block; `swiss.html` → `[data-theme="daylight"]`.
- A theme toggle sets `data-theme` on `<html>` + persists to `localStorage`; SSR reads a cookie to avoid flash.
- Fonts load per theme (Neon: Space Grotesk/Inter; Cinematic: Fraunces/Inter; Daylight: Inter).
- Keep the token **names** identical across themes so components never branch on theme.

---

## 7. Decisions (resolved 2026-06)
1. **Timeline on mobile — not built.** Matches prod: desktop offers Timeline ǀ Listing; mobile always shows Listing. No mobile timeline, no vertical-rail variant.
2. **Default view:** By Date page, Timeline on desktop / Listing on mobile. (No three-way "pivot"; the only mode switch besides nav is the desktop Timeline ǀ Listing toggle.)
3. **`/internal-movies`:** left exactly as-is, not redesigned, not folded in.

## 8. Pinned for future (not in this build)
- **Add screening to calendar** (`.ics` and/or Google deep link, from `datetime` + `runtime`).
- **User-selectable theme switcher** — Neon (default) + Cinematic + Daylight, via `[data-theme]` token blocks (see README).
