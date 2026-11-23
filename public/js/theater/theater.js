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

  fetchTheaters('', '');

  function runSearch() {
    fetchTheaters(searchInput ? searchInput.value.trim() : '', activeAmenity);
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

async function fetchTheaters(address, amenity) {
  const params = new URLSearchParams();
  if (address) params.append('address', address);
  if (amenity) params.append('amenity', amenity);
  const query = params.toString();

  try {
    const payload = await window.CineTicket.fetchJson(
      '/index.php/theater/theater/getTheaterList' + (query ? '?' + query : '')
    );
    if (payload.success) {
      renderTheaters(payload.data || []);
    } else {
      window.showToast(payload.message || 'Failed to load theaters', 'error');
    }
  } catch (_) {
    window.showToast('Unable to load theaters right now', 'error');
  }
}

function renderTheaters(theaters) {
  const theaterList = document.querySelector('.theater-list');
  if (!theaterList) return;

  const CT = window.CineTicket;
  const esc = CT.escapeHtml;

  if (!Array.isArray(theaters) || theaters.length === 0) {
    theaterList.innerHTML =
      '<div class="grid-empty-state">' +
      '<h3>No theaters matched your criteria</h3>' +
      '<p>Try clearing your location filter or choosing All Theaters.</p>' +
      '</div>';
    return;
  }

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

    theaterList.appendChild(card);
  });
}