/**
 * Theater Directory & Amenity Filter Controller
 * Supports URL query deep-linking (?address=, ?amenity=), refresh recovery, and popstate sync.
 */
(function () {
  'use strict';

  let requestSeq = 0;

  function syncTheaterUrl(address, amenity) {
    if (!window.history || typeof window.history.pushState !== 'function') return;
    const params = new URLSearchParams();
    if (address) params.set('address', address);
    if (amenity) params.set('amenity', amenity);
    const qs = params.toString();
    const nextUrl = window.location.pathname + (qs ? '?' + qs : '');
    const curUrl = window.location.pathname + (window.location.search || '');
    if (nextUrl !== curUrl) {
      window.history.pushState(null, '', nextUrl);
    }
  }

  async function fetchTheaters(address, amenity, onReset) {
    const CT = window.CineTicket;
    const theaterList = document.querySelector('.theater-list');
    const seq = ++requestSeq;
    const params = new URLSearchParams();
    if (address) params.append('address', address);
    if (amenity) params.append('amenity', amenity);
    const query = params.toString();
    const retry = function () { fetchTheaters(address, amenity, onReset); };

    try {
      const payload = await CT.fetchJson(
        '/index.php/theater/theater/getTheaterList' + (query ? '?' + query : '')
      );
      if (seq !== requestSeq) return;
      if (payload.success) {
        renderTheaters(payload.data || [], onReset);
      } else {
        const msg = payload.message || 'Failed to load theaters';
        window.showToast(msg, 'error');
        CT.renderStateCard(theaterList, {
          heading: 'Unable to load theaters',
          message: msg,
          actionLabel: 'Retry Directory',
          onAction: retry,
          isError: true,
        });
      }
    } catch (_) {
      if (seq !== requestSeq) return;
      window.showToast('Unable to load theaters right now', 'error');
      CT.renderStateCard(theaterList, {
        heading: 'Unable to load theaters',
        message: 'Theater directory is temporarily unreachable. Please retry.',
        actionLabel: 'Retry Directory',
        onAction: retry,
        isError: true,
      });
    }
  }

  function renderTheaters(theaters, onReset) {
    const theaterList = document.querySelector('.theater-list');
    if (!theaterList) return;

    const CT = window.CineTicket;
    const esc = CT.escapeHtml;

    if (!Array.isArray(theaters) || theaters.length === 0) {
      CT.renderStateCard(theaterList, {
        heading: 'No theaters matched your criteria',
        message: 'Try clearing your location filter or choosing All Theaters.',
        actionLabel: 'Show All Theaters',
        onAction: onReset,
      });
      return;
    }

    theaterList.innerHTML = '';
    theaters.forEach(function (theater) {
      const amenities = (theater.amenity || '')
        .split(',')
        .map(function (a) { return a.trim(); })
        .filter(Boolean);
      const rawReviews = String(theater.reviews || '').trim();
      const reviewLabel = rawReviews
        ? (/review/i.test(rawReviews) ? rawReviews : rawReviews + ' reviews')
        : 'Verified cinema';

      const card = document.createElement('article');
      card.className = 'theater-card';
      card.innerHTML =
        '<div class="theater-image">' +
        '<img src="' + esc(CT.resolveAssetUrl(theater.img)) + '" alt="' + esc(theater.theater_name) + '" loading="lazy">' +
        (theater.distance ? '<span class="theater-distance-pill tabular-nums">' + esc(theater.distance) + '</span>' : '') +
        '</div>' +
        '<div class="theater-details">' +
        '<h3>' + esc(theater.theater_name) + '</h3>' +
        '<div class="theater-location"><i class="fas fa-map-marker-alt" aria-hidden="true"></i><span>' + esc(theater.address) + '</span></div>' +
        '<div class="amenities">' +
        amenities.map(function (a) { return '<span class="amenity">' + esc(a) + '</span>'; }).join('') +
        '</div>' +
        '<div class="theater-rating">' +
        '<span class="rating-stars">' + CT.renderStarIcons(theater.star) + '</span>' +
        '<span class="rating-meta tabular-nums">' + esc(theater.star) + ' (' + esc(reviewLabel) + ')</span>' +
        '</div>' +
        '<a href="theater-details.html?theater_code=' + encodeURIComponent(theater.theater_code) + '" class="view-details">View Theater Details</a>' +
        '</div>';

      theaterList.appendChild(card);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const theaterList = document.querySelector('.theater-list');
    if (!theaterList) return;

    const CT = window.CineTicket;
    const searchInput = document.querySelector('.search-location input');
    const searchBtn = document.querySelector('.search-location button');
    const filterButtons = document.querySelectorAll('.filter-options button');
    let activeAmenity = '';

    function syncPillState() {
      CT.activatePill(filterButtons, function (btn, idx) {
        if (!activeAmenity) return idx === 0;
        return btn.textContent.trim().toLowerCase() === activeAmenity.toLowerCase();
      });
    }

    function resetAll() {
      if (searchInput) searchInput.value = '';
      activeAmenity = '';
      syncPillState();
      syncTheaterUrl('', '');
      fetchTheaters('', '', resetAll);
    }

    function runSearch(updateUrl) {
      const addr = searchInput ? searchInput.value.trim() : '';
      if (updateUrl !== false) syncTheaterUrl(addr, activeAmenity);
      fetchTheaters(addr, activeAmenity, resetAll);
    }

    function applyFromUrl() {
      const qs = new URLSearchParams(window.location.search);
      const addr = (qs.get('address') || '').trim();
      const am = (qs.get('amenity') || '').trim();
      if (searchInput) searchInput.value = addr;
      activeAmenity = am;
      syncPillState();
      runSearch(false);
    }

    applyFromUrl();
    window.addEventListener('popstate', applyFromUrl);

    searchBtn?.addEventListener('click', function () { runSearch(true); });
    searchInput?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch(true);
      }
    });

    filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        const label = button.textContent.trim();
        activeAmenity = label === 'All Theaters' ? '' : label;
        syncPillState();
        runSearch(true);
      });
    });
  });
})();