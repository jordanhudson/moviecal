// Handles Yup / dismiss / delete via fetch (token from localStorage) and removes
// the resolved card; Nope reuses the shared fix-match modal (whose own apply
// reloads the page). All writes also refresh Letterboxd server-side.
(function () {
  var list = document.getElementById('reviewList');
  var countEl = document.getElementById('reviewCount');

  // The admin token lives only in localStorage (this page is admin-only). Set it
  // once and every action uses it — it survives the reload the modal does.
  function token() {
    try {
      return (localStorage.getItem('adminToken') || '').trim();
    } catch (e) {
      return '';
    }
  }
  var setBtn = document.getElementById('setToken');
  var statusEl = document.getElementById('tokenStatus');
  function refreshTokenUi() {
    var has = !!token();
    statusEl.textContent = has ? 'Admin token saved' : 'No admin token set';
    statusEl.className = 'token-status' + (has ? ' ok' : '');
    setBtn.textContent = has ? 'Change token' : 'Set admin token';
  }
  function promptToken() {
    var t = prompt('Admin token', token());
    if (t === null) return;
    try {
      localStorage.setItem('adminToken', t.trim());
    } catch (e) {}
    refreshTokenUi();
  }
  setBtn.addEventListener('click', promptToken);
  refreshTokenUi();

  function remaining() {
    var n = list.querySelectorAll('.review-card').length;
    countEl.textContent = n;
    if (n === 0) {
      document.getElementById('reviewEmpty').style.display = 'block';
    }
  }
  function setStatus(card, msg, ok) {
    var s = card.querySelector('.review-status');
    s.textContent = msg;
    s.className = 'review-status' + (ok === false ? ' err' : '');
  }

  function apply(card, tmdbId) {
    if (!token()) {
      setStatus(card, 'Set the admin token first.', false);
      promptToken();
      return;
    }
    setStatus(card, 'Updating…', true);
    fetch('/api/movie/' + card.dataset.movieId + '/tmdb-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ tmdbId: tmdbId }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          setStatus(card, data.error, false);
          return;
        }
        card.remove();
        remaining();
      })
      .catch(function () {
        setStatus(card, 'Request failed.', false);
      });
  }

  function dismiss(card) {
    if (!token()) {
      setStatus(card, 'Set the admin token first.', false);
      promptToken();
      return;
    }
    setStatus(card, 'Dismissing…', true);
    fetch('/api/tmdb-review/' + card.dataset.movieId + '/dismiss', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token() },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          setStatus(card, data.error, false);
          return;
        }
        card.remove();
        remaining();
      })
      .catch(function () {
        setStatus(card, 'Request failed.', false);
      });
  }

  function del(card) {
    if (!token()) {
      setStatus(card, 'Set the admin token first.', false);
      promptToken();
      return;
    }
    if (
      !confirm(
        'Permanently delete "' + card.dataset.storedTitle + '" and all its screenings from the database?',
      )
    )
      return;
    setStatus(card, 'Deleting…', true);
    fetch('/api/movie/' + card.dataset.movieId + '/delete', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token() },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          setStatus(card, data.error, false);
          return;
        }
        card.remove();
        remaining();
      })
      .catch(function () {
        setStatus(card, 'Request failed.', false);
      });
  }

  list.addEventListener('click', function (e) {
    var card = e.target.closest('.review-card');
    if (!card) return;
    if (e.target.closest('.btn-yup')) {
      apply(card, parseInt(card.dataset.suggestedId, 10));
    } else if (e.target.closest('.btn-dismiss')) {
      dismiss(card);
    } else if (e.target.closest('.btn-delete')) {
      del(card);
    } else if (e.target.closest('.btn-nope')) {
      // The modal reads the same localStorage token, so just open (it auto-searches).
      TmdbModal.open(parseInt(card.dataset.movieId, 10), card.dataset.storedTitle);
    }
  });
})();
