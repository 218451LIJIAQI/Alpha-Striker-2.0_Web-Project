/**
 * Digital Tickets Wallet, PDF/Print Export & Ticket Cancellation Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  loadUserTickets();
});

async function loadUserTickets() {
  const container = document.getElementById('cons');
  if (!container) return;

  const user = window.CineTicket.AuthStore.getUser();
  if (!user.isLoggedIn || user.userId <= 0) {
    renderTicketEmptyState(
      container,
      'Sign in to view your booked tickets',
      'Log in to access your digital passes, QR barcodes, and seat cancellation options.',
      window.CineTicket.rootUrl('login.html'),
      'Sign In Now'
    );
    return;
  }

  try {
    const res = await fetch('/index.php/movie/seat/getSeatListByUserCode?user_code=' + encodeURIComponent(user.userId));
    const payload = await res.json();

    if (!payload.success || !Array.isArray(payload.data) || payload.data.length === 0) {
      renderTicketEmptyState(
        container,
        'No active tickets yet',
        'Reserve seats for any current movie screening and your digital tickets will appear here.',
        window.CineTicket.pageUrl('homepage.html'),
        'Browse Movies'
      );
      return;
    }

    container.innerHTML = '';
    payload.data.forEach(function (seat) {
      container.appendChild(createTicketElement(seat));
    });
  } catch (_) {
    window.showToast('Unable to load your tickets right now', 'error');
  }
}

function renderTicketEmptyState(container, heading, message, actionHref, actionLabel) {
  const esc = window.CineTicket.escapeHtml;
  container.innerHTML =
    '<div class="no-tickets card" style="max-width:480px; margin:40px auto; padding:36px 28px; text-align:center; border-radius:16px; background:#fff; box-shadow:0 8px 24px rgba(0,0,0,0.08);">' +
    '<i class="fas fa-ticket-alt" style="font-size:42px; color:#4361ee; margin-bottom:16px;"></i>' +
    '<h2 style="margin-bottom:10px;">' + esc(heading) + '</h2>' +
    '<p style="margin-bottom:22px; opacity:0.8;">' + esc(message) + '</p>' +
    '<a href="' + esc(actionHref) + '" style="display:inline-block; padding:11px 24px; border-radius:999px; background:#4361ee; color:#fff; text-decoration:none; font-weight:600;">' + esc(actionLabel) + '</a>' +
    '</div>';
}

function createTicketElement(seat) {
  const esc = window.CineTicket.escapeHtml;
  const movie = seat.movie_info || {};
  const theater = seat.theater_info || {};

  const title = movie.movie_name || 'Movie Screening';
  const runtime = movie.times || 'Standard Feature';
  const genres = (movie.movie_type || 'Cinema')
    .split(',')
    .map(function (g) { return g.trim(); })
    .filter(Boolean);
  const stars = window.CineTicket.formatStars(movie.star || 5);
  const seatStr = String(seat.seat_num || 'A1');
  const rowLetter = seatStr.charAt(0);
  const seatNum = seatStr.slice(1);
  const theaterLabel = theater.theater_name || ('Theater #' + (seat.theater_code || 1));

  const wrapper = document.createElement('div');
  wrapper.className = 'ticket';
  wrapper.id = 'ticket' + seat.seat_code;
  wrapper.style.width = '350px';

  wrapper.innerHTML =
    '<div class="movie-banner">' +
    '<h2 class="movie-title">' + esc(title) + '</h2>' +
    '<div class="movie-duration"><span>' + esc(runtime) + ' • ' + esc(theaterLabel) + '</span></div>' +
    '<div class="movie-genre">' +
    '<div class="genre-tags">' +
    genres.map(function (g) { return '<div class="genre-tag">' + esc(g) + '</div>'; }).join('') +
    '</div>' +
    '<span class="rating">' + esc(stars) + '</span>' +
    '</div>' +
    '</div>' +
    '<div class="ticket-details">' +
    '<div class="seat-info">' +
    '<div class="detail-column"><div class="detail-label">ROW</div><div class="detail-value">' + esc(rowLetter) + '</div></div>' +
    '<div class="detail-column"><div class="detail-label">SEAT</div><div class="detail-value">' + esc(seatNum) + '</div></div>' +
    '<div class="detail-column"><div class="detail-label">ZONE</div><div class="detail-value">' + (Number(seat.seat_zone) === 2 ? 'VIP' : 'STD') + '</div></div>' +
    '</div>' +
    '<div class="datetime-info">' +
    '<div class="date-time">' +
    '<div class="icon"><i class="fas fa-calendar-alt"></i></div>' +
    '<div class="text-info"><div class="detail-label">DATE</div><div>' + esc(seat.date) + '</div></div>' +
    '</div>' +
    '<div class="date-time">' +
    '<div class="icon"><i class="fas fa-clock"></i></div>' +
    '<div class="text-info"><div class="detail-label">TIME</div><div>' + esc(seat.time) + '</div></div>' +
    '</div>' +
    '</div>' +
    '<div class="barcode-container">' +
    '<div class="barcode-inner">' +
    '<svg class="barcode" viewBox="0 0 250 60" aria-hidden="true">' +
    '<rect x="5" y="5" width="3" height="50" fill="black"/><rect x="12" y="5" width="1" height="50" fill="black"/>' +
    '<rect x="16" y="5" width="2" height="50" fill="black"/><rect x="22" y="5" width="3" height="50" fill="black"/>' +
    '<rect x="32" y="5" width="3" height="50" fill="black"/><rect x="38" y="5" width="2" height="50" fill="black"/>' +
    '<rect x="46" y="5" width="4" height="50" fill="black"/><rect x="56" y="5" width="2" height="50" fill="black"/>' +
    '<rect x="61" y="5" width="3" height="50" fill="black"/><rect x="70" y="5" width="2" height="50" fill="black"/>' +
    '<rect x="75" y="5" width="4" height="50" fill="black"/><rect x="85" y="5" width="3" height="50" fill="black"/>' +
    '<rect x="91" y="5" width="2" height="50" fill="black"/><rect x="99" y="5" width="3" height="50" fill="black"/>' +
    '<rect x="110" y="5" width="2" height="50" fill="black"/><rect x="115" y="5" width="3" height="50" fill="black"/>' +
    '<rect x="125" y="5" width="2" height="50" fill="black"/><rect x="135" y="5" width="3" height="50" fill="black"/>' +
    '<rect x="145" y="5" width="2" height="50" fill="black"/><rect x="150" y="5" width="3" height="50" fill="black"/>' +
    '<rect x="155" y="5" width="4" height="50" fill="black"/><rect x="165" y="5" width="2" height="50" fill="black"/>' +
    '<rect x="170" y="5" width="3" height="50" fill="black"/><rect x="180" y="5" width="2" height="50" fill="black"/>' +
    '<rect x="185" y="5" width="4" height="50" fill="black"/><rect x="195" y="5" width="2" height="50" fill="black"/>' +
    '<rect x="200" y="5" width="3" height="50" fill="black"/><rect x="210" y="5" width="2" height="50" fill="black"/>' +
    '<rect x="215" y="5" width="3" height="50" fill="black"/><rect x="225" y="5" width="4" height="50" fill="black"/>' +
    '<rect x="235" y="5" width="3" height="50" fill="black"/><rect x="242" y="5" width="2" height="50" fill="black"/>' +
    '</svg>' +
    '</div>' +
    '<div class="ticket-id">TKT-' + esc(String(seat.seat_code).padStart(6, '0')) + '</div>' +
    '</div>' +
    '<button type="button" class="view-details export-ticket-btn" style="border:none; width:100%; cursor:pointer;">Print / Save PDF</button>' +
    '<button type="button" class="view-details2 cancel-button" style="border:none; width:100%; cursor:pointer;" data-seat-code="' + esc(seat.seat_code) + '">Cancel Booking</button>' +
    '</div>';

  wrapper.querySelector('.export-ticket-btn').addEventListener('click', function () {
    exportTicket(seat.seat_code);
  });
  wrapper.querySelector('.cancel-button').addEventListener('click', function () {
    cancelTicket(seat.seat_code);
  });

  return wrapper;
}

function exportTicket(seatCode) {
  const ticketEl = document.getElementById('ticket' + seatCode);
  if (!ticketEl) {
    window.showToast('Ticket element not found', 'error');
    return;
  }

  if (window.jspdf && window.jspdf.jsPDF && typeof window.html2canvas === 'function') {
    const jsPDF = window.jspdf.jsPDF;
    const doc = new jsPDF();
    doc.html(ticketEl, {
      callback: function (pdf) {
        pdf.save('ticket_' + seatCode + '.pdf');
      },
      margin: [10, 10, 10, 10],
      x: 10,
      y: 10,
      html2canvas: { scale: 0.32 },
    });
    return;
  }

  // Offline / no-CDN fallback: trigger clean browser print dialog
  window.print();
}

async function cancelTicket(seatCode) {
  if (!window.confirm('Are you sure you want to cancel this seat reservation?')) {
    return;
  }

  const user = window.CineTicket.AuthStore.getUser();
  try {
    const res = await fetch('/index.php/movie/seat/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seat_code: seatCode,
        user_code: user.userId,
      }),
    });
    const payload = await res.json();

    if (payload.success) {
      window.showToast('Seat booking cancelled', 'success');
      await loadUserTickets();
    } else {
      window.showToast(payload.message || 'Could not cancel booking', 'error');
    }
  } catch (_) {
    window.showToast('Network error while cancelling ticket', 'error');
  }
}
