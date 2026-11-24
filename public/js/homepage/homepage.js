/**
 * Movies Catalog & Search Controller (Homepage)
 */
(function () {
  'use strict';

  let requestSeq = 0;

  function setGenreActive(targetGenre) {
    document.querySelectorAll('.btn-filter').forEach(function (btn) {
      const isActive = (btn.dataset.genre || 'all') === targetGenre;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  async function fetchMovies(genre) {
    const seq = ++requestSeq;
    try {
      const payload = await window.CineTicket.fetchJson(
        '/index.php/movie/movies/getMovieList?genre=' + encodeURIComponent(genre || 'all')
      );
      if (seq !== requestSeq) return;
      if (payload.success) {
        renderMovies(payload.data || []);
      } else {
        window.showToast(payload.message || 'Failed to load movies', 'error');
      }
    } catch (_) {
      if (seq !== requestSeq) return;
      window.showToast('Unable to connect to movie service', 'error');
    }
  }

  function fetchAllMovies() {
    const searchInput = document.querySelector('.search-input');
    if (searchInput) searchInput.value = '';
    setGenreActive('all');
    fetchMovies('all');
  }

  function renderMovies(movies) {
    const movieGrid = document.querySelector('.movie-grid');
    if (!movieGrid) return;

    const CT = window.CineTicket;
    const esc = CT.escapeHtml;

    const countBadge = document.getElementById('catalog-count-badge');
    if (countBadge) {
      const n = Array.isArray(movies) ? movies.length : 0;
      countBadge.textContent = n + ' ' + (n === 1 ? 'Title' : 'Titles');
    }

    if (!Array.isArray(movies) || movies.length === 0) {
      movieGrid.innerHTML =
        '<div class="grid-empty-state">' +
        '<h3>No matching movies found</h3>' +
        '<p>Try another search term or reset the genre filter to view all scheduled screenings.</p>' +
        '<button type="button" class="btn btn-primary empty-reset-btn">Show All Movies</button>' +
        '</div>';
      movieGrid.querySelector('.empty-reset-btn')?.addEventListener('click', fetchAllMovies);
      return;
    }

    movieGrid.innerHTML = '';
    movies.forEach(function (movie) {
      const ratingVal = (parseFloat(movie.star) || 5.0).toFixed(1);
      const priceText = movie.money !== undefined && movie.money !== null
        ? '$' + parseFloat(movie.money).toFixed(2)
        : '';

      const card = document.createElement('article');
      card.className = 'movie-card';
      card.innerHTML =
        '<div class="movie-poster-wrap">' +
        (movie.tag ? '<div class="movie-badge">' + esc(movie.tag) + '</div>' : '') +
        '<img src="' + esc(CT.resolveAssetUrl(movie.img)) + '" alt="' + esc(movie.movie_name) + ' poster" class="movie-poster" loading="lazy">' +
        '</div>' +
        '<div class="movie-info">' +
        '<div class="movie-title">' + esc(movie.movie_name) + '</div>' +
        '<div class="rating" aria-label="Rated ' + esc(ratingVal) + ' out of 5">' + CT.renderStarIcons(ratingVal) + '<span class="tabular-nums">' + esc(ratingVal) + '</span></div>' +
        '<div class="movie-meta">' +
        '<span><i class="fas fa-film" aria-hidden="true"></i> ' + esc(movie.movie_type) + '</span>' +
        '<span><i class="fas fa-clock" aria-hidden="true"></i> ' + esc(movie.times) + '</span>' +
        (priceText ? '<span class="tabular-nums"><i class="fas fa-tag" aria-hidden="true"></i> ' + esc(priceText) + '</span>' : '') +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-book" data-movie-code="' + esc(movie.movie_code) + '">' +
        '<i class="fas fa-ticket-alt" aria-hidden="true"></i> Book Now' +
        '</button>' +
        '</div>';

      card.querySelector('.btn-book').addEventListener('click', function () {
        window.location.href = CT.pageUrl('booking3.html?movie_code=' + encodeURIComponent(movie.movie_code));
      });

      movieGrid.appendChild(card);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const movieGrid = document.querySelector('.movie-grid');
    if (!movieGrid) return;

    const searchInput = document.querySelector('.search-input');
    const searchBtn = document.querySelector('.search-btn');
    const filterButtons = document.querySelectorAll('.btn-filter');

    setGenreActive('all');
    fetchMovies('all');

    document.getElementById('view-all-movies-btn')?.addEventListener('click', fetchAllMovies);

    filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        const genre = this.dataset.genre || 'all';
        setGenreActive(genre);
        if (searchInput) searchInput.value = '';
        fetchMovies(genre);
      });
    });

    async function triggerSearch() {
      const keyword = searchInput ? searchInput.value.trim() : '';
      setGenreActive('all');
      if (!keyword) {
        fetchMovies('all');
        return;
      }

      const seq = ++requestSeq;
      try {
        const payload = await window.CineTicket.fetchJson(
          '/index.php/movie/movies/searchMovies?keyword=' + encodeURIComponent(keyword)
        );
        if (seq !== requestSeq) return;
        if (payload.success) {
          renderMovies(payload.data || []);
        } else {
          window.showToast(payload.message || 'Search failed', 'error');
        }
      } catch (_) {
        if (seq !== requestSeq) return;
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

  window.fetchAllMovies = fetchAllMovies;
})();