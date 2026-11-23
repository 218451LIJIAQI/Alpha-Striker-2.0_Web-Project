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
      filterButtons.forEach(function (btn) {
        btn.classList.remove('active');
      });
      this.classList.add('active');
      if (searchInput) searchInput.value = '';
      fetchMovies(this.dataset.genre || 'all');
    });
  });

  function triggerSearch() {
    const keyword = searchInput ? searchInput.value.trim() : '';
    if (!keyword) {
      fetchAllMovies();
      return;
    }

    filterButtons.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.genre === 'all');
    });

    fetch('/index.php/movie/movies/searchMovies?keyword=' + encodeURIComponent(keyword))
      .then(function (res) { return res.json(); })
      .then(function (payload) {
        if (payload.success) {
          renderMovies(payload.data || []);
        } else {
          window.showToast(payload.message || 'Search failed', 'error');
        }
      })
      .catch(function () {
        window.showToast('Unable to search movies right now', 'error');
      });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', triggerSearch);
  }
  if (searchInput) {
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerSearch();
      }
    });
  }
});

function fetchAllMovies() {
  document.querySelectorAll('.btn-filter').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.genre === 'all');
  });
  fetchMovies('all');
}

function fetchMovies(genre) {
  const targetGenre = genre || 'all';
  fetch('/index.php/movie/movies/getMovieList?genre=' + encodeURIComponent(targetGenre))
    .then(function (res) { return res.json(); })
    .then(function (payload) {
      if (payload.success) {
        renderMovies(payload.data || []);
      } else {
        window.showToast(payload.message || 'Failed to load movies', 'error');
      }
    })
    .catch(function () {
      window.showToast('Unable to connect to movie service', 'error');
    });
}

function renderStarIcons(score) {
  const rating = Math.max(0, Math.min(5, parseFloat(score) || 5.0));
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  let html = '';
  for (let i = 0; i < full; i++) html += '<i class="fas fa-star"></i>';
  if (half) html += '<i class="fas fa-star-half-alt"></i>';
  for (let i = 0; i < empty; i++) html += '<i class="far fa-star"></i>';
  return html;
}

function renderMovies(movies) {
  const movieGrid = document.querySelector('.movie-grid');
  if (!movieGrid) return;

  const esc = window.CineTicket.escapeHtml;
  const resolveAsset = window.CineTicket.resolveAssetUrl;
  const pageUrl = window.CineTicket.pageUrl;

  if (!Array.isArray(movies) || movies.length === 0) {
    movieGrid.innerHTML =
      '<div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px;">' +
      '<h3>No matching movies found</h3>' +
      '<p style="margin-top: 8px; opacity: 0.75;">Try another search term or browse all genres.</p>' +
      '</div>';
    return;
  }

  movieGrid.innerHTML = '';
  movies.forEach(function (movie) {
    const ratingVal = (parseFloat(movie.star) || 5.0).toFixed(1);
    const priceText = movie.money !== undefined && movie.money !== null
      ? '$' + parseFloat(movie.money).toFixed(2)
      : '';
    const posterSrc = resolveAsset(movie.img);

    const card = document.createElement('div');
    card.className = 'movie-card';
    card.innerHTML =
      (movie.tag ? '<div class="movie-badge">' + esc(movie.tag) + '</div>' : '') +
      '<img src="' + esc(posterSrc) + '" alt="' + esc(movie.movie_name) + '" class="movie-poster">' +
      '<div class="movie-info">' +
      '<div class="movie-title">' + esc(movie.movie_name) + '</div>' +
      '<div class="rating">' +
      renderStarIcons(ratingVal) +
      '<span>' + esc(ratingVal) + '</span>' +
      '</div>' +
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
      const code = this.getAttribute('data-movie-code');
      window.location.href = pageUrl('booking3.html?movie_code=' + encodeURIComponent(code));
    });

    movieGrid.appendChild(card);
  });
}