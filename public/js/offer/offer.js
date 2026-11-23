/**
 * Promotional Offers & Promo Code Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const featuredContainer = document.querySelector('.featured-offers .offers-container');
  if (!featuredContainer) return;

  fetchOffers('');

  document.querySelectorAll('.filter-tabs button').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('.filter-tabs button').forEach(function (btn) {
        btn.classList.remove('active');
      });
      this.classList.add('active');

      const label = this.textContent.trim();
      const offerType = label === 'All Offers' ? '' : label;
      fetchOffers(offerType);
    });
  });

  initNewsletterForm();
});

function initNewsletterForm() {
  const form = document.querySelector('.newsletter-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const emailInput = form.querySelector('input[type="email"]');
    const email = emailInput ? emailInput.value.trim() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.showToast('Please enter a valid email address', 'warning');
      if (emailInput) emailInput.focus();
      return;
    }

    emailInput.value = '';
    window.showToast('Subscribed! Exclusive cinema offers will be sent to ' + email, 'success');
  });
}

function fetchOffers(offerType) {
  let url = '/index.php/offer/offer/getOfferList';
  if (offerType) {
    url += '?offer_type=' + encodeURIComponent(offerType);
  }

  fetch(url)
    .then(function (res) { return res.json(); })
    .then(function (payload) {
      if (payload.success) {
        renderOffers(payload.data || []);
      } else {
        window.showToast(payload.message || 'Failed to load offers', 'error');
      }
    })
    .catch(function () {
      window.showToast('Unable to load offers right now', 'error');
    });
}

function copyPromoText(code) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(function () {
      window.showToast('Promo code "' + code + '" copied to clipboard!', 'success');
    }).catch(function () {
      fallbackCopy(code);
    });
  } else {
    fallbackCopy(code);
  }
}

function fallbackCopy(code) {
  const temp = document.createElement('textarea');
  temp.value = code;
  temp.style.position = 'fixed';
  temp.style.opacity = '0';
  document.body.appendChild(temp);
  temp.select();
  try {
    document.execCommand('copy');
    window.showToast('Promo code "' + code + '" copied!', 'success');
  } catch (_) {
    window.showToast('Promo code: ' + code, 'info');
  }
  temp.remove();
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

  const featured = offers.slice(0, 3);
  const remaining = offers.slice(3);

  featured.forEach(function (offer) {
    featuredContainer.appendChild(createOfferCard(offer));
  });

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
  const esc = window.CineTicket.escapeHtml;
  const resolveAsset = window.CineTicket.resolveAssetUrl;
  const pageUrl = window.CineTicket.pageUrl;

  const card = document.createElement('div');
  card.className = 'offer-card';
  if (offer.offer_type === 'Student Deals') {
    card.classList.add('offer-special-student');
  } else if (offer.offer_type === 'Weekday Specials') {
    card.classList.add('offer-special-wednesday');
  }

  const badgeText = offer.badge ? String(offer.badge).trim() : '';
  const badgeClass = badgeText ? badgeText.toLowerCase().replace(/\s+/g, '-') : '';
  const savings = offer.money !== undefined && offer.money !== null
    ? 'Save $' + parseFloat(offer.money).toFixed(2)
    : '';
  const validityLabel = offer.offer_validity
    ? 'Valid until ' + offer.offer_validity + (savings ? ' • ' + savings : '')
    : (savings || 'Limited-time offer');

  card.innerHTML =
    (badgeText ? '<span class="offer-badge ' + esc(badgeClass) + '">' + esc(badgeText) + '</span>' : '') +
    '<div class="offer-image">' +
    '<img src="' + esc(resolveAsset(offer.img)) + '" alt="' + esc(offer.offer_title) + '">' +
    '</div>' +
    '<div class="offer-content">' +
    '<h3 class="offer-title">' + esc(offer.offer_title) + '</h3>' +
    '<p class="offer-description">' + esc(offer.offer_description) + '</p>' +
    '<div class="promo-code">' +
    '<span>' + esc(offer.promo_code) + '</span>' +
    '<button type="button" class="copy-code">COPY</button>' +
    '</div>' +
    '<div class="offer-validity">' +
    '<span>📅</span> ' +
    '<span>' + esc(validityLabel) + '</span>' +
    '</div>' +
    '<a href="' + esc(pageUrl('homepage.html')) + '" class="claim-offer">Use on Booking</a>' +
    '<a href="#" class="terms-link">Terms &amp; Conditions</a>' +
    '</div>';

  card.querySelector('.copy-code').addEventListener('click', function () {
    copyPromoText(String(offer.promo_code || ''));
  });

  card.querySelector('.claim-offer').addEventListener('click', function (e) {
    e.preventDefault();
    sessionStorage.setItem('selectedPromoCode', String(offer.promo_code || ''));
    copyPromoText(String(offer.promo_code || ''));
    setTimeout(function () {
      window.location.href = pageUrl('homepage.html');
    }, 450);
  });

  card.querySelector('.terms-link').addEventListener('click', function (e) {
    e.preventDefault();
    window.showToast(
      'Enter code ' + (offer.promo_code || '') + ' at checkout before ' + (offer.offer_validity || 'expiry') + '. Limit one promo code per order.',
      'info',
      offer.offer_title || 'Offer Terms'
    );
  });

  return card;
}