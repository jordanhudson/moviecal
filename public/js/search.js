(function () {
  var btn = document.getElementById('navSearchBtn');
  var input = document.getElementById('searchInput');
  var results = document.getElementById('searchResults');

  if (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = document.body.classList.toggle('search-open');
      if (open) {
        setTimeout(function () {
          input.focus();
        }, 0);
      } else {
        results.classList.remove('open');
        input.value = '';
      }
    });
  }

  if (!input) return;

  function slug(t) {
    return t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  var debounce = null;
  var seq = 0;

  function run(q) {
    // Tag each request so out-of-order responses can be dropped.
    var mine = ++seq;
    fetch('/api/search?q=' + encodeURIComponent(q))
      .then(function (r) {
        return r.ok ? r.json() : [];
      })
      .then(function (matches) {
        if (mine !== seq) return;
        // Build results via the DOM (textContent / setAttribute) so the browser
        // escapes the title in both the link text and the href — no hand-rolled
        // escaping that can miss a character.
        results.textContent = '';
        if (!matches.length) {
          var none = document.createElement('div');
          none.className = 'search-no-results';
          none.textContent = 'No matches';
          results.appendChild(none);
        } else {
          matches.forEach(function (m) {
            var s = slug(m.title);
            var a = document.createElement('a');
            a.className = 'search-result';
            a.setAttribute('href', '/movie/' + m.id + (s ? '-' + s : ''));
            a.textContent = m.title;
            results.appendChild(a);
          });
        }
        results.classList.add('open');
      })
      .catch(function () {});
  }

  input.addEventListener('input', function () {
    var q = input.value.trim();
    clearTimeout(debounce);
    if (!q) {
      seq++;
      results.classList.remove('open');
      return;
    }
    debounce = setTimeout(function () {
      run(q);
    }, 150);
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.top-bar-search') && !e.target.closest('#navSearchBtn')) {
      results.classList.remove('open');
      document.body.classList.remove('search-open');
    }
  });
})();
