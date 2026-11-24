/**
 * Movies Catalog & Search Controller (Homepage)
 * Supports URL query deep-linking (?genre=, ?q=), refresh recovery, and browser Back/Forward (popstate) sync.
 */
(function () {
  'use strict';

  let requestSeq = 0;
  let activeGenre = 'all';

  function syncUrlQuery(genre, keyword) {
    if (!window.history || typeof window.history.pushState !== 'function') return;
    const params = new URLSearchParams();
    if (keyword) {
      params.set('q', keyword);
    } else if (genre && genre !== 'all') {
      params.set('genre', genre);
    }
    const qs = params.toString();
    const nextUrl = window.location.pathname + (qs ? '?' + qs : '') + (window.location.hash || '');
    const curUrl = window.location.pathname + (window.location.search || '') + (window.location.hash || '');
    if (nextUrl !== curUrl) {
      window.history.pushState(null, '', nextUrl);
    }
  }

  function setGenreActive(targetGenre) {
    activeGenre = targetGenre || 'all';
    const lowerTarget = activeGenre.toLowerCase();
    window.CineTicket.activatePill(
      document.querySelectorAll('.filters .btn-filter'),
      function (btn) { return (btn.dataset.genre || 'all').toLowerCase() === lowerTarget; }
    );
  }

  function bindGenreButton(button) {
    if (button.dataset.genreBound === 'true') return;
    button.dataset.genreBound = 'true';
    button.addEventListener('click', function () {
      const genre = this.dataset.genre || 'all';
      setGenreActive(genre);
      const searchInput = document.querySelector('.search-input');
      if (searchInput) searchInput.value = '';
      syncUrlQuery(genre, '');
      fetchMovies(genre);
    });
  }

  function syncDynamicGenres(movies) {
    const filterContainer = document.querySelector('.filters');
    if (!filterContainer || !Array.isArray(movies)) return;

    const existing = new Set(
      Array.from(filterContainer.querySelectorAll('.btn-filter')).map(function (b) {
        return (b.dataset.genre || '').toLowerCase();
      })
    );

    movies.forEach(function (m) {
      const g = String(m.movie_type || '').trim();
      if (!g || existing.has(g.toLowerCase())) return;
      existing.add(g.toLowerCase());
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-filter';
      btn.dataset.genre = g;
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = g;
      bindGenreButton(btn);
      filterContainer.appendChild(btn);
    });
    setGenreActive(activeGenre);
  }

  function renderCatalogError(message, onRetry) {
    const movieGrid = document.querySelector('.movie-grid');
    if (!movieGrid) return;
    const countBadge = document.getElementById('catalog-count-badge');
    if (countBadge) countBadge.textContent = 'Unavailable';
    window.CineTicket.renderStateCard(movieGrid, {
      heading: 'Unable to load screenings',
      message: message || 'The box office catalog could not be reached. Please check your connection and try again.',
      actionLabel: 'Retry Catalog',
      onAction: onRetry,
      isError: true,
    });
  }

  async function fetchMovies(genre) {
    const seq = ++requestSeq;
    const target = genre || 'all';
    try {
      const payload = await window.CineTicket.fetchJson(
        '/index.php/movie/movies/getMovieList?genre=' + encodeURIComponent(target)
      );
      if (seq !== requestSeq) return;
      if (payload.success) {
        const list = payload.data || [];
        if (target === 'all') {
          syncDynamicGenres(list);
        }
        renderMovies(list);
      } else {
        const msg = payload.message || 'Failed to load movies';
        window.showToast(msg, 'error');
        renderCatalogError(msg, function () { fetchMovies(target); });
      }
    } catch (_) {
      if (seq !== requestSeq) return;
      window.showToast('Unable to connect to movie service', 'error');
      renderCatalogError('Unable to connect to the movie catalog service right now.', function () { fetchMovies(target); });
    }
  }

  function fetchAllMovies() {
    const searchInput = document.querySelector('.search-input');
    if (searchInput) searchInput.value = '';
    setGenreActive('all');
    syncUrlQuery('all', '');
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
      CT.renderStateCard(movieGrid, {
        heading: 'No matching movies found',
        message: 'Try another search term or reset the genre filter to view all scheduled screenings.',
        actionLabel: 'Show All Movies',
        onAction: fetchAllMovies,
      });
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

    document.querySelectorAll('.filters .btn-filter').forEach(bindGenreButton);
    document.getElementById('view-all-movies-btn')?.addEventListener('click', fetchAllMovies);

    async function runKeywordSearch(keyword, updateHistory) {
      setGenreActive('all');
      if (updateHistory !== false) syncUrlQuery('all', keyword);
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
          const msg = payload.message || 'Search failed';
          window.showToast(msg, 'error');
          renderCatalogError(msg, function () { runKeywordSearch(keyword, false); });
        }
      } catch (_) {
        if (seq !== requestSeq) return;
        window.showToast('Unable to search movies right now', 'error');
        renderCatalogError('Search request could not reach the server right now.', function () { runKeywordSearch(keyword, false); });
      }
    }

    function applyFromUrl() {
      const qs = new URLSearchParams(window.location.search);
      const q = (qs.get('q') || '').trim();
      const g = (qs.get('genre') || 'all').trim() || 'all';
      if (q) {
        if (searchInput) searchInput.value = q;
        runKeywordSearch(q, false);
      } else {
        if (searchInput) searchInput.value = '';
        setGenreActive(g);
        fetchMovies(g);
      }
    }

    applyFromUrl();
    window.addEventListener('popstate', applyFromUrl);

    searchBtn?.addEventListener('click', function () {
      runKeywordSearch(searchInput ? searchInput.value.trim() : '', true);
    });
    searchInput?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runKeywordSearch(searchInput.value.trim(), true);
      }
    });
  });
})();