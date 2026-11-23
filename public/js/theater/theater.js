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
    const keyword = searchInput ? searchInput.value.trim() : '';
    fetchTheaters(keyword, activeAmenity);
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', runSearch);
  }
  if (searchInput) {
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
      }
    });
  }

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      filterButtons.forEach(function (btn) {
        btn.classList.remove('active');
      });
      this.classList.add('active');

      const label = this.textContent.trim();
      activeAmenity = label === 'All Theaters' ? '' : label;
      const keyword = searchInput ? searchInput.value.trim() : '';
      fetchTheaters(keyword, activeAmenity);
    });
  });
});

function fetchTheaters(address, amenity) {
  const params = new URLSearchParams();
  if (address) params.append('address', address);
  if (amenity) params.append('amenity', amenity);

  const query = params.toString();
  const url = '/index.php/theater/theater/getTheaterList' + (query ? '?' + query : '');

  fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (payload) {
      if (payload.success) {
        renderTheaters(payload.data || []);
      } else {
        window.showToast(payload.message || 'Failed to load theaters', 'error');
      }
    })
    .catch(function () {
      window.showToast('Unable to load theaters right now', 'error');
    });
}

function getStarRatingMarkup(rating) {
  const num = Math.max(0, Math.min(5, parseFloat(rating) || 0));
  const fullStars = Math.floor(num);
  const hasHalfStar = num - fullStars >= 0.5;

  let stars = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= fullStars) {
      stars += '<span class="star full">★</span>';
    } else if (i === fullStars + 1 && hasHalfStar) {
      stars += '<span class="star half">★</span>';
    } else {
      stars += '<span class="star empty">☆</span>';
    }
  }
  return stars;
}

function renderTheaters(theaters) {
  const theaterList = document.querySelector('.theater-list');
  if (!theaterList) return;

  const esc = window.CineTicket.escapeHtml;
  const resolveAsset = window.CineTicket.resolveAssetUrl;

  if (!Array.isArray(theaters) || theaters.length === 0) {
    theaterList.innerHTML =
      '<div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px;">' +
      '<h3>No theaters matched your criteria</h3>' +
      '<p style="margin-top: 8px; opacity: 0.75;">Try clearing your location filter or choosing All Theaters.</p>' +
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
      '<img src="' + esc(resolveAsset(theater.img)) + '" alt="' + esc(theater.theater_name) + '">' +
      '</div>' +
      '<div class="theater-details">' +
      '<h3>' + esc(theater.theater_name) + '</h3>' +
      '<div class="theater-location">' +
      '<span>📍</span>' +
      '<span>' + esc(theater.address) + '</span>' +
      '</div>' +
      '<div class="amenities">' +
      amenities.map(function (a) { return '<span class="amenity">' + esc(a) + '</span>'; }).join('') +
      '</div>' +
      '<div class="theater-rating">' +
      '<span>' + getStarRatingMarkup(theater.star) + '</span>' +
      '<span>' + esc(theater.star) + ' (' + esc(reviewLabel) + ')</span>' +
      '</div>' +
      '<a href="theater-details.html?theater_code=' + encodeURIComponent(theater.theater_code) + '" class="view-details">View Theater Details</a>' +
      '</div>';

    theaterList.appendChild(card);
  });
}