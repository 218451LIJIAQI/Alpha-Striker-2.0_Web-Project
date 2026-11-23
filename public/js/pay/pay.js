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
  const seats = Array.from(new Set(
    (urlParams.get('seats') || '')
      .split(',')
      .map(function (s) { return s.trim().toUpperCase(); })
      .filter(function (s) { return /^[A-H](?:[1-9]|1[0-2])$/.test(s); })
  ));

  if (!movieCode || !date || !time || seats.length === 0) {
    window.showToast('Missing or invalid booking details — returning to movie selection', 'warning');
    setTimeout(function () { window.location.href = 'homepage.html'; }, 900);
    return;
  }

  const backLink = document.getElementById('back-to-seats-link');
  if (backLink) {
    backLink.href = 'booking3.html?' + new URLSearchParams({
      movie_code: movieCode,
      theater_code: theaterCode,
      date: date,
      time: time,
      seats: seats.join(','),
    }).toString();
  }

  let movieTitle = 'Selected Movie';
  let theaterName = 'Cinema Auditorium #' + theaterCode;
  let unitPrice = 0;
  let promoDiscount = 0;
  let appliedPromoCode = '';
  let pricingReady = false;

  const payBtn = document.querySelector('.pay-now-btn');
  const setText = function (id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('booking-date', date);
  setText('booking-time', time);
  setText('booking-seats', seats.join(', '));

  initPaymentMethods();
  initCardFormatting();
  initPromoCodeHandler();

  function loadCheckoutMetadata() {
    const summaryBox = document.getElementById('movie-info');
    CT.renderStateBlock(summaryBox, 'loading', 'Loading order summary...', '');

    Promise.all([
      CT.fetchJson('/index.php/movie/movies/getMovieByCode?movie_code=' + encodeURIComponent(movieCode)),
      CT.fetchJson('/index.php/theater/theater/getTheaterDetails?theater_code=' + encodeURIComponent(theaterCode)).catch(function () { return null; }),
    ]).then(function (results) {
      const moviePayload = results[0];
      const theaterPayload = results[1];

      if (theaterPayload && theaterPayload.success && theaterPayload.data) {
        theaterName = theaterPayload.data.theater_name;
      }
      setText('booking-theater', theaterName);

      if (moviePayload && moviePayload.success && moviePayload.data) {
        const movie = moviePayload.data;
        movieTitle = movie.movie_name;
        unitPrice = parseFloat(movie.money) || 39.0;
        pricingReady = true;
        if (payBtn) payBtn.disabled = false;
        renderMovieSummary(movie);
        updatePriceBreakdown();
      } else {
        pricingReady = false;
        if (payBtn) payBtn.disabled = true;
        CT.renderStateBlock(
          summaryBox,
          'error',
          'Failed to load movie pricing',
          (moviePayload && moviePayload.message) || 'Selected movie is unavailable.',
          loadCheckoutMetadata
        );
      }

      const savedPromo = sessionStorage.getItem('selectedPromoCode');
      const couponInput = document.getElementById('coupon-code');
      if (savedPromo && couponInput && !couponInput.value) {
        couponInput.value = savedPromo;
      }
    }).catch(function () {
      pricingReady = false;
      if (payBtn) payBtn.disabled = true;
      CT.renderStateBlock(
        summaryBox,
        'error',
        'Unable to load order details',
        'Please check your connection and click Retry.',
        loadCheckoutMetadata
      );
    });
  }

  loadCheckoutMetadata();

  payBtn?.addEventListener('click', async function () {
    if (!pricingReady) {
      window.showToast('Order pricing is still loading, please wait', 'warning');
      return;
    }

    const checkedRadio = document.querySelector('input[name="payment"]:checked');
    const selectedMethod = checkedRadio ? checkedRadio.value : 'card';

    if (selectedMethod === 'card' && !validateCardInputs()) {
      return;
    }

    const originalMarkup = payBtn.innerHTML;
    payBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Processing...</span>';
    payBtn.disabled = true;

    const clientTotals = CT.calcCheckoutTotals(unitPrice, seats.length, promoDiscount);

    try {
      const payload = await CT.fetchJson('/index.php/movie/seat/saveSeats', {
        method: 'POST',
        body: {
          movie_code: movieCode,
          theater_code: theaterCode,
          date: date,
          time: time,
          seat_nums: seats,
          promo_code: appliedPromoCode || undefined,
        },
      });

      if (payload.success && payload.data) {
        sessionStorage.removeItem('selectedPromoCode');
        const serverPricing = payload.data.pricing || {};
        const authoritativeTotal = serverPricing.total_paid !== undefined
          ? Number(serverPricing.total_paid).toFixed(2)
          : clientTotals.totalPaid.toFixed(2);

        sessionStorage.setItem('lastBookingReceipt', JSON.stringify({
          bookingId: payload.data.booking_ref || ('BK-' + Date.now().toString().slice(-6)),
          movieCode: movieCode,
          movieTitle: payload.data.movie_name || movieTitle,
          theaterCode: theaterCode,
          theaterName: payload.data.theater_name || theaterName,
          date: date,
          time: time,
          seats: payload.data.seats || seats,
          seatCodes: payload.data.seat_codes || [],
          promoCode: payload.data.promo_code || appliedPromoCode || null,
          totalPaid: authoritativeTotal,
          paymentMethod: selectedMethod,
        }));
        window.location.href = 'paysuccess.html';
      } else {
        window.showToast(payload.message || 'Seat booking failed', 'error');
        payBtn.innerHTML = originalMarkup;
        payBtn.disabled = false;
      }
    } catch (_) {
      window.showToast('Network error while completing payment', 'error');
      payBtn.innerHTML = originalMarkup;
      payBtn.disabled = false;
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
      '<div class="meta-item"><i class="fas fa-film"></i> ' + esc(movie.movie_type) + '</div>' +
      '<div class="meta-item"><i class="fas fa-clock"></i> ' + esc(movie.times) + '</div>' +
      '<div class="meta-item"><i class="fas fa-star"></i> ' + esc(movie.star) + ' / 5.0</div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }

  function initPaymentMethods() {
    const cards = document.querySelectorAll('.payment-method-card');
    const cardForm = document.getElementById('card-form');

    cards.forEach(function (card) {
      const chooseCard = function () {
        cards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          if (cardForm) cardForm.style.display = radio.value === 'card' ? 'block' : 'none';
        }
      };
      card.addEventListener('click', chooseCard);
      CT.bindActivateKey(card, chooseCard);
    });
  }

  function initCardFormatting() {
    document.getElementById('card-number')?.addEventListener('input', function (e) {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
      e.target.value = (digits.match(/.{1,4}/g) || []).join(' ');
    });
    document.getElementById('expiry')?.addEventListener('input', function (e) {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
      e.target.value = digits.length >= 3 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
    });
    document.getElementById('cvv')?.addEventListener('input', function (e) {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  function initPromoCodeHandler() {
    const couponInput = document.getElementById('coupon-code');
    const verifyBtn = document.getElementById('verify-coupon');
    if (!couponInput || !verifyBtn) return;

    document.querySelectorAll('.promo-tag').forEach(function (tag) {
      const applySuggestion = function () {
        couponInput.value = tag.textContent.trim();
        verifyBtn.click();
      };
      tag.addEventListener('click', applySuggestion);
      CT.bindActivateKey(tag, applySuggestion);
    });

    couponInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        verifyBtn.click();
      }
    });

    couponInput.addEventListener('input', function () {
      if (appliedPromoCode && couponInput.value.trim().toUpperCase() !== appliedPromoCode) {
        appliedPromoCode = '';
        promoDiscount = 0;
        couponInput.style.borderColor = '';
        updatePriceBreakdown();
      }
    });

    verifyBtn.addEventListener('click', async function () {
      const code = couponInput.value.trim().toUpperCase();
      if (!code) {
        appliedPromoCode = '';
        promoDiscount = 0;
        updatePriceBreakdown();
        window.showToast('Please enter a promo code', 'warning');
        return;
      }

      const originalText = verifyBtn.innerHTML;
      verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
      verifyBtn.disabled = true;

      try {
        const params = new URLSearchParams({
          badge: code,
          movie_code: movieCode,
          date: date,
        });
        const payload = await CT.fetchJson('/index.php/offer/offer/getMoneyByBadge?' + params.toString());
        if (payload.success && payload.data && payload.data.money !== undefined) {
          appliedPromoCode = String(payload.data.promo_code || code).toUpperCase();
          promoDiscount = parseFloat(payload.data.money) || 0;
          couponInput.style.borderColor = '#16a34a';
          window.showToast('Promo code ' + appliedPromoCode + ' applied (-$' + promoDiscount.toFixed(2) + ')', 'success');
        } else {
          appliedPromoCode = '';
          promoDiscount = 0;
          couponInput.style.borderColor = '#dc2626';
          window.showToast(payload.message || 'Invalid promo code', 'error');
        }
        updatePriceBreakdown();
      } catch (_) {
        window.showToast('Could not verify promo code', 'error');
      } finally {
        verifyBtn.innerHTML = originalText;
        verifyBtn.disabled = false;
      }
    });
  }

  function validateCardInputs() {
    const cardNumber = (document.getElementById('card-number')?.value || '').replace(/\s/g, '');
    const expiry = (document.getElementById('expiry')?.value || '').trim();
    const cvv = (document.getElementById('cvv')?.value || '').trim();
    const holder = (document.getElementById('cardholder-name')?.value || '').trim();

    if (!/^\d{13,19}$/.test(cardNumber)) {
      window.showToast('Please enter a valid 13-19 digit card number', 'error');
      return false;
    }
    const expMatch = expiry.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    if (!expMatch) {
      window.showToast('Please enter a valid expiry date (MM/YY)', 'error');
      return false;
    }
    const expMonth = parseInt(expMatch[1], 10);
    const expYear = 2000 + parseInt(expMatch[2], 10);
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    if (expYear < curYear || (expYear === curYear && expMonth < curMonth)) {
      window.showToast('This card has expired — please check the expiry date', 'error');
      return false;
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      window.showToast('Please enter a valid 3 or 4 digit CVV', 'error');
      return false;
    }
    if (!holder) {
      window.showToast('Please enter the cardholder name', 'error');
      return false;
    }
    return true;
  }

  function updatePriceBreakdown() {
    const totals = CT.calcCheckoutTotals(unitPrice, seats.length, promoDiscount);
    const totalDiscount = +(totals.groupDiscount + totals.promoDiscount).toFixed(2);
    const totalStr = '$' + totals.totalPaid.toFixed(2);

    setText('total-price', '$' + totals.subtotal.toFixed(2));
    setText('tax-amount', '$' + totals.serviceFee.toFixed(2));
    setText('amount-due', totalStr);
    setText('final-amount', totalStr);

    const discountRow = document.getElementById('discount-row');
    if (discountRow) {
      discountRow.style.display = totalDiscount > 0 ? 'flex' : 'none';
      setText('discount-amount', '-$' + totalDiscount.toFixed(2));
    }
  }
});