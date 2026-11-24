/**
 * Digital Tickets Wallet, Native Print/PDF Export & Ticket Cancellation Controller
 */
(function () {
  'use strict';

  let cachedSeats = [];
  let activeZoneFilter = 'all';

  function purgeCancelledSeatFromReceipt(cancelledSeat) {
    if (!cancelledSeat) return;
    try {
      const raw = sessionStorage.getItem('lastBookingReceipt');
      if (!raw) return;
      const receipt = JSON.parse(raw);
      if (!receipt || !Array.isArray(receipt.seats)) return;

      const sameDate = String(receipt.date || '') === String(cancelledSeat.date || '');
      const sameTime = String(receipt.time || '') === String(cancelledSeat.time || '');
      const sameMovie = receipt.movieCode
        ? Number(receipt.movieCode) === Number(cancelledSeat.movie_code)
        : (!cancelledSeat.movie_info || receipt.movieTitle === cancelledSeat.movie_info.movie_name);
      const sameTheater = receipt.theaterCode
        ? Number(receipt.theaterCode) === Number(cancelledSeat.theater_code || 1)
        : true;

      if (!sameDate || !sameTime || !sameMovie || !sameTheater) return;

      const targetNum = String(cancelledSeat.seat_num || '').toUpperCase();
      const remaining = receipt.seats.filter(function (s) {
        return String(s).toUpperCase() !== targetNum;
      });
      if (remaining.length === 0) {
        sessionStorage.removeItem('lastBookingReceipt');
      } else if (remaining.length !== receipt.seats.length) {
        receipt.seats = remaining;
        sessionStorage.setItem('lastBookingReceipt', JSON.stringify(receipt));
      }
    } catch (_) {
      // Ignore malformed sessionStorage receipt
    }
  }

  function renderWalletCard(container, opts) {
    window.CineTicket.renderStateCard(container, Object.assign({
      className: 'no-tickets card',
      headingTag: 'h2',
      iconClass: 'fas fa-ticket-alt',
      buttonClass: 'empty-action-btn',
    }, opts));
  }

  async function loadUserTickets() {
    const container = document.getElementById('cons');
    const walletToolbar = document.getElementById('wallet-toolbar');
    if (!container) return;

    const CT = window.CineTicket;
    const user = CT.AuthStore.getUser();
    if (!user.isLoggedIn || user.userId <= 0) {
      cachedSeats = [];
      if (walletToolbar) walletToolbar.classList.add('is-hidden');
      renderWalletCard(container, {
        heading: 'Sign in to view your booked tickets',
        message: 'Log in to access your digital passes, barcodes, and seat cancellation options.',
        actionHref: CT.rootUrl('login.html'),
        actionLabel: 'Sign In Now',
      });
      return;
    }

    try {
      const payload = await CT.fetchJson('/index.php/movie/seat/getSeatListByUserCode');

      if (payload.httpStatus === 401) {
        cachedSeats = [];
        CT.AuthStore.clearLocal();
        if (walletToolbar) walletToolbar.classList.add('is-hidden');
        renderWalletCard(container, {
          heading: 'Session expired — please sign in again',
          message: 'Your login session expired. Sign in again to access and manage your tickets.',
          actionHref: CT.rootUrl('login.html'),
          actionLabel: 'Sign In Now',
        });
        return;
      }

      if (!payload.success) {
        if (walletToolbar) walletToolbar.classList.add('is-hidden');
        window.showToast(payload.message || 'Unable to load tickets', 'error');
        renderWalletCard(container, {
          heading: 'Unable to load ticket wallet',
          message: payload.message || 'Your booked passes could not be loaded right now.',
          actionLabel: 'Retry Wallet',
          onAction: loadUserTickets,
          isError: true,
        });
        return;
      }

      cachedSeats = Array.isArray(payload.data) ? payload.data : [];
      if (cachedSeats.length === 0) {
        if (walletToolbar) walletToolbar.classList.add('is-hidden');
        renderWalletCard(container, {
          heading: 'No active tickets yet',
          message: 'Reserve seats for any current movie screening and your digital tickets will appear here.',
          actionHref: CT.pageUrl('homepage.html'),
          actionLabel: 'Browse Movies',
        });
        return;
      }

      if (walletToolbar) walletToolbar.classList.remove('is-hidden');
      renderFilteredTickets();
    } catch (_) {
      if (walletToolbar) walletToolbar.classList.add('is-hidden');
      window.showToast('Unable to load your tickets right now', 'error');
      renderWalletCard(container, {
        heading: 'Unable to load ticket wallet',
        message: 'Connection to the reservation service failed. Please retry.',
        actionLabel: 'Retry Wallet',
        onAction: loadUserTickets,
        isError: true,
      });
    }
  }

  function renderFilteredTickets() {
    const container = document.getElementById('cons');
    if (!container) return;

    const countEl = document.getElementById('wallet-count-badge');
    const filtered = cachedSeats.filter(function (s) {
      if (activeZoneFilter === 'vip') return Number(s.seat_zone) === 2;
      if (activeZoneFilter === 'std') return Number(s.seat_zone) !== 2;
      return true;
    });

    if (countEl) {
      countEl.textContent = filtered.length + ' of ' + cachedSeats.length + ' Pass' + (cachedSeats.length === 1 ? '' : 'es');
    }

    if (filtered.length === 0) {
      renderWalletCard(container, {
        heading: 'No tickets in this zone filter',
        message: 'Switch back to All Passes to view your other active reservations.',
        actionLabel: 'Show All Passes',
        onAction: function () {
          activeZoneFilter = 'all';
          syncZoneFilterButtons();
          renderFilteredTickets();
        },
      });
      return;
    }

    container.innerHTML = '';
    filtered.forEach(function (seat) {
      container.appendChild(createTicketElement(seat));
    });
  }

  function syncZoneFilterButtons() {
    window.CineTicket.activatePill(
      document.querySelectorAll('[data-ticket-zone]'),
      function (btn) { return btn.getAttribute('data-ticket-zone') === activeZoneFilter; }
    );
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
    const isVip = Number(seat.seat_zone) === 2;

    const wrapper = document.createElement('article');
    wrapper.className = 'ticket' + (isVip ? ' ticket-vip' : '');
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
      '<div class="seat-info tabular-nums">' +
      '<div class="detail-column"><div class="detail-label">ROW</div><div class="detail-value">' + esc(seatStr.charAt(0)) + '</div></div>' +
      '<div class="detail-column"><div class="detail-label">SEAT</div><div class="detail-value">' + esc(seatStr.slice(1)) + '</div></div>' +
      '<div class="detail-column"><div class="detail-label">ZONE</div><div class="detail-value' + (isVip ? ' zone-vip' : '') + '">' + (isVip ? 'VIP' : 'STD') + '</div></div>' +
      '</div>' +
      '<div class="datetime-info tabular-nums">' +
      '<div class="date-time"><div class="icon"><i class="fas fa-calendar-alt" aria-hidden="true"></i></div><div class="text-info"><div class="detail-label">DATE</div><div>' + esc(seat.date) + '</div></div></div>' +
      '<div class="date-time"><div class="icon"><i class="fas fa-clock" aria-hidden="true"></i></div><div class="text-info"><div class="detail-label">TIME</div><div>' + esc(seat.time) + '</div></div></div>' +
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
      '<div class="ticket-id tabular-nums">TKT-' + esc(String(seat.seat_code).padStart(6, '0')) + '</div>' +
      '</div>' +
      '<div class="ticket-actions">' +
      '<button type="button" class="view-details export-ticket-btn"><i class="fas fa-qrcode" aria-hidden="true"></i> Print / Save PDF</button>' +
      '<button type="button" class="view-details2 cancel-button" data-seat-code="' + esc(seat.seat_code) + '"><i class="fas fa-undo" aria-hidden="true"></i> Cancel Booking</button>' +
      '</div>' +
      '</div>';

    wrapper.querySelector('.export-ticket-btn').addEventListener('click', function () {
      exportTicket(wrapper);
    });
    const cancelBtn = wrapper.querySelector('.cancel-button');
    cancelBtn.addEventListener('click', function () {
      cancelTicket(seat, cancelBtn);
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

  async function cancelTicket(seatObj, btnEl) {
    if (!window.confirm('Are you sure you want to cancel this seat reservation?')) {
      return;
    }

    if (btnEl) btnEl.disabled = true;
    const CT = window.CineTicket;
    try {
      const payload = await CT.fetchJson('/index.php/movie/seat/delete', {
        method: 'POST',
        body: { seat_code: seatObj.seat_code },
      });

      if (payload.success) {
        purgeCancelledSeatFromReceipt(seatObj);
        window.showToast('Seat booking cancelled and seat released', 'success');
        await loadUserTickets();
        return;
      }
      window.showToast(payload.message || 'Could not cancel booking', 'error');
    } catch (_) {
      window.showToast('Network error while cancelling ticket', 'error');
    } finally {
      if (btnEl) btnEl.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    document.querySelectorAll('[data-ticket-zone]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeZoneFilter = btn.getAttribute('data-ticket-zone') || 'all';
        syncZoneFilterButtons();
        renderFilteredTickets();
      });
    });

    window.addEventListener('cinetix:authchange', function () {
      loadUserTickets();
    });
    window.addEventListener('pageshow', function (event) {
      if (event && event.persisted) {
        loadUserTickets();
      }
    });

    await window.CineTicket.AuthStore.syncSession();
    await loadUserTickets();
  });
})();
