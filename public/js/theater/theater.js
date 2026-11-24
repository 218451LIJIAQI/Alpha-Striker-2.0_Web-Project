/**
 * Theater Directory & Amenity Filter Controller
 */
(function () {
  'use strict';

  let requestSeq = 0;

  async function fetchTheaters(address, amenity, onReset) {
    const seq = ++requestSeq;
    const params = new URLSearchParams();
    if (address) params.append('address', address);
    if (amenity) params.append('amenity', amenity);
    const query = params.toString();

    try {
      const payload = await window.CineTicket.fetchJson(
        '/index.php/theater/theater/getTheaterList' + (query ? '?' + query : '')
      );
      if (seq !== requestSeq) return;
      if (payload.success) {
        renderTheaters(payload.data || [], onReset);
      } else {
        window.showToast(payload.message || 'Failed to load theaters', 'error');
      }
    } catch (_) {
      if (seq !== requestSeq) return;
      window.showToast('Unable to load theaters right now', 'error');
    }
  }

  function renderTheaters(theaters, onReset) {
    const theaterList = document.querySelector('.theater-list');
    if (!theaterList) return;

    const CT = window.CineTicket;
    const esc = CT.escapeHtml;

    if (!Array.isArray(theaters) || theaters.length === 0) {
      theaterList.innerHTML =
        '<div class="grid-empty-state">' +
        '<h3>No theaters matched your criteria</h3>' +
        '<p>Try clearing your location filter or choosing All Theaters.</p>' +
        '<button type="button" class="btn btn-primary empty-reset-btn">Show All Theaters</button>' +
        '</div>';
      if (typeof onReset === 'function') {
        theaterList.querySelector('.empty-reset-btn')?.addEventListener('click', onReset);
      }
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

    const searchInput = document.querySelector('.search-location input');
    const searchBtn = document.querySelector('.search-location button');
    const filterButtons = document.querySelectorAll('.filter-options button');
    let activeAmenity = '';

    filterButtons.forEach(function (btn, idx) {
      btn.setAttribute('aria-pressed', String(idx === 0));
    });

    function resetAll() {
      if (searchInput) searchInput.value = '';
      activeAmenity = '';
      filterButtons.forEach(function (btn, idx) {
        btn.classList.toggle('active', idx === 0);
        btn.setAttribute('aria-pressed', String(idx === 0));
      });
      fetchTheaters('', '', resetAll);
    }

    function runSearch() {
      fetchTheaters(searchInput ? searchInput.value.trim() : '', activeAmenity, resetAll);
    }

    fetchTheaters('', '', resetAll);

    searchBtn?.addEventListener('click', runSearch);
    searchInput?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
      }
    });

    filterButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        filterButtons.forEach(function (btn) {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
        const label = this.textContent.trim();
        activeAmenity = label === 'All Theaters' ? '' : label;
        runSearch();
      });
    });
  });
})();