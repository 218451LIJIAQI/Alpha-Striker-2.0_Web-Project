/**
 * Interactive Seat Selection & Screening Schedule Controller
 * Consolidates 3 duplicate DOMContentLoaded handlers and eliminates 7x redundant API calls on load.
 */
(function () {
  'use strict';

  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const SEATS_PER_ROW = 12;
  const VIP_ROWS = new Set(['D', 'E']);

  const state = {
    movieCode: '1',
    theaterCode: '1',
    theaterName: 'Cinemark Premium',
    unitPrice: 39.0,
    date: '',
    time: '09:30 AM',
    selectedSeats: [],
    requestSeq: 0,
  };

  function toIsoDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function buildSeatGrid() {
    const container = document.getElementById('seat-grid-rows');
    if (!container) return;

    container.innerHTML = '';
    ROWS.forEach(function (rowLetter) {
      const rowEl = document.createElement('div');
      rowEl.className = 'seat-row';

      const labelEl = document.createElement('span');
      labelEl.className = 'row-label';
      labelEl.textContent = rowLetter;
      rowEl.appendChild(labelEl);

      for (let num = 1; num <= SEATS_PER_ROW; num++) {
        const seatCode = rowLetter + num;
        const seatEl = document.createElement('div');
        seatEl.className = 'seat' + (VIP_ROWS.has(rowLetter) ? ' vip' : '');
        seatEl.dataset.seat = seatCode;
        seatEl.title = 'Seat ' + seatCode + (VIP_ROWS.has(rowLetter) ? ' (Prime Row)' : '');
        seatEl.addEventListener('click', function () {
          if (seatEl.classList.contains('reserved')) return;
          toggleSeatSelection(seatCode, seatEl);
        });
        rowEl.appendChild(seatEl);
      }

      container.appendChild(rowEl);
    });
  }

  function buildDateSelector() {
    const dateContainer = document.querySelector('.date-selector');
    if (!dateContainer) return;

    dateContainer.innerHTML = '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const base = new Date();

    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const iso = toIsoDate(d);

      const item = document.createElement('div');
      item.className = 'date-item' + (i === 0 ? ' active' : '');
      item.dataset.isoDate = iso;
      item.innerHTML =
        '<span class="date-day">' + dayNames[d.getDay()] + '</span>' +
        '<span class="date-date">' + d.getDate() + '</span>' +
        '<span class="date-month">' + monthNames[d.getMonth()] + '</span>';

      item.addEventListener('click', function () {
        if (state.date === iso) return;
        document.querySelectorAll('.date-item').forEach(function (el) {
          el.classList.remove('active');
        });
        item.classList.add('active');
        state.date = iso;
        loadOccupiedSeats();
      });

      dateContainer.appendChild(item);
      if (i === 0) {
        state.date = iso;
      }
    }
  }

  function bindTimeSlots() {
    const slots = document.querySelectorAll('.time-slot');
    slots.forEach(function (slot) {
      if (slot.classList.contains('active')) {
        state.time = slot.textContent.trim();
      }
      slot.addEventListener('click', function () {
        const chosen = slot.textContent.trim();
        if (state.time === chosen) return;
        slots.forEach(function (s) { s.classList.remove('active'); });
        slot.classList.add('active');
        state.time = chosen;
        loadOccupiedSeats();
      });
    });
  }

  async function loadMovieDetails() {
    try {
      const res = await fetch('/index.php/movie/movies/getMovieByCode?movie_code=' + encodeURIComponent(state.movieCode));
      const payload = await res.json();
      if (!payload.success || !payload.data) {
        window.showToast(payload.message || 'Movie not found', 'error');
        return;
      }

      const movie = payload.data;
      state.unitPrice = parseFloat(movie.money) || 39.0;

      const esc = window.CineTicket.escapeHtml;
      const resolveAsset = window.CineTicket.resolveAssetUrl;
      const movieInfo = document.querySelector('.movie-info');
      if (movieInfo) {
        movieInfo.innerHTML =
          '<img src="' + esc(resolveAsset(movie.img)) + '" alt="' + esc(movie.movie_name) + '" class="movie-poster">' +
          '<div class="movie-details">' +
          '<h1>' + esc(movie.movie_name) + '</h1>' +
          '<div class="movie-meta">' +
          '<span class="meta-item"><i class="fas fa-film"></i> ' + esc(movie.movie_type) + '</span>' +
          '<span class="meta-item"><i class="fas fa-clock"></i> ' + esc(movie.times) + '</span>' +
          '<span class="meta-item"><i class="fas fa-tag"></i> $' + state.unitPrice.toFixed(2) + ' / ticket</span>' +
          '</div>' +
          '<div class="movie-rating"><i class="fas fa-star"></i> ' + esc(movie.star) + ' / 5.0</div>' +
          '</div>';
      }

      updateSummaryPanel();
    } catch (_) {
      window.showToast('Unable to load movie details', 'error');
    }
  }

  async function loadTheaters() {
    const select = document.getElementById('theater-select');
    if (!select) return;

    try {
      const res = await fetch('/index.php/theater/theater/getTheaterList');
      const payload = await res.json();
      if (!payload.success || !Array.isArray(payload.data) || !payload.data.length) return;

      const esc = window.CineTicket.escapeHtml;
      select.innerHTML = payload.data.map(function (t) {
        const selected = String(t.theater_code) === String(state.theaterCode) ? ' selected' : '';
        return (
          '<option value="' + esc(t.theater_code) + '" data-name="' + esc(t.theater_name) + '"' + selected + '>' +
          esc(t.theater_name) + ' — ' + esc(t.address) +
          '</option>'
        );
      }).join('');

      const activeOpt = select.options[select.selectedIndex];
      if (activeOpt) {
        state.theaterCode = activeOpt.value;
        state.theaterName = activeOpt.getAttribute('data-name') || activeOpt.textContent;
      }

      select.addEventListener('change', function () {
        const opt = select.options[select.selectedIndex];
        state.theaterCode = select.value;
        state.theaterName = opt ? (opt.getAttribute('data-name') || opt.textContent) : '';
        loadOccupiedSeats();
      });

      updateSummaryPanel();
    } catch (_) {
      // Keep default theater fallback if offline
    }
  }

  async function loadOccupiedSeats() {
    if (!state.movieCode || !state.date || !state.time) return;

    clearSelection();
    const seq = ++state.requestSeq;
    const params = new URLSearchParams({
      movie_code: state.movieCode,
      theater_code: state.theaterCode,
      date: state.date,
      time: state.time,
    });

    try {
      const res = await fetch('/index.php/movie/seat/getSeatList?' + params.toString());
      const payload = await res.json();
      if (seq !== state.requestSeq) return; // Ignore stale response

      const occupiedSet = new Set(
        payload.success && Array.isArray(payload.data)
          ? payload.data.map(function (s) { return String(s.seat_num).toUpperCase(); })
          : []
      );

      document.querySelectorAll('.seat[data-seat]').forEach(function (seatEl) {
        const code = seatEl.dataset.seat;
        const isReserved = occupiedSet.has(code);
        seatEl.classList.toggle('reserved', isReserved);
        seatEl.classList.remove('selected');
      });
    } catch (_) {
      window.showToast('Could not refresh seat availability', 'warning');
    }

    updateSummaryPanel();
  }

  function clearSelection() {
    state.selectedSeats = [];
    document.querySelectorAll('.seat.selected').forEach(function (el) {
      el.classList.remove('selected');
    });
  }

  function toggleSeatSelection(seatCode, seatEl) {
    const idx = state.selectedSeats.indexOf(seatCode);
    if (idx >= 0) {
      state.selectedSeats.splice(idx, 1);
      seatEl.classList.remove('selected');
    } else {
      if (state.selectedSeats.length >= 10) {
        window.showToast('Maximum 10 seats per transaction', 'warning');
        return;
      }
      state.selectedSeats.push(seatCode);
      state.selectedSeats.sort(function (a, b) {
        return a[0] === b[0]
          ? parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10)
          : a.localeCompare(b);
      });
      seatEl.classList.add('selected');
    }
    updateSummaryPanel();
  }

  function updateSummaryPanel() {
    const tagsContainer = document.querySelector('.seat-tags');
    const selectedBox = document.getElementById('selectedSeatsInfo');
    if (tagsContainer) {
      tagsContainer.innerHTML = '';
      state.selectedSeats.forEach(function (code) {
        const tag = document.createElement('div');
        tag.className = 'seat-tag';
        tag.textContent = code;
        tagsContainer.appendChild(tag);
      });
    }
    if (selectedBox) {
      selectedBox.classList.toggle('active', state.selectedSeats.length > 0);
    }

    const theaterEl = document.getElementById('summary-theater');
    const datetimeEl = document.getElementById('summary-datetime');
    const countEl = document.getElementById('summary-count');
    const subtotalEl = document.getElementById('summary-price');
    const proceedBtn = document.querySelector('.proceed-button');

    if (theaterEl) theaterEl.textContent = state.theaterName;
    if (datetimeEl) datetimeEl.textContent = state.date + ' • ' + state.time;
    if (countEl) countEl.textContent = String(state.selectedSeats.length);

    const rawSubtotal = state.selectedSeats.length * state.unitPrice;
    const bulkMultiplier = state.selectedSeats.length >= 5 ? 0.7 : 1.0;
    const estimatedTotal = rawSubtotal * bulkMultiplier;

    if (subtotalEl) {
      subtotalEl.textContent = '$' + estimatedTotal.toFixed(2) +
        (bulkMultiplier < 1 ? ' (30% group savings)' : '');
    }
    if (proceedBtn) {
      proceedBtn.disabled = state.selectedSeats.length === 0;
    }
  }

  function bindProceedButton() {
    const btn = document.querySelector('.proceed-button');
    if (!btn) return;

    btn.addEventListener('click', function () {
      if (!state.selectedSeats.length) {
        window.showToast('Please select at least one seat', 'warning');
        return;
      }

      const bookingSnapshot = {
        movie_code: state.movieCode,
        theater_code: state.theaterCode,
        theater_name: state.theaterName,
        date: state.date,
        time: state.time,
        seats: state.selectedSeats,
      };
      sessionStorage.setItem('pendingBooking', JSON.stringify(bookingSnapshot));

      const params = new URLSearchParams({
        movie_code: state.movieCode,
        theater_code: state.theaterCode,
        date: state.date,
        time: state.time,
        seats: state.selectedSeats.join(','),
      });
      window.location.href = 'pay.html?' + params.toString();
    });
  }

  window.viewSeatsInVR = function () {
    window.location.href = '3d-model.html';
  };

  document.addEventListener('DOMContentLoaded', async function () {
    const urlParams = new URLSearchParams(window.location.search);
    state.movieCode = urlParams.get('movie_code') || '1';
    state.theaterCode = urlParams.get('theater_code') || '1';

    buildSeatGrid();
    buildDateSelector();
    bindTimeSlots();
    bindProceedButton();

    await Promise.all([loadMovieDetails(), loadTheaters()]);
    await loadOccupiedSeats();
  });
})();