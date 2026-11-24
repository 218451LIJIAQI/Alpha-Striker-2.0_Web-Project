/**
 * Payment Confirmation & Authoritative Receipt Summary Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const loading = document.querySelector('.payment-loading');
  const success = document.querySelector('.payment-success');
  const emptyReceipt = document.getElementById('receipt-empty-state');
  const detailsEl = document.querySelector('.confirmation-details');

  let hasValidReceipt = false;

  try {
    const rawReceipt = sessionStorage.getItem('lastBookingReceipt');
    if (rawReceipt && detailsEl) {
      const receipt = JSON.parse(rawReceipt);
      if (receipt && receipt.bookingId) {
        hasValidReceipt = true;
        const esc = window.CineTicket.escapeHtml;
        const seatsText = Array.isArray(receipt.seats) ? receipt.seats.join(', ') : '';
        const promoLine = receipt.promoCode
          ? '<div class="detail-item"><i class="fas fa-tag" aria-hidden="true"></i><span>Promo Redeemed: <strong>' + esc(receipt.promoCode) + '</strong></span></div>'
          : '';
        const discountVal = parseFloat(receipt.totalDiscount || '0');
        const discountLine = discountVal > 0
          ? '<div class="detail-item tabular-nums"><i class="fas fa-percentage" aria-hidden="true"></i><span>Savings Applied: <strong>-$' + esc(discountVal.toFixed(2)) + '</strong></span></div>'
          : '';

        detailsEl.innerHTML =
          '<div class="detail-item tabular-nums"><i class="fas fa-ticket-alt" aria-hidden="true"></i><span>Booking Ref: <strong>#' + esc(receipt.bookingId) + '</strong></span></div>' +
          '<div class="detail-item"><i class="fas fa-film" aria-hidden="true"></i><span>Movie: <strong>' + esc(receipt.movieTitle || '-') + '</strong></span></div>' +
          '<div class="detail-item"><i class="fas fa-building" aria-hidden="true"></i><span>Theater: <strong>' + esc(receipt.theaterName || '-') + '</strong></span></div>' +
          '<div class="detail-item tabular-nums"><i class="fas fa-calendar-check" aria-hidden="true"></i><span>Showtime: <strong>' + esc((receipt.date || '') + ' ' + (receipt.time || '')) + '</strong></span></div>' +
          '<div class="detail-item tabular-nums"><i class="fas fa-chair" aria-hidden="true"></i><span>Seats: <strong>' + esc(seatsText) + '</strong></span></div>' +
          promoLine +
          discountLine +
          '<div class="detail-item tabular-nums"><i class="fas fa-dollar-sign" aria-hidden="true"></i><span>Total Paid: <strong>$' + esc(receipt.totalPaid || '0.00') + '</strong></span></div>';
      }
    }
  } catch (_) {
    hasValidReceipt = false;
  }

  document.getElementById('print-receipt-btn')?.addEventListener('click', function () {
    window.print();
  });

  if (!hasValidReceipt) {
    if (loading) loading.classList.add('is-hidden');
    if (success) success.classList.add('is-hidden');
    if (emptyReceipt) emptyReceipt.classList.remove('is-hidden');
    return;
  }

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const revealReceipt = function () {
    if (loading) loading.classList.add('is-hidden');
    if (success) success.classList.remove('is-hidden');
  };

  if (prefersReducedMotion) {
    revealReceipt();
  } else {
    setTimeout(revealReceipt, 320);
  }
});