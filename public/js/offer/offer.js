/**
 * Promotional Offers & Promo Code Controller
 */
let totalCatalogMoviesCount = 0;

document.addEventListener('DOMContentLoaded', function () {
  const featuredContainer = document.querySelector('.featured-offers .offers-container');
  if (!featuredContainer) return;

  const tabButtons = document.querySelectorAll('.filter-tabs button');
  let requestSeq = 0;

  window.CineTicket.fetchJson('/index.php/movie/movies/getMovieList')
    .then(function (res) {
      if (res && res.success && Array.isArray(res.data)) {
        totalCatalogMoviesCount = res.data.length;
      }
    })
    .catch(function () {})
    .finally(function () {
      fetchOffers('');
    });

  tabButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      tabButtons.forEach(function (btn) { btn.classList.remove('active'); });
      this.classList.add('active');
      const label = this.textContent.trim();
      fetchOffers(label === 'All Offers' ? '' : label);
    });
  });

  async function fetchOffers(offerType) {
    const seq = ++requestSeq;
    const CT = window.CineTicket;
    const url = '/index.php/offer/offer/getOfferList' +
      (offerType ? '?offer_type=' + encodeURIComponent(offerType) : '');

    CT.renderStateBlock(featuredContainer, 'loading', 'Loading promotional offers...', 'Checking active promo codes and cinema perks.');

    try {
      const payload = await CT.fetchJson(url);
      if (seq !== requestSeq) return;
      if (payload.success) {
        renderOffers(payload.data || []);
      } else {
        CT.renderStateBlock(
          featuredContainer,
          'error',
          'Failed to load offers',
          payload.message || 'Could not retrieve active promotions.',
          function () { fetchOffers(offerType); }
        );
      }
    } catch (_) {
      if (seq !== requestSeq) return;
      CT.renderStateBlock(
        featuredContainer,
        'error',
        'Unable to load offers right now',
        'Please check your connection and click Retry.',
        function () { fetchOffers(offerType); }
      );
    }
  }

  const form = document.querySelector('.newsletter-form');
  form?.addEventListener('submit', function (e) {
    e.preventDefault();
    const emailInput = form.querySelector('input[type="email"]');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.showToast('Please enter a valid email address', 'warning');
      emailInput?.focus();
      return;
    }
    const list = JSON.parse(localStorage.getItem('newsletterEmails') || '[]');
    if (!list.includes(email.toLowerCase())) {
      list.push(email.toLowerCase());
      localStorage.setItem('newsletterEmails', JSON.stringify(list));
    }
    emailInput.value = '';
    window.showToast('Subscribed! Exclusive cinema offers will be sent to ' + email, 'success');
  });
});

function copyPromoText(code) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(function () {
      window.showToast('Promo code "' + code + '" copied to clipboard!', 'success');
    }).catch(function () {
      window.showToast('Promo code: ' + code, 'info');
    });
  } else {
    window.showToast('Promo code: ' + code, 'info');
  }
}

function renderOffers(offers) {
  const containers = document.querySelectorAll('.offers-container');
  const featuredContainer = containers[0];
  const moreContainer = containers[1];
  if (!featuredContainer) return;

  featuredContainer.innerHTML = '';
  if (moreContainer) moreContainer.innerHTML = '';
  const moreSection = moreContainer ? moreContainer.closest('section') : null;

  if (!Array.isArray(offers) || offers.length === 0) {
    window.CineTicket.renderStateBlock(
      featuredContainer,
      'empty',
      'No active offers in this category',
      'Select All Offers to browse every available cinema promotion.'
    );
    if (moreSection) moreSection.style.display = 'none';
    return;
  }

  offers.slice(0, 3).forEach(function (offer) {
    featuredContainer.appendChild(createOfferCard(offer));
  });

  const remaining = offers.slice(3);
  if (moreContainer) {
    if (remaining.length > 0) {
      if (moreSection) moreSection.style.display = '';
      remaining.forEach(function (offer) {
        moreContainer.appendChild(createOfferCard(offer));
      });
    } else if (moreSection) {
      moreSection.style.display = 'none';
    }
  }
}

