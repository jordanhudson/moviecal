/** @jsxImportSource hono/jsx */
import { jsonForScript } from '../utils/html.js';
import { VENUE_FILTER_CONFIG } from '../venues.js';

// Venue-filter config for public/js/venue-filter.js. A data block
// (type="application/json"), so it's exempt from script-src.
//
// Any page that renders this must also load '/js/venue-filter.js' first in its
// `scripts` list — the page script then talks to `window.VenueFilter`.
export function VenueFilterData() {
  return (
    <script
      type="application/json"
      id="venueFilters"
      dangerouslySetInnerHTML={{ __html: jsonForScript(VENUE_FILTER_CONFIG) }}
    />
  );
}
