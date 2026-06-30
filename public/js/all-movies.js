// Sort dropdown navigates to the chosen sort (was an inline onchange handler).
(function () {
  var select = document.getElementById('sortSelect');
  if (select) {
    select.addEventListener('change', function () {
      window.location.href = '/internal-movies?sort=' + this.value;
    });
  }
})();

// Open the shared fix-match modal for a row's movie.
document.querySelector('.movie-list').addEventListener('click', function (e) {
  var btn = e.target.closest('.fix-btn');
  if (!btn) return;
  var movieId = parseInt(btn.getAttribute('data-movie-id'), 10);
  var title = btn.getAttribute('data-movie-title');
  TmdbModal.open(movieId, title);
});
