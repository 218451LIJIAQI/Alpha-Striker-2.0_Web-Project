/**
 * Checkout & Payment Processing Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const CT = window.CineTicket;
  const urlParams = new URLSearchParams(window.location.search);
  const movieCode = urlParams.get('movie_code') || '';
  const theaterCode = urlParams.get('theater_code') || '1';
  const date = urlParams.get('date') || '';
  const time = urlParams.get('time') || '';
  const allParsedSeats = CT.parseSeatCodes(urlParams.get('seats') || '');

  const layoutEl = document.querySelector('.payment-layout');
  const emptyStateEl = document.getElementById('checkout-empty-state');
  const payBtn = document.querySelector('.pay-now-btn');

  function showBlockedCheckout(heading, message, withRetry) {
    if (layoutEl) layoutEl.classList.add('is-hidden');
    if (emptyStateEl) {
      if (heading) {
        const h2 = emptyStateEl.querySelector('h2');
        if (h2) h2.textContent = heading;
      }
      if (message) {
        const p = emptyStateEl.querySelector('p');
        if (p) p.textContent = message;
      }
      const existingRetry = emptyStateEl.querySelector('.checkout-retry-btn');
      if (existingRetry) existingRetry.remove();
      if (withRetry) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn btn-primary checkout-retry-btn';
        retryBtn.textContent = 'Retry Loading Checkout';
        retryBtn.addEventListener('click', function () {
          emptyStateEl.classList.add('is-hidden');
          if (layoutEl) layoutEl.classList.remove('is-hidden');
          loadCheckoutContext();
        });
        emptyStateEl.querySelector('.empty-context-actions')?.prepend(retryBtn);
      }
      emptyStateEl.classList.remove('is-hidden');
    }
    if (payBtn) payBtn.disabled = true;
  }

  if (
    !/^\d+$/.test(movieCode) ||
    parseInt(movieCode, 10) <= 0 ||
    !/^\d+$/.test(theaterCode) ||
    parseInt(theaterCode, 10) <= 0 ||
    !CT.isValidIsoDate(date) ||
    !time ||
    allParsedSeats.length === 0
  ) {
    showBlockedCheckout();
    window.showToast('No active seat selection found — choose a movie and seats first', 'info');
    return;
  }

  if (allParsedSeats.length > 10) {
    window.showToast('Maximum 10 seats allowed per transaction', 'warning');
  }
  const seats = allParsedSeats.slice(0, 10);

  let movieTitle = 'Selected Movie';
  let theaterName = 'Cinema Auditorium #' + theaterCode;
  let unitPrice = 39.0;
  let promoDiscount = 0;
  let appliedPromoCode = '';
  let isSubmitting = false;
  let isVerifyingPromo = false;
  let promoVerifySeq = 0;
  let contextVerified = false;

  function syncPayButtonState() {
    if (payBtn) {
      payBtn.disabled = !contextVerified || isSubmitting || isVerifyingPromo;
    }
  }

  const setText = function (id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  function buildSeatsHref(seatArray) {
    const params = new URLSearchParams({
      movie_code: movieCode,
      theater_code: theaterCode,
      date: date,
      time: time,
    });
    if (seatArray.length) {
      params.set('seats', seatArray.join(','));
    }
    return 'booking3.html?' + params.toString();
  }

  const backToSeatsHref = buildSeatsHref(seats);

  const stepSeats = document.getElementById('step-select-seats');
  if (stepSeats) {
    stepSeats.addEventListener('click', function () {
      window.location.href = backToSeatsHref;
    });
    stepSeats.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = backToSeatsHref;
      }
    });
  }

  const modifyLink = document.getElementById('modify-seats-link');
  if (modifyLink) {
    modifyLink.href = backToSeatsHref;
  }

  setText('booking-date', date);
  setText('booking-time', time);
  setText('booking-seats', seats.join(', '));
  syncPayButtonState();

  initPaymentMethods();
  initCardFormatting();
  const bindPromoTags = initPromoCodeHandler();

  async function refreshEligiblePromoTags() {
    const suggestionsEl = document.querySelector('.promo-suggestions');
    if (!suggestionsEl) return;
    try {
      const offerRes = await CT.fetchJson('/index.php/offer/offer/getOfferList?movie_code=' + encodeURIComponent(movieCode));
      if (!offerRes || !offerRes.success || !Array.isArray(offerRes.data)) return;
      if (offerRes.data.length === 0) {
        suggestionsEl.innerHTML = '';
        return;
      }
      suggestionsEl.innerHTML = offerRes.data.slice(0, 5).map(function (o) {
        const code = CT.escapeHtml(o.promo_code);
        const label = o.is_exclusive ? (code + ' ★') : code;
        return '<button type="button" class="promo-tag" data-code="' + code + '">' + label + '</button>';
      }).join('');
      bindPromoTags();
    } catch (_) {
      // Retain static fallback promo chips when offline
    }
  }

  function loadCheckoutContext() {
    contextVerified = false;
    syncPayButtonState();

    Promise.all([
      CT.fetchJson('/index.php/movie/movies/getMovieByCode?movie_code=' + encodeURIComponent(movieCode)),
      CT.fetchJson('/index.php/theater/theater/getTheaterDetails?theater_code=' + encodeURIComponent(theaterCode)).catch(function () { return null; }),
      refreshEligiblePromoTags(),
    ]).then(function (results) {
      const moviePayload = results[0];
      const theaterPayload = results[1];

      if (!moviePayload || !moviePayload.success || !moviePayload.data) {
        showBlockedCheckout('Screening Unavailable', (moviePayload && moviePayload.message) || 'The requested movie could not be found.');
        window.showToast((moviePayload && moviePayload.message) || 'Movie not found', 'error');
        return;
      }
      if (theaterPayload && !theaterPayload.success) {
        showBlockedCheckout('Theater Unavailable', theaterPayload.message || 'The requested theater could not be found.');
        window.showToast(theaterPayload.message || 'Theater not found', 'error');
        return;
      }

      const movie = moviePayload.data;
      if (Array.isArray(movie.theater_codes) && !movie.theater_codes.includes(parseInt(theaterCode, 10))) {
        showBlockedCheckout('Unscheduled Screening', 'This movie is not currently scheduled at the selected theater.');
        window.showToast('Selected movie is not scheduled at this theater', 'error');
        return;
      }

      if (theaterPayload && theaterPayload.success && theaterPayload.data) {
        theaterName = theaterPayload.data.theater_name;
      }
      setText('booking-theater', theaterName);

      movieTitle = movie.movie_name;
      unitPrice = parseFloat(movie.money) || 39.0;
      contextVerified = true;
      syncPayButtonState();
      renderMovieSummary(movie);
      updatePriceBreakdown();

      const savedPromo = sessionStorage.getItem('selectedPromoCode');
      const couponInput = document.getElementById('coupon-code');
      if (savedPromo && couponInput && !couponInput.value) {
        couponInput.value = savedPromo.trim().toUpperCase();
        syncPromoClearButton();
      }
    }).catch(function () {
      showBlockedCheckout('Connection Error', 'Unable to load screening details from the box office server. Please retry.', true);
      window.showToast('Unable to load order details', 'error');
    });
  }

  loadCheckoutContext();
  window.addEventListener('cinetix:authchange', refreshEligiblePromoTags);

  payBtn?.addEventListener('click', async function () {
    if (isSubmitting || isVerifyingPromo || !contextVerified) return;

    const checkedRadio = document.querySelector('input[name="payment"]:checked');
    const selectedMethod = checkedRadio ? checkedRadio.value : 'card';

    if (selectedMethod === 'card' && !validateCardInputs()) {
      return;
    }

    isSubmitting = true;
    const originalMarkup = payBtn.innerHTML;
    payBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> <span>Processing...</span>';
    syncPayButtonState();

    try {
      const payload = await CT.fetchJson('/index.php/movie/seat/saveSeats', {
        method: 'POST',
        body: {
          movie_code: movieCode,
          theater_code: theaterCode,
          date: date,
          time: time,
          seat_nums: seats,
          promo_code: appliedPromoCode,
          payment_method: selectedMethod,
        },
      });

      if (payload.success && payload.data) {
        const serverData = payload.data;
        const serverPricing = serverData.pricing || CT.calculateCheckoutPricing(unitPrice, seats.length, promoDiscount);

        sessionStorage.removeItem('selectedPromoCode');
        sessionStorage.setItem('lastBookingReceipt', JSON.stringify({
          bookingId: serverData.receipt_no || ('BK-' + Date.now().toString().slice(-6)),
          movieCode: Number(serverData.movie_code || movieCode),
          theaterCode: Number(serverData.theater_code || theaterCode),
          movieTitle: serverData.movie_name || movieTitle,
          theaterName: serverData.theater_name || theaterName,
          date: serverData.date || date,
          time: serverData.time || time,
          seats: Array.isArray(serverData.seats) ? serverData.seats : seats,
          promoCode: serverData.promo_code || appliedPromoCode || '',
          subtotal: Number(serverPricing.subtotal || 0).toFixed(2),
          groupDiscount: Number(serverPricing.group_discount ?? serverPricing.groupDiscount ?? 0).toFixed(2),
          promoDiscount: Number(serverPricing.promo_discount ?? serverPricing.promoDiscount ?? 0).toFixed(2),
          totalDiscount: Number(serverPricing.total_discount ?? serverPricing.totalDiscount ?? 0).toFixed(2),
          serviceFee: Number(serverPricing.service_fee ?? serverPricing.serviceFee ?? 2.50).toFixed(2),
          totalPaid: Number(serverPricing.total_amount ?? serverPricing.totalAmount ?? 0).toFixed(2),
          paymentMethod: serverData.payment_method || selectedMethod,
        }));
        window.location.href = 'paysuccess.html';
        return;
      }

      if (payload.httpStatus === 409 && payload.data && Array.isArray(payload.data.conflict_seats)) {
        const conflicts = new Set(payload.data.conflict_seats);
        const remainingSeats = seats.filter(function (s) { return !conflicts.has(s); });
        const conflictBanner = document.getElementById('seat-conflict-banner');
        if (conflictBanner) {
          conflictBanner.classList.remove('is-hidden');
          conflictBanner.innerHTML =
            '<strong>Seats just taken: ' + CT.escapeHtml(payload.data.conflict_seats.join(', ')) + '.</strong> ' +
            '<a href="' + CT.escapeHtml(buildSeatsHref(remainingSeats)) + '">Return to Seat Map to pick alternative seats &rarr;</a>';
        }
      }

      window.showToast(payload.message || 'Seat booking failed', 'error');
      isSubmitting = false;
      payBtn.innerHTML = originalMarkup;
      syncPayButtonState();
      updatePriceBreakdown();
    } catch (_) {
      window.showToast('Network error while completing payment', 'error');
      isSubmitting = false;
      payBtn.innerHTML = originalMarkup;
      syncPayButtonState();
      updatePriceBreakdown();
    }
  });

  function renderMovieSummary(movie) {
    const container = document.getElementById('movie-info');
    if (!container) return;

    const esc = CT.escapeHtml;
    container.innerHTML =
      '<div class="movie-info">' +
      '<img src="' + esc(CT.resolveAssetUrl(movie.img)) + '" alt="' + esc(movie.movie_name) + '" class="movie-poster">' +
      '<div class="movie-details">' +
      '<h3>' + esc(movie.movie_name) + '</h3>' +
      '<div class="movie-meta">' +
      '<div class="meta-item"><i class="fas fa-film" aria-hidden="true"></i> ' + esc(movie.movie_type) + '</div>' +
      '<div class="meta-item"><i class="fas fa-clock" aria-hidden="true"></i> ' + esc(movie.times) + '</div>' +
      '<div class="meta-item tabular-nums"><i class="fas fa-star" aria-hidden="true"></i> ' + esc(movie.star) + ' / 5.0</div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }

  function clearFieldError(inputEl) {
    if (!inputEl) return;
    inputEl.classList.remove('input-error');
    inputEl.removeAttribute('aria-invalid');
  }

  function flagFieldError(inputEl, message) {
    if (inputEl) {
      inputEl.classList.add('input-error');
      inputEl.setAttribute('aria-invalid', 'true');
      inputEl.focus();
    }
    window.showToast(message, 'error');
    return false;
  }

  function initPaymentMethods() {
    const cards = Array.from(document.querySelectorAll('.payment-method-card'));
    const cardForm = document.getElementById('card-form');

    function selectCard(card) {
      cards.forEach(function (c) {
        const active = c === card;
        c.classList.toggle('active', active);
        c.setAttribute('aria-checked', String(active));
      });
      const radio = card.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        if (cardForm) cardForm.style.display = radio.value === 'card' ? 'block' : 'none';
      }
    }

    cards.forEach(function (card) {
      const isInitial = card.classList.contains('active');
      card.setAttribute('role', 'radio');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-checked', String(isInitial));
      card.addEventListener('click', function () {
        selectCard(card);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectCard(card);
        }
      });
    });
  }

  function initCardFormatting() {
    const cardNumEl = document.getElementById('card-number');
    const expiryEl = document.getElementById('expiry');
    const cvvEl = document.getElementById('cvv');
    const holderEl = document.getElementById('cardholder-name');

    cardNumEl?.addEventListener('input', function (e) {
      clearFieldError(cardNumEl);
      const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
      e.target.value = (digits.match(/.{1,4}/g) || []).join(' ');
    });
    expiryEl?.addEventListener('input', function (e) {
      clearFieldError(expiryEl);
      const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
      e.target.value = digits.length >= 3 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
    });
    cvvEl?.addEventListener('input', function (e) {
      clearFieldError(cvvEl);
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
    holderEl?.addEventListener('input', function () {
      clearFieldError(holderEl);
    });
  }

  function syncPromoClearButton() {
    const couponInput = document.getElementById('coupon-code');
    const clearBtn = document.getElementById('clear-coupon');
    if (!clearBtn || !couponInput) return;
    const hasVal = Boolean(couponInput.value.trim() || appliedPromoCode);
    clearBtn.classList.toggle('is-hidden', !hasVal);
  }

  function initPromoCodeHandler() {
    const couponInput = document.getElementById('coupon-code');
    const verifyBtn = document.getElementById('verify-coupon');
    const clearBtn = document.getElementById('clear-coupon');
    const statusNote = document.getElementById('promo-status-note');
    if (!couponInput || !verifyBtn) return function () {};

    function resetPromoState(clearInputValue) {
      promoVerifySeq += 1;
      isVerifyingPromo = false;
      syncPayButtonState();
      if (clearInputValue) {
        couponInput.value = '';
        sessionStorage.removeItem('selectedPromoCode');
      }
      appliedPromoCode = '';
      promoDiscount = 0;
      couponInput.style.borderColor = '';
      if (statusNote) {
        statusNote.textContent = '';
        statusNote.className = 'promo-status-note is-hidden';
      }
      syncPromoClearButton();
      updatePriceBreakdown();
    }

    function bindTagButtons() {
      document.querySelectorAll('.promo-tag').forEach(function (tag) {
        if (tag.dataset.bound === 'true') return;
        tag.dataset.bound = 'true';
        tag.addEventListener('click', function () {
          const code = (tag.dataset.code || tag.textContent || '').trim().toUpperCase();
          couponInput.value = code;
          syncPromoClearButton();
          verifyBtn.click();
        });
      });
    }

    couponInput.addEventListener('input', function () {
      syncPromoClearButton();
      if (appliedPromoCode && couponInput.value.trim().toUpperCase() !== appliedPromoCode) {
        resetPromoState(false);
      }
    });

    couponInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyBtn.click();
      }
    });

    clearBtn?.addEventListener('click', function () {
      const hadApplied = Boolean(appliedPromoCode);
      resetPromoState(true);
      if (hadApplied) {
        window.showToast('Promo code removed — original price restored', 'info');
      }
    });

    bindTagButtons();

    verifyBtn.addEventListener('click', async function () {
      const code = couponInput.value.trim().toUpperCase();
      couponInput.value = code;
      if (!code) {
        resetPromoState(false);
        window.showToast('Please enter a promo code', 'warning');
        return;
      }

      const seq = ++promoVerifySeq;
      isVerifyingPromo = true;
      syncPayButtonState();
      const originalText = verifyBtn.innerHTML;
      verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Checking...';
      verifyBtn.disabled = true;

      try {
        const params = new URLSearchParams({
          badge: code,
          movie_code: movieCode,
          seat_count: String(seats.length),
          date: date,
        });
        const payload = await CT.fetchJson('/index.php/offer/offer/getMoneyByBadge?' + params.toString());
        if (seq !== promoVerifySeq) return;
        if (payload.success && payload.data && payload.data.money !== undefined) {
          promoDiscount = parseFloat(payload.data.money) || 0;
          appliedPromoCode = payload.data.promo_code || code;
          couponInput.style.borderColor = '#15803d';
          if (statusNote) {
            statusNote.textContent = 'Applied ' + appliedPromoCode + ' (-$' + promoDiscount.toFixed(2) + ')';
            statusNote.className = 'promo-status-note success';
          }
          window.showToast('Promo code ' + appliedPromoCode + ' applied (-$' + promoDiscount.toFixed(2) + ')', 'success');
        } else {
          promoDiscount = 0;
          appliedPromoCode = '';
          couponInput.style.borderColor = '#dc2626';
          if (statusNote) {
            statusNote.textContent = payload.message || 'Invalid promo code';
            statusNote.className = 'promo-status-note error';
          }
          window.showToast(payload.message || 'Invalid promo code', 'error');
        }
        syncPromoClearButton();
        updatePriceBreakdown();
      } catch (_) {
        if (seq === promoVerifySeq) {
          window.showToast('Could not verify promo code', 'error');
        }
      } finally {
        if (seq === promoVerifySeq) {
          isVerifyingPromo = false;
          verifyBtn.innerHTML = originalText;
          verifyBtn.disabled = false;
          syncPayButtonState();
        }
      }
    });

    return bindTagButtons;
  }

  function validateCardInputs() {
    const cardNumEl = document.getElementById('card-number');
    const expiryEl = document.getElementById('expiry');
    const cvvEl = document.getElementById('cvv');
    const holderEl = document.getElementById('cardholder-name');

    const cardNumber = (cardNumEl?.value || '').replace(/\s/g, '');
    const expiry = (expiryEl?.value || '').trim();
    const cvv = (cvvEl?.value || '').trim();
    const holder = (holderEl?.value || '').trim();

    [cardNumEl, expiryEl, cvvEl, holderEl].forEach(clearFieldError);

    if (!/^\d{13,19}$/.test(cardNumber)) {
      return flagFieldError(cardNumEl, 'Please enter a valid 13-19 digit card number');
    }
    if (!/^(0[1-9]|1[0-2])\/(\d{2})$/.test(expiry)) {
      return flagFieldError(expiryEl, 'Please enter a valid expiry date (MM/YY)');
    }
    if (!CT.isCardExpiryValid(expiry)) {
      return flagFieldError(expiryEl, 'This card has expired — please enter a future expiry date');
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      return flagFieldError(cvvEl, 'Please enter a valid 3 or 4 digit CVV');
    }
    if (!holder) {
      return flagFieldError(holderEl, 'Please enter the cardholder name');
    }
    return true;
  }

  function updatePriceBreakdown() {
    const pricing = CT.calculateCheckoutPricing(unitPrice, seats.length, promoDiscount);
    const totalStr = '$' + pricing.totalAmount.toFixed(2);

    setText('total-price', '$' + pricing.subtotal.toFixed(2));
    setText('amount-due', totalStr);
    setText('final-amount', totalStr);

    const discountRow = document.getElementById('discount-row');
    const discountLabel = document.getElementById('discount-label');
    if (discountRow) {
      discountRow.classList.toggle('is-hidden', pricing.totalDiscount <= 0);
      setText('discount-amount', '-$' + pricing.totalDiscount.toFixed(2));
      if (discountLabel) {
        const parts = [];
        if (pricing.groupDiscount > 0) parts.push('30% Group');
        if (pricing.promoDiscount > 0 && appliedPromoCode) parts.push(appliedPromoCode);
        discountLabel.textContent = parts.length ? ('Discount (' + parts.join(' + ') + ')') : 'Discount';
      }
    }
  }
});