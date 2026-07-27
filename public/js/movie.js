// Secret entrypoint: 10 clicks on the poster opens the TMDB fix-match modal.
// Movie id/title come from data-* attributes on the poster element.
(function () {
  var posterEl = document.querySelector('.movie-poster');
  if (!posterEl) return;
  var movieId = parseInt(posterEl.dataset.movieId, 10);
  var movieTitle = posterEl.dataset.movieTitle || '';
  var clickCount = 0;
  var clickTimer = null;
  posterEl.addEventListener('click', function () {
    clickCount++;
    clearTimeout(clickTimer);
    if (clickCount >= 10) {
      clickCount = 0;
      TmdbModal.open(movieId, movieTitle);
    } else {
      clickTimer = setTimeout(function () {
        clickCount = 0;
      }, 3000);
    }
  });
})();

// Collapse screenings at venues the visitor has filtered out, with a toggle on
// the Screenings heading. Matching is VenueFilter's job (see venue-filter.js).
(function () {
  var section = document.querySelector('.screenings-section');
  var heading = section && section.querySelector('h2');
  if (!section || !heading) return;

  var items = section.querySelectorAll('.screening-item[data-theatre]');
  if (!items.length) return;

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'hidden-toggle';
  toggle.hidden = true;
  heading.appendChild(toggle);

  var empty = document.createElement('p');
  empty.className = 'no-screenings';
  empty.hidden = true;
  section.appendChild(empty);

  // Always collapsed by default — the filter is respected even when that empties
  // the list. (It used to stay expanded, merely dimmed, when *every* screening
  // was hidden, to avoid a blank page; that read as the filter being ignored.)
  // The explanatory message below plus the toggle cover the empty case.
  var showing = false;

  function apply() {
    var hiddenCount = 0;
    items.forEach(function (el) {
      var hide = VenueFilter.isHidden(el.dataset.theatre);
      el.classList.toggle('hidden-by-theatre', hide);
      if (hide) hiddenCount++;
    });

    section.querySelectorAll('.day-group').forEach(function (group) {
      var all = group.querySelectorAll('.screening-item');
      var off = group.querySelectorAll('.screening-item.hidden-by-theatre');
      group.classList.toggle('all-hidden', all.length > 0 && all.length === off.length);
    });

    var allHidden = hiddenCount === items.length;

    toggle.hidden = hiddenCount === 0;
    section.classList.toggle('show-hidden', hiddenCount > 0 && showing);
    empty.hidden = !(allHidden && !showing);
    empty.textContent =
      hiddenCount === 1
        ? 'The only upcoming screening is at a venue you have hidden.'
        : 'All ' + hiddenCount + ' upcoming screenings are at venues you have hidden.';
    toggle.textContent = showing
      ? 'Showing ' + hiddenCount + ' at hidden venues — collapse'
      : hiddenCount + ' hidden — show';
  }

  toggle.addEventListener('click', function () {
    showing = !showing;
    apply();
  });

  VenueFilter.subscribe(apply);
  apply();
})();
