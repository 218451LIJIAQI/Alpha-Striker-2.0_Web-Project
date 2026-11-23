/**
 * Promotional Offers & Promo Code Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const featuredContainer = document.querySelector('.featured-offers .offers-container');
  if (!featuredContainer) return;

  const tabButtons = document.querySelectorAll('.filter-tabs button');
  fetchOffers('');

  tabButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      tabButtons.forEach(function (btn) { btn.classList.remove('active'); });
      this.classList.add('active');
      const label = this.textContent.trim();
      fetchOffers(label === 'All Offers' ? '' : label);
    });
  });

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
    emailInput.value = '';
    window.showToast('Subscribed! Exclusive cinema offers will be sent to ' + email, 'success');
  });
});

async function fetchOffers(offerType) {
  const url = '/index.php/offer/offer/getOfferList' +
    (offerType ? '?offer_type=' + encodeURIComponent(offerType) : '');

  try {
    const payload = await window.CineTicket.fetchJson(url);
    if (payload.success) {
      renderOffers(payload.data || []);
    } else {
      window.showToast(payload.message || 'Failed to load offers', 'error');
    }
  } catch (_) {
    window.showToast('Unable to load offers right now', 'error');
  }
}

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
    featuredContainer.innerHTML =
      '<div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px;">' +
      '<h3>No active offers in this category</h3>' +
      '</div>';
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
  const validityLabel = offer.offer_validity
    ? 'Valid until ' + offer.offer_validity + (savings ? ' • ' + savings : '')
    : (savings || 'Limited-time offer');

  card.innerHTML =
    (badgeText ? '<span class="offer-badge ' + esc(badgeClass) + '">' + esc(badgeText) + '</span>' : '') +
    '<div class="offer-image"><img src="' + esc(CT.resolveAssetUrl(offer.img)) + '" alt="' + esc(offer.offer_title) + '"></div>' +
    '<div class="offer-content">' +
    '<h3 class="offer-title">' + esc(offer.offer_title) + '</h3>' +
    '<p class="offer-description">' + esc(offer.offer_description) + '</p>' +
    '<div class="promo-code"><span>' + esc(offer.promo_code) + '</span><button type="button" class="copy-code">COPY</button></div>' +
    '<div class="offer-validity"><span>📅</span> <span>' + esc(validityLabel) + '</span></div>' +
    '<a href="' + esc(CT.pageUrl('homepage.html')) + '" class="claim-offer">Use on Booking</a>' +
    '<a href="#" class="terms-link">Terms &amp; Conditions</a>' +
    '</div>';

  const promoCode = String(offer.promo_code || '');
  card.querySelector('.copy-code').addEventListener('click', function () {
    copyPromoText(promoCode);
  });

  card.querySelector('.claim-offer').addEventListener('click', function (e) {
    e.preventDefault();
    sessionStorage.setItem('selectedPromoCode', promoCode);
    copyPromoText(promoCode);
    setTimeout(function () {
      window.location.href = CT.pageUrl('homepage.html');
    }, 450);
  });

  card.querySelector('.terms-link').addEventListener('click', function (e) {
    e.preventDefault();
    window.showToast(
      'Enter code ' + promoCode + ' at checkout before ' + (offer.offer_validity || 'expiry') + '. Limit one promo code per order.',
      'info',
      offer.offer_title || 'Offer Terms'
    );
  });

  return card;
}