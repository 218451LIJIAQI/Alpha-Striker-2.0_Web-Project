/**
 * Movies Catalog & Search Controller (Homepage)
 */
document.addEventListener('DOMContentLoaded', function () {
  const movieGrid = document.querySelector('.movie-grid');
  if (!movieGrid) return;

  const searchInput = document.querySelector('.search-input');
  const searchBtn = document.querySelector('.search-btn');
  const filterButtons = document.querySelectorAll('.btn-filter');

  fetchMovies('all');

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      filterButtons.forEach(function (btn) { btn.classList.remove('active'); });
      this.classList.add('active');
      if (searchInput) searchInput.value = '';
      fetchMovies(this.dataset.genre || 'all');
    });
  });

  async function triggerSearch() {
    const keyword = searchInput ? searchInput.value.trim() : '';
    resetGenreSelection();
    if (!keyword) {
      fetchMovies('all');
      return;
    }

    try {
      const payload = await window.CineTicket.fetchJson(
        '/index.php/movie/movies/searchMovies?keyword=' + encodeURIComponent(keyword)
      );
      if (payload.success) {
        renderMovies(payload.data || []);
      } else {
        window.showToast(payload.message || 'Search failed', 'error');
      }
    } catch (_) {
      window.showToast('Unable to search movies right now', 'error');
    }
  }

  searchBtn?.addEventListener('click', triggerSearch);
  searchInput?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerSearch();
    }
  });
});

function resetGenreSelection() {
  document.querySelectorAll('.btn-filter').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.genre === 'all');
  });
}

function fetchAllMovies() {
  const searchInput = document.querySelector('.search-input');
  if (searchInput) searchInput.value = '';
  resetGenreSelection();
  fetchMovies('all');
}

async function fetchMovies(genre) {
  try {
    const payload = await window.CineTicket.fetchJson(
      '/index.php/movie/movies/getMovieList?genre=' + encodeURIComponent(genre || 'all')
    );
    if (payload.success) {
      renderMovies(payload.data || []);
    } else {
      window.showToast(payload.message || 'Failed to load movies', 'error');
    }
  } catch (_) {
    window.showToast('Unable to connect to movie service', 'error');
  }
}

function renderMovies(movies) {
  const movieGrid = document.querySelector('.movie-grid');
  if (!movieGrid) return;

  const CT = window.CineTicket;
  const esc = CT.escapeHtml;

  if (!Array.isArray(movies) || movies.length === 0) {
    movieGrid.innerHTML =
      '<div class="grid-empty-state">' +
      '<h3>No matching movies found</h3>' +
      '<p>Try another search term or browse all genres.</p>' +
      '</div>';
    return;
  }

  movieGrid.innerHTML = '';
  movies.forEach(function (movie) {
    const ratingVal = (parseFloat(movie.star) || 5.0).toFixed(1);
    const priceText = movie.money !== undefined && movie.money !== null
      ? '$' + parseFloat(movie.money).toFixed(2)
      : '';

    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML =
      (movie.tag ? '<div class="movie-badge">' + esc(movie.tag) + '</div>' : '') +
      '<img src="' + esc(CT.resolveAssetUrl(movie.img)) + '" alt="' + esc(movie.movie_name) + '" class="movie-poster">' +
      '<div class="movie-info">' +
      '<div class="movie-title">' + esc(movie.movie_name) + '</div>' +
      '<div class="rating">' + CT.renderStarIcons(ratingVal) + '<span>' + esc(ratingVal) + '</span></div>' +
      '<div class="movie-meta">' +
      '<span><i class="fas fa-film"></i> ' + esc(movie.movie_type) + '</span>' +
      '<span><i class="fas fa-clock"></i> ' + esc(movie.times) + '</span>' +
      (priceText ? '<span><i class="fas fa-tag"></i> ' + esc(priceText) + '</span>' : '') +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-book" data-movie-code="' + esc(movie.movie_code) + '">' +
      '<i class="fas fa-ticket-alt"></i> Book Now' +
      '</button>' +
      '</div>';

    card.querySelector('.btn-book').addEventListener('click', function () {
      window.location.href = CT.pageUrl('booking3.html?movie_code=' + encodeURIComponent(movie.movie_code));
    });

    movieGrid.appendChild(card);
  });
}