/**
 * Digital Tickets Wallet, Native Print/PDF Export & Ticket Cancellation Controller
 */
document.addEventListener('DOMContentLoaded', loadUserTickets);

async function loadUserTickets() {
  const container = document.getElementById('cons');
  if (!container) return;

  const CT = window.CineTicket;
  const user = CT.AuthStore.getUser();
  if (!user.isLoggedIn || user.userId <= 0) {
    renderTicketEmptyState(
      container,
      'Sign in to view your booked tickets',
      'Log in to access your digital passes, barcodes, and seat cancellation options.',
      CT.rootUrl('login.html'),
      'Sign In Now'
    );
    return;
  }

  try {
    const payload = await CT.fetchJson(
      '/index.php/movie/seat/getSeatListByUserCode?user_code=' + encodeURIComponent(user.userId)
    );

    if (!payload.success || !Array.isArray(payload.data) || payload.data.length === 0) {
      renderTicketEmptyState(
        container,
        'No active tickets yet',
        'Reserve seats for any current movie screening and your digital tickets will appear here.',
        CT.pageUrl('homepage.html'),
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
    '<div class="no-tickets card">' +
    '<i class="fas fa-ticket-alt"></i>' +
    '<h2>' + esc(heading) + '</h2>' +
    '<p>' + esc(message) + '</p>' +
    '<a href="' + esc(actionHref) + '" class="empty-action-btn">' + esc(actionLabel) + '</a>' +
    '</div>';
}

function createTicketElement(seat) {
  const CT = window.CineTicket;
  const esc = CT.escapeHtml;
  const movie = seat.movie_info || {};
  const theater = seat.theater_info || {};

  const title = movie.movie_name || 'Movie Screening';
  const runtime = movie.times || 'Standard Feature';
  const genres = (movie.movie_type || 'Cinema')
    .split(',')
    .map(function (g) { return g.trim(); })
    .filter(Boolean);
  const stars = CT.formatStars(movie.star || 5);
  const seatStr = String(seat.seat_num || 'A1');
  const theaterLabel = theater.theater_name || ('Theater #' + (seat.theater_code || 1));

  const wrapper = document.createElement('div');
  wrapper.className = 'ticket';
  wrapper.id = 'ticket' + seat.seat_code;

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
    '<div class="detail-column"><div class="detail-label">ROW</div><div class="detail-value">' + esc(seatStr.charAt(0)) + '</div></div>' +
    '<div class="detail-column"><div class="detail-label">SEAT</div><div class="detail-value">' + esc(seatStr.slice(1)) + '</div></div>' +
    '<div class="detail-column"><div class="detail-label">ZONE</div><div class="detail-value">' + (Number(seat.seat_zone) === 2 ? 'VIP' : 'STD') + '</div></div>' +
    '</div>' +
    '<div class="datetime-info">' +
    '<div class="date-time"><div class="icon"><i class="fas fa-calendar-alt"></i></div><div class="text-info"><div class="detail-label">DATE</div><div>' + esc(seat.date) + '</div></div></div>' +
    '<div class="date-time"><div class="icon"><i class="fas fa-clock"></i></div><div class="text-info"><div class="detail-label">TIME</div><div>' + esc(seat.time) + '</div></div></div>' +
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
    '<button type="button" class="view-details export-ticket-btn">Print / Save PDF</button>' +
    '<button type="button" class="view-details2 cancel-button" data-seat-code="' + esc(seat.seat_code) + '">Cancel Booking</button>' +
    '</div>';

  wrapper.querySelector('.export-ticket-btn').addEventListener('click', function () {
    exportTicket(wrapper);
  });
  wrapper.querySelector('.cancel-button').addEventListener('click', function () {
    cancelTicket(seat.seat_code);
  });

  return wrapper;
}

function exportTicket(ticketEl) {
  document.body.classList.add('printing-single-ticket');
  ticketEl.classList.add('print-target');
  window.print();
  ticketEl.classList.remove('print-target');
  document.body.classList.remove('printing-single-ticket');
}

async function cancelTicket(seatCode) {
  if (!window.confirm('Are you sure you want to cancel this seat reservation?')) {
    return;
  }

  const CT = window.CineTicket;
  const user = CT.AuthStore.getUser();
  try {
    const payload = await CT.fetchJson('/index.php/movie/seat/delete', {
      method: 'POST',
      body: { seat_code: seatCode, user_code: user.userId },
    });

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
