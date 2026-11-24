/**
 * Promotional Offers & Promo Code Controller
 * Supports URL query deep-linking (?type=), refresh recovery, popstate sync, and persistent field error highlighting.
 */
(function () {
  'use strict';

  let requestSeq = 0;

  function syncOfferUrl(offerType) {
    if (!window.history || typeof window.history.pushState !== 'function') return;
    const params = new URLSearchParams();
    if (offerType) params.set('type', offerType);
    const qs = params.toString();
    const nextUrl = window.location.pathname + (qs ? '?' + qs : '');
    const curUrl = window.location.pathname + (window.location.search || '');
    if (nextUrl !== curUrl) {
      window.history.pushState(null, '', nextUrl);
    }
  }

  function renderOfferError(message, onRetry) {
    const containers = document.querySelectorAll('.offers-container');
    const featuredContainer = containers[0];
    const moreContainer = containers[1];
    if (!featuredContainer) return;
    if (moreContainer) {
      moreContainer.innerHTML = '';
      moreContainer.closest('section')?.classList.add('is-hidden');
    }
    window.CineTicket.renderStateCard(featuredContainer, {
      heading: 'Unable to load offers',
      message: message || 'Promotional offers could not be loaded right now. Please try again.',
      actionLabel: 'Retry Offers',
      onAction: onRetry,
      isError: true,
    });
  }

  async function fetchOffers(offerType, onReset) {
    const seq = ++requestSeq;
    const url = '/index.php/offer/offer/getOfferList' +
      (offerType ? '?offer_type=' + encodeURIComponent(offerType) : '');
    const retry = function () { fetchOffers(offerType, onReset); };

    try {
      const payload = await window.CineTicket.fetchJson(url);
      if (seq !== requestSeq) return;
      if (payload.httpStatus === 401 && window.CineTicket.AuthStore.getUser().isLoggedIn) {
        window.CineTicket.AuthStore.clearLocal();
        return;
      }
      if (payload.success) {
        renderOffers(payload.data || [], onReset);
      } else {
        const msg = payload.message || 'Failed to load offers';
        window.showToast(msg, 'error');
        renderOfferError(msg, retry);
      }
    } catch (_) {
      if (seq !== requestSeq) return;
      window.showToast('Unable to load offers right now', 'error');
      renderOfferError('Promotional offers service is temporarily unreachable.', retry);
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

  function renderOffers(offers, onReset) {
    const containers = document.querySelectorAll('.offers-container');
    const featuredContainer = containers[0];
    const moreContainer = containers[1];
    if (!featuredContainer) return;

    featuredContainer.innerHTML = '';
    if (moreContainer) moreContainer.innerHTML = '';
    const moreSection = moreContainer ? moreContainer.closest('section') : null;

    if (!Array.isArray(offers) || offers.length === 0) {
      window.CineTicket.renderStateCard(featuredContainer, {
        heading: 'No active offers in this category',
        message: 'Select All Offers to view active student, weekday, and VIP promotions.',
        actionLabel: 'Show All Offers',
        onAction: onReset,
      });
      if (moreSection) moreSection.classList.add('is-hidden');
      return;
    }

    offers.slice(0, 3).forEach(function (offer) {
      featuredContainer.appendChild(createOfferCard(offer));
    });

    const remaining = offers.slice(3);
    if (moreContainer) {
      if (remaining.length > 0) {
        if (moreSection) moreSection.classList.remove('is-hidden');
        remaining.forEach(function (offer) {
          moreContainer.appendChild(createOfferCard(offer));
        });
      } else if (moreSection) {
        moreSection.classList.add('is-hidden');
      }
    }
  }

  function createOfferCard(offer) {
    const CT = window.CineTicket;
    const esc = CT.escapeHtml;

    const card = document.createElement('article');
    card.className = 'offer-card';
    if (offer.offer_type === 'Student Deals') card.classList.add('offer-special-student');
    else if (offer.offer_type === 'Weekday Specials') card.classList.add('offer-special-wednesday');

    const badgeText = offer.is_exclusive
      ? 'MEMBER EXCLUSIVE'
      : (offer.badge ? String(offer.badge).trim() : '');
    const badgeClass = badgeText ? badgeText.toLowerCase().replace(/\s+/g, '-') : '';
    const savings = offer.money !== undefined && offer.money !== null ? 'Save $' + parseFloat(offer.money).toFixed(2) : '';
    const validityLabel = offer.offer_validity
      ? 'Valid until ' + offer.offer_validity + (savings ? ' • ' + savings : '')
      : (savings || 'Limited-time offer');
    const movieCount = Array.isArray(offer.movie_codes) ? offer.movie_codes.length : 0;
    const targetUrl = movieCount === 1
      ? CT.pageUrl('booking3.html?movie_code=' + encodeURIComponent(offer.movie_codes[0]))
      : CT.pageUrl('homepage.html');

    card.innerHTML =
      (badgeText ? '<span class="offer-badge ' + esc(badgeClass) + '">' + esc(badgeText) + '</span>' : '') +
      '<div class="offer-image"><img src="' + esc(CT.resolveAssetUrl(offer.img)) + '" alt="' + esc(offer.offer_title) + '" loading="lazy"></div>' +
      '<div class="offer-content">' +
      '<h3 class="offer-title">' + esc(offer.offer_title) + '</h3>' +
      '<p class="offer-description">' + esc(offer.offer_description) + '</p>' +
      '<div class="promo-code"><span>' + esc(offer.promo_code) + '</span><button type="button" class="copy-code" aria-label="Copy promo code ' + esc(offer.promo_code) + '">COPY</button></div>' +
      '<div class="offer-validity tabular-nums"><i class="fas fa-calendar-alt" aria-hidden="true"></i> <span>' + esc(validityLabel) + '</span></div>' +
      '<a href="' + esc(targetUrl) + '" class="claim-offer">Use on Booking</a>' +
      '<button type="button" class="terms-link">Terms &amp; Conditions</button>' +
      '</div>';

    const promoCode = String(offer.promo_code || '').trim().toUpperCase();
    card.querySelector('.copy-code').addEventListener('click', function () {
      copyPromoText(promoCode);
    });

    card.querySelector('.claim-offer').addEventListener('click', function (e) {
      e.preventDefault();
      sessionStorage.setItem('selectedPromoCode', promoCode);
      copyPromoText(promoCode);
      setTimeout(function () {
        window.location.href = targetUrl;
      }, 280);
    });

    card.querySelector('.terms-link').addEventListener('click', function () {
      const scopeNote = movieCount > 0 ? (' Valid across ' + movieCount + ' scheduled title(s).') : '';
      window.showToast(
        'Enter code ' + promoCode + ' at checkout before ' + (offer.offer_validity || 'expiry') + '. Limit one promo code per order.' + scopeNote,
        'info',
        offer.offer_title || 'Offer Terms'
      );
    });

    return card;
  }

  document.addEventListener('DOMContentLoaded', async function () {
    const featuredContainer = document.querySelector('.featured-offers .offers-container');
    if (!featuredContainer) return;

    const CT = window.CineTicket;
    const tabButtons = document.querySelectorAll('.filter-tabs button');
    let activeType = '';

    function syncOfferPills() {
      CT.activatePill(tabButtons, function (btn, idx) {
        if (!activeType) return idx === 0;
        return btn.textContent.trim().toLowerCase() === activeType.toLowerCase();
      });
    }

    function resetAllOffers() {
      activeType = '';
      syncOfferPills();
      syncOfferUrl('');
      fetchOffers('', resetAllOffers);
    }

    function applyFromUrl() {
      activeType = (new URLSearchParams(window.location.search).get('type') || '').trim();
      syncOfferPills();
      fetchOffers(activeType, resetAllOffers);
    }

    await CT.AuthStore.syncSession();
    applyFromUrl();

    window.addEventListener('popstate', applyFromUrl);
    window.addEventListener('cinetix:authchange', function () {
      fetchOffers(activeType, resetAllOffers);
    });

    tabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        const label = button.textContent.trim();
        activeType = label === 'All Offers' ? '' : label;
        syncOfferPills();
        syncOfferUrl(activeType);
        fetchOffers(activeType, resetAllOffers);
      });
    });

    const form = document.querySelector('.newsletter-form');
    form?.addEventListener('submit', function (e) {
      e.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const email = emailInput ? emailInput.value.trim() : '';
      if (!CT.isValidEmail(email)) {
        CT.flagFieldError(emailInput, 'Please enter a valid email address');
        window.showToast('Please enter a valid email address', 'warning');
        return;
      }
      CT.clearFieldError(emailInput);
      emailInput.value = '';
      window.showToast('Subscribed! Exclusive cinema offers will be sent to ' + email, 'success');
    });
  });
})();