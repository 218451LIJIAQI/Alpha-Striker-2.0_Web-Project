/**
 * Movies Catalog & Search Controller (Homepage)
 */
document.addEventListener('DOMContentLoaded', function () {
  const movieGrid = document.querySelector('.movie-grid');
  if (!movieGrid) return;

  const searchInput = document.querySelector('.search-input');
  const searchBtn = document.querySelector('.search-btn');
  const viewAllBtn = document.getElementById('view-all-movies-btn');
  const filterButtons = document.querySelectorAll('.btn-filter');
  let requestSeq = 0;

  fetchMovies('all');

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      filterButtons.forEach(function (btn) { btn.classList.remove('active'); });
      this.classList.add('active');
      if (searchInput) searchInput.value = '';
      fetchMovies(this.dataset.genre || 'all');
    });
  });

  viewAllBtn?.addEventListener('click', fetchAllMovies);

  async function triggerSearch() {
    const keyword = searchInput ? searchInput.value.trim() : '';
    resetGenreSelection();
    if (!keyword) {
      fetchMovies('all');
      return;
    }

    const seq = ++requestSeq;
    const CT = window.CineTicket;
    CT.renderStateBlock(movieGrid, 'loading', 'Searching movies...', 'Matching titles, genres, and highlight badges.');

    try {
      const payload = await CT.fetchJson(
        '/index.php/movie/movies/searchMovies?keyword=' + encodeURIComponent(keyword)
      );
      if (seq !== requestSeq) return;
      if (payload.success) {
        renderMovies(payload.data || []);
      } else {
        CT.renderStateBlock(
          movieGrid,
          'error',
          'Movie search failed',
          payload.message || 'Could not complete your search request.',
          triggerSearch
        );
      }
    } catch (_) {
      if (seq !== requestSeq) return;
      CT.renderStateBlock(
        movieGrid,
        'error',
        'Unable to search movies right now',
        'Please check your connection and try again.',
        triggerSearch
      );
    }
  }

  async function fetchMovies(genre) {
    const seq = ++requestSeq;
    const CT = window.CineTicket;
    const targetGenre = genre || 'all';
    CT.renderStateBlock(movieGrid, 'loading', 'Loading movie catalog...', 'Fetching current feature screenings.');

    try {
      const payload = await CT.fetchJson(
        '/index.php/movie/movies/getMovieList?genre=' + encodeURIComponent(targetGenre)
      );
      if (seq !== requestSeq) return;
      if (payload.success) {
        renderMovies(payload.data || []);
      } else {
        CT.renderStateBlock(
          movieGrid,
          'error',
          'Failed to load movie catalog',
          payload.message || 'The movie catalog service returned an error.',
          function () { fetchMovies(targetGenre); }
        );
      }
    } catch (_) {
      if (seq !== requestSeq) return;
      CT.renderStateBlock(
        movieGrid,
        'error',
        'Unable to connect to movie service',
        'Could not retrieve the screening catalog. Click Retry to try again.',
        function () { fetchMovies(targetGenre); }
      );
    }
  }

  function fetchAllMovies() {
    if (searchInput) searchInput.value = '';
    resetGenreSelection();
    fetchMovies('all');
  }

  window.fetchAllMovies = fetchAllMovies;

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

function renderMovies(movies) {
  const movieGrid = document.querySelector('.movie-grid');
  if (!movieGrid) return;

  const CT = window.CineTicket;
  const esc = CT.escapeHtml;

  if (!Array.isArray(movies) || movies.length === 0) {
    CT.renderStateBlock(
      movieGrid,
      'empty',
      'No matching movies found',
      'Try another search term or browse all genres.'
    );
    return;
  }

  const fallbackImg = CT.resolveAssetUrl('img/logo.jpg');
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

    const imgEl = card.querySelector('.movie-poster');
    imgEl.addEventListener('error', function () {
      if (imgEl.src !== fallbackImg) imgEl.src = fallbackImg;
    });

    card.querySelector('.btn-book').addEventListener('click', function () {
      window.location.href = CT.pageUrl('booking3.html?movie_code=' + encodeURIComponent(movie.movie_code));
    });

    movieGrid.appendChild(card);
  });
}