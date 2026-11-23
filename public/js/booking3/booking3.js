/**
 * Interactive Seat Selection & Screening Schedule Controller
 */
(function () {
  'use strict';

  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const SEATS_PER_ROW = 12;
  const VIP_ROWS = new Set(['D', 'E']);
  const ALL_SHOWTIMES = ['09:30 AM', '12:00 PM', '02:30 PM', '05:15 PM', '08:00 PM', '10:30 PM'];

  const state = {
    movieCode: '1',
    theaterCode: '1',
    theaterName: 'Cinemark Premium',
    unitPrice: 39.0,
    date: '',
    time: '09:30 AM',
    dailyShowtimes: 6,
    hasTheaterSchedule: true,
    seatLoadFailed: false,
    selectedSeats: [],
    initialSeatsToRestore: [],
    requestSeq: 0,
  };

  function toIsoDate(dateObj) {
    return (
      dateObj.getFullYear() + '-' +
      String(dateObj.getMonth() + 1).padStart(2, '0') + '-' +
      String(dateObj.getDate()).padStart(2, '0')
    );
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
        const isVip = VIP_ROWS.has(rowLetter);
        const seatEl = document.createElement('div');
        seatEl.className = 'seat' + (isVip ? ' vip' : '');
        seatEl.dataset.seat = seatCode;
        seatEl.textContent = String(num);
        seatEl.title = 'Seat ' + seatCode + (isVip ? ' (Prime Row)' : '');
        seatEl.setAttribute('role', 'button');
        seatEl.setAttribute('tabindex', '0');
        seatEl.setAttribute('aria-label', 'Seat ' + seatCode + (isVip ? ' Prime Row' : ' Standard'));
        seatEl.setAttribute('aria-pressed', 'false');

        const activateSeat = function () {
          if (!seatEl.classList.contains('reserved') && state.hasTheaterSchedule && !state.seatLoadFailed) {
            toggleSeatSelection(seatCode, seatEl);
          }
        };
        seatEl.addEventListener('click', activateSeat);
        window.CineTicket.bindActivateKey(seatEl, activateSeat);
        rowEl.appendChild(seatEl);
      }

      container.appendChild(rowEl);
    });
  }

  function buildDateSelector(preferredIso) {
    const dateContainer = document.querySelector('.date-selector');
    if (!dateContainer) return;

    dateContainer.innerHTML = '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const base = new Date();
    const dates = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      dates.push({ d: d, iso: toIsoDate(d) });
    }

    const activeIso = dates.some(function (x) { return x.iso === preferredIso; }) ? preferredIso : dates[0].iso;
    state.date = activeIso;

    dates.forEach(function (entry) {
      const isActive = entry.iso === activeIso;
      const item = document.createElement('div');
      item.className = 'date-item' + (isActive ? ' active' : '');
      item.dataset.isoDate = entry.iso;
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-selected', String(isActive));
      item.innerHTML =
        '<span class="date-day">' + dayNames[entry.d.getDay()] + '</span>' +
        '<span class="date-date">' + entry.d.getDate() + '</span>' +
        '<span class="date-month">' + monthNames[entry.d.getMonth()] + '</span>';

      const selectDate = function () {
        if (state.date === entry.iso) return;
        dateContainer.querySelectorAll('.date-item').forEach(function (el) {
          el.classList.remove('active');
          el.setAttribute('aria-selected', 'false');
        });
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
        state.date = entry.iso;
        loadOccupiedSeats();
      };
      item.addEventListener('click', selectDate);
      window.CineTicket.bindActivateKey(item, selectDate);
      dateContainer.appendChild(item);
    });
  }

  function renderTimeSlots(dailyCount, preferredTime) {
    const container = document.getElementById('time-slots-container') || document.querySelector('.time-slots');
    if (!container) return;

    const count = Math.max(1, Math.min(ALL_SHOWTIMES.length, parseInt(dailyCount, 10) || 6));
    state.dailyShowtimes = count;
    const availableSlots = ALL_SHOWTIMES.slice(0, count);
    if (!availableSlots.includes(preferredTime || state.time)) {
      state.time = availableSlots[0];
    } else if (preferredTime) {
      state.time = preferredTime;
    }

    container.innerHTML = '';
    availableSlots.forEach(function (slotLabel) {
      const isActive = slotLabel === state.time;
      const slot = document.createElement('div');
      slot.className = 'time-slot' + (isActive ? ' active' : '');
      slot.textContent = slotLabel;
      slot.setAttribute('role', 'option');
      slot.setAttribute('tabindex', '0');
      slot.setAttribute('aria-selected', String(isActive));

      const chooseSlot = function () {
        if (state.time === slotLabel) return;
        container.querySelectorAll('.time-slot').forEach(function (s) {
          s.classList.remove('active');
          s.setAttribute('aria-selected', 'false');
        });
        slot.classList.add('active');
        slot.setAttribute('aria-selected', 'true');
        state.time = slotLabel;
        loadOccupiedSeats();
      };
      slot.addEventListener('click', chooseSlot);
      window.CineTicket.bindActivateKey(slot, chooseSlot);
      container.appendChild(slot);
    });
  }

  function setSeatStatusBanner(message, isError, retryFn) {
    const banner = document.getElementById('seat-status-banner');
    if (!banner) return;
    if (!message) {
      banner.style.display = 'none';
      banner.innerHTML = '';
      return;
    }
    const esc = window.CineTicket.escapeHtml;
    banner.style.display = 'flex';
    banner.className = 'seat-status-banner ' + (isError ? 'error' : 'info');
    banner.innerHTML =
      '<span><i class="fas ' + (isError ? 'fa-exclamation-circle' : 'fa-info-circle') + '"></i> ' + esc(message) + '</span>' +
      (typeof retryFn === 'function' ? '<button type="button" class="btn-inline-retry">Retry</button>' : '');
    if (typeof retryFn === 'function') {
      banner.querySelector('.btn-inline-retry')?.addEventListener('click', retryFn);
    }
  }

  async function loadMovieDetails() {
    const CT = window.CineTicket;
    const movieInfo = document.querySelector('.movie-info');
    try {
      const payload = await CT.fetchJson('/index.php/movie/movies/getMovieByCode?movie_code=' + encodeURIComponent(state.movieCode));
      if (!payload.success || !payload.data) {
        state.hasTheaterSchedule = false;
        if (movieInfo) {
          CT.renderStateBlock(movieInfo, 'error', 'Movie not found', payload.message || 'This film is not available.', loadMovieDetails);
        }
        updateSummaryPanel();
        return;
      }

      const movie = payload.data;
      state.unitPrice = parseFloat(movie.money) || 39.0;

      const esc = CT.escapeHtml;
      if (movieInfo) {
        movieInfo.innerHTML =
          '<img src="' + esc(CT.resolveAssetUrl(movie.img)) + '" alt="' + esc(movie.movie_name) + '" class="movie-poster">' +
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
      if (movieInfo) {
        CT.renderStateBlock(movieInfo, 'error', 'Unable to load movie details', 'Please check your connection and retry.', loadMovieDetails);
      }
    }
  }

  async function loadTheaters(preferredTime) {
    const select = document.getElementById('theater-select');
    if (!select) return;

    const CT = window.CineTicket;
    try {
      const payload = await CT.fetchJson(
        '/index.php/theater/theater/getTheaterList?movie_code=' + encodeURIComponent(state.movieCode)
      );
      if (!payload.success) {
        setSeatStatusBanner(payload.message || 'Failed to load theater schedule.', true, function () { loadTheaters(preferredTime); });
        return;
      }

      const list = Array.isArray(payload.data) ? payload.data : [];
      if (!list.length) {
        state.hasTheaterSchedule = false;
        select.innerHTML = '<option value="">No active theaters scheduled for this movie</option>';
        select.disabled = true;
        setSeatStatusBanner('No active theater screenings are currently scheduled for this film.', false);
        updateSummaryPanel();
        return;
      }

      state.hasTheaterSchedule = true;
      select.disabled = false;
      const esc = CT.escapeHtml;
      if (!list.some(function (t) { return String(t.theater_code) === String(state.theaterCode); })) {
        state.theaterCode = String(list[0].theater_code);
      }

      select.innerHTML = list.map(function (t) {
        const selected = String(t.theater_code) === String(state.theaterCode) ? ' selected' : '';
        const showtimes = t.daily_showtimes || 4;
        return (
          '<option value="' + esc(t.theater_code) + '" data-name="' + esc(t.theater_name) + '" data-showtimes="' + esc(showtimes) + '"' + selected + '>' +
          esc(t.theater_name) + ' — ' + esc(t.address) +
          '</option>'
        );
      }).join('');

      const syncSelected = function (keepPreferredTime) {
        const opt = select.options[select.selectedIndex];
        state.theaterCode = select.value;
        state.theaterName = opt ? (opt.getAttribute('data-name') || opt.textContent) : '';
        const ds = opt ? parseInt(opt.getAttribute('data-showtimes') || '6', 10) : 6;
        renderTimeSlots(ds, keepPreferredTime ? preferredTime : null);
      };

      syncSelected(true);
      select.onchange = function () {
        syncSelected(false);
        loadOccupiedSeats();
      };

      updateSummaryPanel();
    } catch (_) {
      setSeatStatusBanner('Unable to load theater schedule. Using default auditorium view.', true, function () { loadTheaters(preferredTime); });
    }
  }

  async function loadOccupiedSeats() {
    if (!state.movieCode || !state.date || !state.time || !state.hasTheaterSchedule) return;

    const toRestore = state.initialSeatsToRestore.slice();
    state.initialSeatsToRestore = [];
    state.selectedSeats = [];
    state.seatLoadFailed = false;
    setSeatStatusBanner('', false);

    const seq = ++state.requestSeq;
    const params = new URLSearchParams({
      movie_code: state.movieCode,
      theater_code: state.theaterCode,
      date: state.date,
      time: state.time,
    });

    try {
      const payload = await window.CineTicket.fetchJson('/index.php/movie/seat/getSeatList?' + params.toString());
      if (seq !== state.requestSeq) return;

      if (!payload.success || !Array.isArray(payload.data)) {
        state.seatLoadFailed = true;
        setSeatStatusBanner(payload.message || 'Could not verify seat occupancy.', true, loadOccupiedSeats);
        document.querySelectorAll('.seat[data-seat]').forEach(function (seatEl) {
          seatEl.classList.remove('selected', 'reserved');
          seatEl.setAttribute('aria-pressed', 'false');
          seatEl.setAttribute('aria-disabled', 'true');
        });
        updateSummaryPanel();
        return;
      }

      const occupiedSet = new Set(
        payload.data.map(function (s) { return String(s.seat_num).toUpperCase(); })
      );

      document.querySelectorAll('.seat[data-seat]').forEach(function (seatEl) {
        const code = seatEl.dataset.seat;
        const isReserved = occupiedSet.has(code);
        seatEl.classList.toggle('reserved', isReserved);
        seatEl.classList.remove('selected');
        seatEl.setAttribute('aria-disabled', String(isReserved));
        seatEl.setAttribute('tabindex', isReserved ? '-1' : '0');
        seatEl.setAttribute('aria-pressed', 'false');

        if (!isReserved && toRestore.includes(code) && state.selectedSeats.length < 10) {
          state.selectedSeats.push(code);
          seatEl.classList.add('selected');
          seatEl.setAttribute('aria-pressed', 'true');
        }
      });
    } catch (_) {
      if (seq !== state.requestSeq) return;
      state.seatLoadFailed = true;
      setSeatStatusBanner('Network error while checking occupied seats. Please retry before selecting seats.', true, loadOccupiedSeats);
    }

    updateSummaryPanel();
  }

  function toggleSeatSelection(seatCode, seatEl) {
    const idx = state.selectedSeats.indexOf(seatCode);
    if (idx >= 0) {
      state.selectedSeats.splice(idx, 1);
      seatEl.classList.remove('selected');
      seatEl.setAttribute('aria-pressed', 'false');
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
      seatEl.setAttribute('aria-pressed', 'true');
    }
    updateSummaryPanel();
  }

  function updateSummaryPanel() {
    const count = state.selectedSeats.length;
    const tagsContainer = document.querySelector('.seat-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = state.selectedSeats
        .map(function (code) { return '<div class="seat-tag">' + window.CineTicket.escapeHtml(code) + '</div>'; })
        .join('');
    }
    document.getElementById('selectedSeatsInfo')?.classList.toggle('active', count > 0);

    const theaterEl = document.getElementById('summary-theater');
    const datetimeEl = document.getElementById('summary-datetime');
    const countEl = document.getElementById('summary-count');
    const subtotalEl = document.getElementById('summary-price');
    const proceedBtn = document.querySelector('.proceed-button');

    if (theaterEl) theaterEl.textContent = state.hasTheaterSchedule ? state.theaterName : 'Unavailable';
    if (datetimeEl) datetimeEl.textContent = state.hasTheaterSchedule ? (state.date + ' • ' + state.time) : '-';
    if (countEl) countEl.textContent = String(count);

    const rawSubtotal = count * state.unitPrice;
    const discount = window.CineTicket.calcGroupDiscount(rawSubtotal, count);
    if (subtotalEl) {
      subtotalEl.textContent = '$' + (rawSubtotal - discount).toFixed(2) +
        (discount > 0 ? ' (30% group savings)' : '');
    }
    if (proceedBtn) {
      proceedBtn.disabled = count === 0 || !state.hasTheaterSchedule || state.seatLoadFailed;
    }
  }

  function viewSeatsInVR() {
    const params = new URLSearchParams({
      movie_code: state.movieCode,
      theater_code: state.theaterCode,
    });
    window.location.href = '3d-model.html?' + params.toString();
  }

  window.viewSeatsInVR = viewSeatsInVR;

  document.addEventListener('DOMContentLoaded', async function () {
    const urlParams = new URLSearchParams(window.location.search);
    state.movieCode = urlParams.get('movie_code') || '1';
    state.theaterCode = urlParams.get('theater_code') || '1';
    const preferredDate = urlParams.get('date') || '';
    const preferredTime = urlParams.get('time') || '';
    state.initialSeatsToRestore = (urlParams.get('seats') || '')
      .split(',')
      .map(function (s) { return s.trim().toUpperCase(); })
      .filter(Boolean);

    buildSeatGrid();
    buildDateSelector(preferredDate);
    renderTimeSlots(6, preferredTime || '09:30 AM');

    document.getElementById('vr-preview-btn')?.addEventListener('click', viewSeatsInVR);

    document.querySelector('.proceed-button')?.addEventListener('click', function () {
      if (!state.selectedSeats.length || !state.hasTheaterSchedule || state.seatLoadFailed) {
        window.showToast('Please select at least one available seat', 'warning');
        return;
      }
      const params = new URLSearchParams({
        movie_code: state.movieCode,
        theater_code: state.theaterCode,
        date: state.date,
        time: state.time,
        seats: state.selectedSeats.join(','),
      });
      window.location.href = 'pay.html?' + params.toString();
    });

    await Promise.all([loadMovieDetails(), loadTheaters(preferredTime)]);
    await loadOccupiedSeats();
  });
})();