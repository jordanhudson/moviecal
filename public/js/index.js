(function () {
  // ---- view toggle (desktop only) ----
  var wrapper = document.getElementById('viewsWrapper');
  var savedView = localStorage.getItem('viewMode') || 'listing';
  wrapper.dataset.view = savedView;
  document.querySelectorAll('.view-toggle button').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.view === savedView);
    btn.addEventListener('click', function () {
      var view = btn.dataset.view;
      wrapper.dataset.view = view;
      localStorage.setItem('viewMode', view);
      document.querySelectorAll('.view-toggle button').forEach(function (b) {
        b.classList.toggle('active', b.dataset.view === view);
      });
    });
  });

  // ---- date rail (built client-side off real "today") ----
  (function () {
    var rail = document.getElementById('dateRail');
    if (!rail) return;
    var selected = rail.dataset.selected;
    function ymd(d) {
      return (
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0')
      );
    }
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var sel = new Date(selected + 'T00:00:00');
    var start = sel < today ? new Date(sel) : new Date(today);
    var end = new Date(today);
    end.setDate(end.getDate() + 13);
    if (sel > end) end = new Date(sel);
    var list = [];
    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      list.push(new Date(d));
    }
    rail.innerHTML = list
      .map(function (d) {
        var key = ymd(d);
        var on = key === selected ? ' on' : '';
        return (
          '<a class="day' +
          on +
          '" href="/date/' +
          key +
          '"><span class="dow">' +
          DOW[d.getDay()] +
          '</span><span class="num">' +
          d.getDate() +
          '</span></a>'
        );
      })
      .join('');
    var active = rail.querySelector('.day.on');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
  })();

  // ---- date picker jump ----
  var picker = document.getElementById('datePicker');
  if (picker) {
    picker.addEventListener('change', function () {
      window.location.href = '/date/' + this.value;
    });
  }

  // ---- theatre filter (shared state in venue-filter.js) ----
  // Two levels of hiding share one list: a whole venue (the chips, keyed by the
  // listing group's venue name) and a single auditorium (the timeline's row
  // `hide`, keyed by a raw theatre_name). A collapsed venue card pools several
  // auditoriums, so it filters per showtime and only disappears once nothing is
  // left — that is what makes hiding one screen visible in the listing too.
  var allHiddenNames = function (csv) {
    var names = (csv || '').split(',');
    for (var i = 0; i < names.length; i++) {
      if (names[i] && !VenueFilter.isHidden(names[i])) return false;
    }
    return true;
  };

  function applyFilter() {
    // Timeline rows: one auditorium each, so a plain check does it.
    document.querySelectorAll('.theatre-row[data-theatre]').forEach(function (row) {
      row.hidden = VenueFilter.isHidden(row.dataset.theatre);
    });

    // Listing cards: showtime → film row → card.
    var cards = document.querySelectorAll('.venue-card[data-theatre]');
    var hiddenCards = 0;
    cards.forEach(function (card) {
      var venueHidden = VenueFilter.isHidden(card.dataset.theatre);
      var liveRows = 0;
      card.querySelectorAll('.film-row').forEach(function (filmRow) {
        var times = filmRow.querySelectorAll('.show-time');
        var liveTimes = 0;
        times.forEach(function (t) {
          var off = venueHidden || allHiddenNames(t.dataset.theatres);
          t.hidden = off;
          if (!off) liveTimes++;
        });
        filmRow.hidden = liveTimes === 0;
        if (liveTimes > 0) liveRows++;
        // Keep the showtime grid balanced against what's actually left.
        var grid = filmRow.querySelector('.show-times');
        if (grid && liveTimes > 0) {
          var rows = Math.ceil(liveTimes / 3);
          grid.style.gridTemplateColumns = 'repeat(' + Math.ceil(liveTimes / rows) + ', auto)';
        }
      });
      card.hidden = liveRows === 0;
      if (card.hidden) hiddenCards++;
    });

    // A chip is "off" when its card has nothing left — whether the visitor hid
    // the venue outright or hid every one of its screens one at a time.
    document.querySelectorAll('.chip').forEach(function (c) {
      var card = document.querySelector('.venue-card[data-theatre="' + cssEscape(c.dataset.theatre) + '"]');
      var off = card ? card.hidden : VenueFilter.isHidden(c.dataset.theatre);
      c.classList.toggle('off', off);
      c.classList.toggle('on', !off);
    });

    // Everything filtered out reads as a broken page otherwise — say so.
    var note = document.getElementById('allHiddenNote');
    if (note) note.hidden = !(cards.length > 0 && hiddenCards === cards.length);

    renderOtherHidden();
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
  }

  document.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      // Toggle on what the chip shows, not on raw storage: an "off" chip must
      // restore the venue even when it got that way one auditorium at a time.
      if (c.classList.contains('off')) VenueFilter.unhide(c.dataset.theatre);
      else VenueFilter.hide(c.dataset.theatre);
    });
  });

  // ---- per-screen hide links on timeline rows ----
  document.querySelectorAll('.theatre-row .row-hide').forEach(function (btn) {
    btn.addEventListener('click', function () {
      VenueFilter.hide(btn.closest('[data-theatre]').dataset.theatre);
    });
  });

  // Strip listing anything hidden that has no chip on this date — a single
  // auditorium hidden from the timeline, or a venue with nothing on today.
  // Lives outside the timeline view so it's reachable from the listing too.
  function renderOtherHidden() {
    var box = document.getElementById('hiddenScreens');
    if (!box) return;
    var chips = [];
    document.querySelectorAll('.chip').forEach(function (c) {
      chips.push(c.dataset.theatre);
    });
    var entries = VenueFilter.hidden().filter(function (n) {
      return chips.indexOf(n) === -1;
    });
    box.textContent = '';
    if (!entries.length) {
      box.hidden = true;
      return;
    }
    var label = document.createElement('span');
    label.className = 'hidden-screens-label';
    label.textContent = 'Also hidden:';
    box.appendChild(label);
    entries.forEach(function (n) {
      var btn = document.createElement('button');
      btn.className = 'hidden-screen-chip';
      btn.dataset.name = n;
      btn.title = 'Unhide ' + VenueFilter.labelFor(n);
      btn.textContent = VenueFilter.labelFor(n) + ' ✕';
      box.appendChild(btn);
    });
    box.hidden = false;
  }
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.hidden-screen-chip');
    if (chip) VenueFilter.unhide(chip.dataset.name);
  });

  VenueFilter.subscribe(applyFilter);
  applyFilter();
})();
