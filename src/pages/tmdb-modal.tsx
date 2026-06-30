/** @jsxImportSource hono/jsx */
import { assetUrl } from '../utils/assets.js';

export function TmdbModal() {
  return (
    <>
      <div class="tmdb-modal-overlay" id="tmdbModal">
        <div class="tmdb-modal">
          <h3>Fix TMDB Match</h3>
          <div class="tmdb-token-row">
            <span id="tmdbTokenStatus" class="tmdb-token-status"></span>
            <button type="button" id="tmdbSetToken">
              Set admin token
            </button>
          </div>
          <div style="border-top: 1px solid #353535; margin-bottom: 12px;"></div>
          <div class="tmdb-id-label">Fix TMDB Match - Search:</div>
          <div class="tmdb-search-row">
            <input type="text" id="tmdbSearchInput" />
            <button id="tmdbSearchBtn">Search</button>
          </div>
          <div class="tmdb-results" id="tmdbResults"></div>
          <div class="tmdb-id-section">
            <div class="tmdb-id-label">Or enter TMDB ID directly:</div>
            <div class="tmdb-search-row">
              <input type="number" id="tmdbIdInput" placeholder="e.g. 550" />
              <button id="tmdbIdBtn">Apply</button>
            </div>
          </div>
          <div class="tmdb-id-label" style="margin-top: 12px;">
            Applying a match also refreshes the Letterboxd link from the new TMDB id.
          </div>
          <button class="tmdb-modal-close" id="tmdbModalClose">
            Cancel
          </button>
        </div>
      </div>
      <script src={assetUrl('/js/modal.js')} />
    </>
  );
}
