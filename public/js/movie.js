// Parse a <script type="application/json"> data island by id; [] if absent.
function readJsonIsland(id) {
  var el = document.getElementById(id);
  if (!el) return null;
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    return null;
  }
}

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

// Hide screenings at theatres the visitor has filtered out (localStorage:
// hiddenTheatres), with a "N hidden — show" toggle on the Screenings heading.
(function () {
  try {
    var hidden = JSON.parse(localStorage.getItem('hiddenTheatres') || '[]');
    if (!hidden.length) return;
    var cineplex = readJsonIsland('cineplexVenues') || [];
    var items = document.querySelectorAll('.screening-item[data-theatre]');
    var hiddenCount = 0;
    items.forEach(function (el) {
      var t = el.dataset.theatre;
      var match = hidden.indexOf(t) !== -1;
      if (!match) {
        for (var i = 0; i < cineplex.length; i++) {
          if (t.indexOf(cineplex[i].prefix) === 0 && hidden.indexOf(cineplex[i].display) !== -1) {
            match = true;
            break;
          }
        }
      }
      if (match) {
        el.classList.add('hidden-by-theatre');
        hiddenCount++;
      }
    });
    if (hiddenCount === 0) return;

    document.querySelectorAll('.day-group').forEach(function (group) {
      var groupItems = group.querySelectorAll('.screening-item');
      var groupHidden = group.querySelectorAll('.screening-item.hidden-by-theatre');
      if (groupItems.length && groupItems.length === groupHidden.length) {
        group.classList.add('all-hidden');
      }
    });

    var section = document.querySelector('.screenings-section');
    var heading = document.querySelector('.screenings-section h2');
    if (!heading) return;

    var toggle = document.createElement('span');
    toggle.className = 'hidden-toggle';
    var allHidden = hiddenCount === items.length;

    function render(showing) {
      var label = hiddenCount + ' hidden';
      toggle.textContent = showing ? label + ' — hide again' : label + ' — show';
    }

    var showing = allHidden;
    if (section && allHidden) section.classList.add('show-hidden');
    render(showing);

    toggle.addEventListener('click', function () {
      showing = !showing;
      if (section) section.classList.toggle('show-hidden', showing);
      render(showing);
    });

    heading.appendChild(toggle);
  } catch (e) {}
})();
