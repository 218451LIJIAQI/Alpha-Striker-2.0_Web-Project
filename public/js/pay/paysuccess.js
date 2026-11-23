/**
 * Payment Confirmation & Authoritative Receipt Summary Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const loading = document.querySelector('.payment-loading');
  const success = document.querySelector('.payment-success');
  const detailsEl = document.querySelector('.confirmation-details');

  try {
    const rawReceipt = sessionStorage.getItem('lastBookingReceipt');
    if (rawReceipt && detailsEl) {
      const receipt = JSON.parse(rawReceipt);
      const esc = window.CineTicket.escapeHtml;
      const seatsText = Array.isArray(receipt.seats) ? receipt.seats.join(', ') : '';
      const promoLine = receipt.promoCode
        ? '<div class="detail-item"><i class="fas fa-tag"></i><span>Promo Redeemed: <strong>' + esc(receipt.promoCode) + '</strong></span></div>'
        : '';

      detailsEl.innerHTML =
        '<div class="detail-item"><i class="fas fa-ticket-alt"></i><span>Booking Ref: <strong>#' + esc(receipt.bookingId || 'BK-CONFIRMED') + '</strong></span></div>' +
        '<div class="detail-item"><i class="fas fa-film"></i><span>Movie: <strong>' + esc(receipt.movieTitle || '-') + '</strong></span></div>' +
        '<div class="detail-item"><i class="fas fa-building"></i><span>Theater: <strong>' + esc(receipt.theaterName || '-') + '</strong></span></div>' +
        '<div class="detail-item"><i class="fas fa-calendar-check"></i><span>Showtime: <strong>' + esc((receipt.date || '') + ' ' + (receipt.time || '')) + '</strong></span></div>' +
        '<div class="detail-item"><i class="fas fa-chair"></i><span>Seats: <strong>' + esc(seatsText) + '</strong></span></div>' +
        promoLine +
        '<div class="detail-item"><i class="fas fa-dollar-sign"></i><span>Total Paid: <strong>$' + esc(receipt.totalPaid || '0.00') + '</strong></span></div>';
    }
  } catch (_) {
    // Keep default confirmation block if sessionStorage is unavailable
  }

  setTimeout(function () {
    if (loading) loading.classList.add('is-hidden');
    if (success) success.classList.remove('is-hidden');
  }, 550);
});