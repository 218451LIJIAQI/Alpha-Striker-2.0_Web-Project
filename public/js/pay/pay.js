/**
 * Checkout & Payment Processing Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const urlParams = new URLSearchParams(window.location.search);
  const movieCode = urlParams.get('movie_code') || '';
  const theaterCode = urlParams.get('theater_code') || '1';
  const date = urlParams.get('date') || '';
  const time = urlParams.get('time') || '';
  const rawSeats = urlParams.get('seats') || '';
  const seats = rawSeats
    .split(',')
    .map(function (s) { return s.trim().toUpperCase(); })
    .filter(Boolean);

  if (!movieCode || !date || !time || seats.length === 0) {
    window.showToast('Missing booking details — returning to movie selection', 'warning');
    setTimeout(function () {
      window.location.href = 'homepage.html';
    }, 900);
    return;
  }

  let movieTitle = 'Selected Movie';
  let theaterName = 'Cinema Auditorium #' + theaterCode;
  let subtotal = 0;
  let bulkDiscount = 0;
  let promoDiscount = 0;
  let appliedPromoCode = '';
  const serviceFee = 2.50;

  const dateEl = document.getElementById('booking-date');
  const timeEl = document.getElementById('booking-time');
  const seatsEl = document.getElementById('booking-seats');
  const theaterEl = document.getElementById('booking-theater');

  if (dateEl) dateEl.textContent = date;
  if (timeEl) timeEl.textContent = time;
  if (seatsEl) seatsEl.textContent = seats.join(', ');

  initPaymentMethods();
  initCardFormatting();
  initPromoCodeHandler();

  // Load movie & theater metadata concurrently
  Promise.all([
    fetch('/index.php/movie/movies/getMovieByCode?movie_code=' + encodeURIComponent(movieCode)).then(function (r) { return r.json(); }),
    fetch('/index.php/theater/theater/getTheaterDetails?theater_code=' + encodeURIComponent(theaterCode)).then(function (r) { return r.json(); }).catch(function () { return null; }),
  ]).then(function (results) {
    const moviePayload = results[0];
    const theaterPayload = results[1];

    if (theaterPayload && theaterPayload.success && theaterPayload.data) {
      theaterName = theaterPayload.data.theater_name;
    }
    if (theaterEl) theaterEl.textContent = theaterName;

    if (moviePayload && moviePayload.success && moviePayload.data) {
      const movie = moviePayload.data;
      movieTitle = movie.movie_name;
      renderMovieSummary(movie);

      const unitPrice = parseFloat(movie.money) || 39.0;
      subtotal = unitPrice * seats.length;
      bulkDiscount = seats.length >= 5 ? +(subtotal * 0.30).toFixed(2) : 0;
      updatePriceBreakdown();
    } else {
      window.showToast('Failed to load movie pricing', 'error');
    }

    // Auto-fill claimed promo code from Offers page if present
    const savedPromo = sessionStorage.getItem('selectedPromoCode');
    const couponInput = document.getElementById('coupon-code');
    if (savedPromo && couponInput && !couponInput.value) {
      couponInput.value = savedPromo;
    }
  }).catch(function () {
    window.showToast('Unable to load order details', 'error');
  });

  const payBtn = document.querySelector('.pay-now-btn');
  if (payBtn) {
    payBtn.addEventListener('click', async function () {
      const checkedRadio = document.querySelector('input[name="payment"]:checked');
      const selectedMethod = checkedRadio ? checkedRadio.value : 'card';

      if (selectedMethod === 'card' && !validateCardInputs()) {
        return;
      }

      const originalMarkup = payBtn.innerHTML;
      payBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Processing...</span>';
      payBtn.disabled = true;

      const user = window.CineTicket.AuthStore.getUser();
      const totalAmount = computeTotal();

      try {
        const res = await fetch('/index.php/movie/seat/saveSeats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            movie_code: movieCode,
            theater_code: theaterCode,
            date: date,
            time: time,
            seat_nums: seats,
            user_code: user.isLoggedIn ? user.userId : null,
            payment_method: selectedMethod,
            promo_code: appliedPromoCode,
            total_amount: totalAmount,
          }),
        });
        const payload = await res.json();

        if (payload.success) {
          sessionStorage.removeItem('selectedPromoCode');
          const receipt = {
            bookingId: 'BK-' + Date.now().toString().slice(-6),
            movieTitle: movieTitle,
            theaterName: theaterName,
            date: date,
            time: time,
            seats: seats,
            totalPaid: totalAmount.toFixed(2),
            paymentMethod: selectedMethod,
          };
          sessionStorage.setItem('lastBookingReceipt', JSON.stringify(receipt));
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
  }

  function renderMovieSummary(movie) {
    const container = document.getElementById('movie-info');
    if (!container) return;

    const esc = window.CineTicket.escapeHtml;
    const resolveAsset = window.CineTicket.resolveAssetUrl;

    container.innerHTML =
      '<div class="movie-info">' +
      '<img src="' + esc(resolveAsset(movie.img)) + '" alt="' + esc(movie.movie_name) + '" class="movie-poster">' +
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
      card.addEventListener('click', function () {
        cards.forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          if (cardForm) {
            cardForm.style.display = radio.value === 'card' ? 'block' : 'none';
          }
        }
      });
    });
  }

  function initCardFormatting() {
    const numberInput = document.getElementById('card-number');
    const expiryInput = document.getElementById('expiry');
    const cvvInput = document.getElementById('cvv');

    if (numberInput) {
      numberInput.addEventListener('input', function (e) {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
        e.target.value = (digits.match(/.{1,4}/g) || []).join(' ');
      });
    }
    if (expiryInput) {
      expiryInput.addEventListener('input', function (e) {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
        e.target.value = digits.length >= 3 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
      });
    }
    if (cvvInput) {
      cvvInput.addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
      });
    }
  }

  function initPromoCodeHandler() {
    const promoTags = document.querySelectorAll('.promo-tag');
    const couponInput = document.getElementById('coupon-code');
    const verifyBtn = document.getElementById('verify-coupon');
    if (!couponInput || !verifyBtn) return;

    promoTags.forEach(function (tag) {
      tag.addEventListener('click', function () {
        couponInput.value = tag.textContent.trim();
        verifyBtn.click();
      });
    });

    verifyBtn.addEventListener('click', async function () {
      const code = couponInput.value.trim().toUpperCase();
      if (!code) {
        window.showToast('Please enter a promo code', 'warning');
        return;
      }

      const originalText = verifyBtn.innerHTML;
      verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
      verifyBtn.disabled = true;

      try {
        const res = await fetch('/index.php/offer/offer/getMoneyByBadge?badge=' + encodeURIComponent(code));
        const payload = await res.json();

        if (payload.success && payload.data && payload.data.money !== undefined) {
          promoDiscount = parseFloat(payload.data.money) || 0;
          appliedPromoCode = code;
          couponInput.style.borderColor = '#16a34a';
          window.showToast('Promo code ' + code + ' applied (-$' + promoDiscount.toFixed(2) + ')', 'success');
        } else {
          promoDiscount = 0;
          appliedPromoCode = '';
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

  function computeTotal() {
    const totalDiscount = bulkDiscount + promoDiscount;
    return Math.max(0, +(subtotal - totalDiscount + serviceFee).toFixed(2));
  }

  function updatePriceBreakdown() {
    const totalDiscount = bulkDiscount + promoDiscount;
    const total = computeTotal();

    const subtotalEl = document.getElementById('total-price');
    const discountRow = document.getElementById('discount-row');
    const discountEl = document.getElementById('discount-amount');
    const dueEl = document.getElementById('amount-due');
    const finalEl = document.getElementById('final-amount');

    if (subtotalEl) subtotalEl.textContent = '$' + subtotal.toFixed(2);
    if (discountRow && discountEl) {
      if (totalDiscount > 0) {
        discountRow.style.display = 'flex';
        discountEl.textContent = '-$' + totalDiscount.toFixed(2);
      } else {
        discountRow.style.display = 'none';
      }
    }
    if (dueEl) dueEl.textContent = '$' + total.toFixed(2);
    if (finalEl) finalEl.textContent = '$' + total.toFixed(2);
  }
});