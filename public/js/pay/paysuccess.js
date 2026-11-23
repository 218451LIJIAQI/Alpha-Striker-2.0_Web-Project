/**
 * Payment Confirmation & Receipt Summary Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const CT = window.CineTicket;
  const loading = document.querySelector('.payment-loading');
  const success = document.querySelector('.payment-success');
  const detailsEl = document.querySelector('.confirmation-details');

  document.getElementById('btn-back-home')?.addEventListener('click', function () {
    window.location.href = 'homepage.html';
  });
  document.getElementById('btn-view-tickets')?.addEventListener('click', function () {
    window.location.href = 'generate_ticket.html';
  });
  document.getElementById('btn-print-receipt')?.addEventListener('click', function () {
    window.print();
  });

  const stepTickets = document.getElementById('step-open-tickets');
  if (stepTickets) {
    const goTickets = function () { window.location.href = 'generate_ticket.html'; };
    stepTickets.addEventListener('click', goTickets);
    CT.bindActivateKey(stepTickets, goTickets);
  }

  let hasReceipt = false;
  try {
    const rawReceipt = sessionStorage.getItem('lastBookingReceipt');
    if (rawReceipt && detailsEl) {
      const receipt = JSON.parse(rawReceipt);
      hasReceipt = Boolean(receipt && receipt.movieTitle);
      const esc = CT.escapeHtml;
      const seatsText = Array.isArray(receipt.seats) ? receipt.seats.join(', ') : '';
      const promoLine = receipt.promoCode
        ? '<div class="detail-item"><i class="fas fa-tag"></i><span>Promo Applied: <strong>' + esc(receipt.promoCode) + '</strong></span></div>'
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
    // Keep fallback confirmation view if sessionStorage is unavailable
  }

  setTimeout(function () {
    if (loading) loading.style.display = 'none';
    if (success) success.style.display = 'block';
    if (!hasReceipt && detailsEl) {
      detailsEl.innerHTML =
        '<div class="detail-item"><i class="fas fa-info-circle"></i><span>No recent checkout receipt in this tab. Visit <strong>My Bookings</strong> to view saved member tickets.</span></div>';
    }
  }, 450);
});