function createOfferCard(offer) {
  const CT = window.CineTicket;
  const esc = CT.escapeHtml;

  const card = document.createElement('div');
  card.className = 'offer-card';
  if (offer.offer_type === 'Student Deals') card.classList.add('offer-special-student');
  else if (offer.offer_type === 'Weekday Specials') card.classList.add('offer-special-wednesday');

  const badgeText = offer.badge ? String(offer.badge).trim() : '';
  const badgeClass = badgeText ? badgeText.toLowerCase().replace(/\s+/g, '-') : '';
  const savings = offer.money !== undefined && offer.money !== null ? 'Save $' + parseFloat(offer.money).toFixed(2) : '';
  const movieCodes = Array.isArray(offer.movie_codes) ? offer.movie_codes : [];
  const isRestricted = totalCatalogMoviesCount > 0 && movieCodes.length > 0 && movieCodes.length < totalCatalogMoviesCount;
  const scopeNote = isRestricted ? ' • ' + movieCodes.length + ' eligible film(s)' : '';
  const validityLabel = offer.offer_validity
    ? 'Valid until ' + offer.offer_validity + (savings ? ' • ' + savings : '') + scopeNote
    : (savings || 'Limited-time offer');

  const claimTarget = isRestricted && movieCodes.length === 1
    ? CT.pageUrl('booking3.html?movie_code=' + encodeURIComponent(movieCodes[0]))
    : CT.pageUrl('homepage.html');

  card.innerHTML =
    (badgeText ? '<span class="offer-badge ' + esc(badgeClass) + '">' + esc(badgeText) + '</span>' : '') +
    '<div class="offer-image"><img src="' + esc(CT.resolveAssetUrl(offer.img)) + '" alt="' + esc(offer.offer_title) + '"></div>' +
    '<div class="offer-content">' +
    '<h3 class="offer-title">' + esc(offer.offer_title) + '</h3>' +
    '<p class="offer-description">' + esc(offer.offer_description) + '</p>' +
    '<div class="promo-code"><span>' + esc(offer.promo_code) + '</span><button type="button" class="copy-code">COPY</button></div>' +
    '<div class="offer-validity"><span>📅</span> <span>' + esc(validityLabel) + '</span></div>' +
    '<a href="' + esc(claimTarget) + '" class="claim-offer">Use on Booking</a>' +
    '<a href="#terms" class="terms-link">Terms &amp; Conditions</a>' +
    '</div>';

  const fallbackImg = CT.resolveAssetUrl('img/logo.jpg');
  const imgEl = card.querySelector('.offer-image img');
  imgEl.addEventListener('error', function () {
    if (imgEl.src !== fallbackImg) imgEl.src = fallbackImg;
  });

  const promoCode = String(offer.promo_code || '');
  card.querySelector('.copy-code').addEventListener('click', function () {
    copyPromoText(promoCode);
  });

  card.querySelector('.claim-offer').addEventListener('click', function (e) {
    e.preventDefault();
    sessionStorage.setItem('selectedPromoCode', promoCode);
    copyPromoText(promoCode);
    setTimeout(function () {
      window.location.href = claimTarget;
    }, 350);
  });

  card.querySelector('.terms-link').addEventListener('click', function (e) {
    e.preventDefault();
    const movieClause = isRestricted
      ? ' Valid on ' + movieCodes.length + ' designated movie(s).'
      : ' Valid across all participating screenings.';
    window.showToast(
      'Enter code ' + promoCode + ' at checkout before ' + (offer.offer_validity || 'expiry') + '.' + movieClause + ' Limit one promo code per order.',
      'info',
      offer.offer_title || 'Offer Terms'
    );
  });

  return card;
}