/**
 * Theater Directory & Amenity Filter Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const theaterList = document.querySelector('.theater-list');
  if (!theaterList) return;

  const searchInput = document.querySelector('.search-location input');
  const searchBtn = document.querySelector('.search-location button');
  const filterButtons = document.querySelectorAll('.filter-options button');
  let activeAmenity = '';
  let requestSeq = 0;

  fetchTheaters('', '');

  function runSearch() {
    fetchTheaters(searchInput ? searchInput.value.trim() : '', activeAmenity);
  }

  async function fetchTheaters(address, amenity) {
    const seq = ++requestSeq;
    const CT = window.CineTicket;
    const params = new URLSearchParams();
    if (address) params.append('address', address);
    if (amenity) params.append('amenity', amenity);
    const query = params.toString();

    CT.renderStateBlock(theaterList, 'loading', 'Loading partner theaters...', 'Checking locations, formats, and amenities.');

    try {
      const payload = await CT.fetchJson(
        '/index.php/theater/theater/getTheaterList' + (query ? '?' + query : '')
      );
      if (seq !== requestSeq) return;
      if (payload.success) {
        renderTheaters(payload.data || []);
      } else {
        CT.renderStateBlock(
          theaterList,
          'error',
          'Failed to load theaters',
          payload.message || 'Unable to query cinema locations.',
          function () { fetchTheaters(address, amenity); }
        );
      }
    } catch (_) {
      if (seq !== requestSeq) return;
      CT.renderStateBlock(
        theaterList,
        'error',
        'Unable to load theaters right now',
        'Could not reach the theater directory service. Click Retry to try again.',
        function () { fetchTheaters(address, amenity); }
      );
    }
  }

  searchBtn?.addEventListener('click', runSearch);
  searchInput?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  });

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      filterButtons.forEach(function (btn) { btn.classList.remove('active'); });
      this.classList.add('active');
      const label = this.textContent.trim();
      activeAmenity = label === 'All Theaters' ? '' : label;
      runSearch();
    });
  });
});

function renderTheaters(theaters) {
  const theaterList = document.querySelector('.theater-list');
  if (!theaterList) return;

  const CT = window.CineTicket;
  const esc = CT.escapeHtml;

  if (!Array.isArray(theaters) || theaters.length === 0) {
    CT.renderStateBlock(
      theaterList,
      'empty',
      'No theaters matched your criteria',
      'Try clearing your location filter or choosing All Theaters.'
    );
    return;
  }

  const fallbackImg = CT.resolveAssetUrl('img/logo.jpg');
  theaterList.innerHTML = '';
  theaters.forEach(function (theater) {
    const amenities = (theater.amenity || '')
      .split(',')
      .map(function (a) { return a.trim(); })
      .filter(Boolean);
    const reviewLabel = theater.reviews || 'Verified cinema';

    const card = document.createElement('div');
    card.className = 'theater-card';
    card.innerHTML =
      '<div class="theater-image">' +
      '<img src="' + esc(CT.resolveAssetUrl(theater.img)) + '" alt="' + esc(theater.theater_name) + '">' +
      '</div>' +
      '<div class="theater-details">' +
      '<h3>' + esc(theater.theater_name) + '</h3>' +
      '<div class="theater-location"><span>📍</span><span>' + esc(theater.address) + '</span></div>' +
      '<div class="amenities">' +
      amenities.map(function (a) { return '<span class="amenity">' + esc(a) + '</span>'; }).join('') +
      '</div>' +
      '<div class="theater-rating">' +
      '<span>' + CT.renderStarIcons(theater.star) + '</span>' +
      '<span>' + esc(theater.star) + ' (' + esc(reviewLabel) + ')</span>' +
      '</div>' +
      '<a href="theater-details.html?theater_code=' + encodeURIComponent(theater.theater_code) + '" class="view-details">View Theater Details</a>' +
      '</div>';

    const imgEl = card.querySelector('.theater-image img');
    imgEl.addEventListener('error', function () {
      if (imgEl.src !== fallbackImg) imgEl.src = fallbackImg;
    });

    theaterList.appendChild(card);
  });
}