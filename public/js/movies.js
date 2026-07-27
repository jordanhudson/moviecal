// Apply the visitor's venue filter, cascading: showtime → date row → venue card
// → film. A venue card pools a location's auditoriums, so hiding a single screen
// removes just its showtimes and the card only goes once nothing is left. A note
// above the list says how many films that removed and can bring them back.
(function () {
  var note = document.getElementById('filterNote');
  var showing = false;

  function allHiddenNames(csv) {
    var names = (csv || '').split(',');
    for (var i = 0; i < names.length; i++) {
      if (names[i] && !VenueFilter.isHidden(names[i])) return false;
    }
    return true;
  }

  function apply() {
    var hiddenFilms = 0;
    document.querySelectorAll('.movie-card').forEach(function (card) {
      var venues = card.querySelectorAll('.theatre-card[data-theatres]');
      var hiddenVenues = 0;
      venues.forEach(function (venue) {
        var liveRows = 0;
        venue.querySelectorAll('.theatre-card-row').forEach(function (row) {
          var liveTimes = 0;
          row.querySelectorAll('.theatre-card-time').forEach(function (t) {
            // Fall back to the card's theatres if a time carries none.
            var off = allHiddenNames(t.dataset.theatres || venue.dataset.theatres);
            t.hidden = off && !showing;
            t.classList.toggle('filtered-out', off);
            if (!off) liveTimes++;
          });
          row.hidden = liveTimes === 0 && !showing;
          if (liveTimes > 0) liveRows++;
        });
        var off = liveRows === 0;
        venue.hidden = off && !showing;
        venue.classList.toggle('filtered-out', off);
        if (off) hiddenVenues++;
      });
      var off = venues.length > 0 && hiddenVenues === venues.length;
      card.hidden = off && !showing;
      card.classList.toggle('filtered-out', off);
      if (off) hiddenFilms++;
    });

    if (!note) return;
    note.hidden = hiddenFilms === 0;
    note.textContent = '';
    if (!hiddenFilms) return;
    note.appendChild(
      document.createTextNode(
        hiddenFilms + (hiddenFilms === 1 ? ' film is' : ' films are') + ' only at hidden venues. ',
      ),
    );
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-note-btn';
    btn.textContent = showing ? 'Hide again' : 'Show anyway';
    btn.addEventListener('click', function () {
      showing = !showing;
      apply();
    });
    note.appendChild(btn);
  }

  VenueFilter.subscribe(apply);
  apply();
})();

// Client-side sort menu (Date Added / Name / Popularity), persisted.
(function () {
  var btn = document.getElementById('sortBtn');
  var menu = document.getElementById('sortMenu');
  var list = document.getElementById('movieList');
  var savedSort = localStorage.getItem('movieSort') || 'date-added';

  function updateActive(sort) {
    menu.querySelectorAll('.sort-option').forEach(function (o) {
      o.classList.toggle('active', o.dataset.sort === sort);
    });
  }

  function sortCards(sort) {
    var cards = Array.from(list.querySelectorAll('.movie-card'));
    cards.sort(function (a, b) {
      if (sort === 'name') return a.dataset.title.localeCompare(b.dataset.title);
      if (sort === 'popularity') return Number(b.dataset.popularity) - Number(a.dataset.popularity);
      return Number(b.dataset.created) - Number(a.dataset.created);
    });
    cards.forEach(function (c) {
      list.appendChild(c);
    });
    localStorage.setItem('movieSort', sort);
    updateActive(sort);
  }

  sortCards(savedSort);

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  menu.querySelectorAll('.sort-option').forEach(function (opt) {
    opt.addEventListener('click', function () {
      sortCards(opt.dataset.sort);
      menu.classList.remove('open');
    });
  });

  document.addEventListener('click', function () {
    menu.classList.remove('open');
  });
})();
