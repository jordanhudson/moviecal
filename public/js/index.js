(function () {
  function readJsonIsland(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }

  var CINEPLEX = readJsonIsland('cineplexVenues') || [];

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

  // ---- theatre filter chips (localStorage: hiddenTheatres) ----
  function getHidden() {
    try {
      return JSON.parse(localStorage.getItem('hiddenTheatres') || '[]');
    } catch (e) {
      return [];
    }
  }
  function saveHidden(l) {
    localStorage.setItem('hiddenTheatres', JSON.stringify(l));
  }
  function isHidden(dt, hidden) {
    if (hidden.indexOf(dt) !== -1) return true;
    for (var i = 0; i < CINEPLEX.length; i++) {
      if (hidden.indexOf(CINEPLEX[i].display) !== -1 && dt.indexOf(CINEPLEX[i].prefix) === 0)
        return true;
    }
    return false;
  }
  function applyFilter() {
    var hidden = getHidden();
    document.querySelectorAll('[data-theatre]').forEach(function (el) {
      if (el.classList.contains('chip')) return;
      el.style.display = isHidden(el.dataset.theatre, hidden) ? 'none' : '';
    });
    document.querySelectorAll('.chip').forEach(function (c) {
      var off = hidden.indexOf(c.dataset.theatre) !== -1;
      c.classList.toggle('off', off);
      c.classList.toggle('on', !off);
    });
    renderHiddenScreens(hidden);
  }
  document.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      var name = c.dataset.theatre;
      var hidden = getHidden();
      var idx = hidden.indexOf(name);
      if (idx === -1) hidden.push(name);
      else hidden.splice(idx, 1);
      saveHidden(hidden);
      applyFilter();
    });
  });

  // ---- per-screen hide links on timeline rows ----
  document.querySelectorAll('.theatre-row .row-hide').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var name = btn.closest('[data-theatre]').dataset.theatre;
      var hidden = getHidden();
      if (hidden.indexOf(name) === -1) hidden.push(name);
      saveHidden(hidden);
      applyFilter();
    });
  });

  // Strip under the timeline listing individually hidden screens (entries that
  // aren't venue chips); click one to unhide it.
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
  function renderHiddenScreens(hidden) {
    var box = document.getElementById('hiddenScreens');
    if (!box) return;
    var chips = [];
    document.querySelectorAll('.chip').forEach(function (c) {
      chips.push(c.dataset.theatre);
    });
    var screens = hidden.filter(function (n) {
      return chips.indexOf(n) === -1;
    });
    if (!screens.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.innerHTML =
      '<span class="hidden-screens-label">Hidden screens:</span> ' +
      screens
        .map(function (n) {
          return (
            '<button class="hidden-screen-chip" data-name="' +
            esc(n) +
            '" title="Unhide ' +
            esc(n) +
            '">' +
            esc(n) +
            ' ✕</button>'
          );
        })
        .join('');
    box.style.display = 'flex';
  }
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.hidden-screen-chip');
    if (!chip) return;
    saveHidden(
      getHidden().filter(function (n) {
        return n !== chip.dataset.name;
      }),
    );
    applyFilter();
  });

  applyFilter();
})();
