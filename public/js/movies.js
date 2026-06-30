// Hide movie cards whose every venue is in the localStorage hidden list.
(function () {
  try {
    var hidden = JSON.parse(localStorage.getItem('hiddenTheatres') || '[]');
    if (!hidden.length) return;
    document.querySelectorAll('.movie-card').forEach(function (card) {
      var theatres = (card.dataset.theatres || '').split(',');
      var allHidden = theatres.every(function (t) {
        return hidden.indexOf(t) !== -1;
      });
      if (allHidden) card.style.display = 'none';
    });
  } catch (e) {}
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
