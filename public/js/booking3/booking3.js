/**
 * Interactive Seat Selection, Keyboard Matrix Navigation & Screening Schedule Controller
 * Syncs movie_code, theater_code, date, time, and selected seats with URL query & popstate.
 */
(function () {
  'use strict';

  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const SEATS_PER_ROW = 12;
  const MAX_SEATS = 10;
  const VIP_ROWS = new Set(['D', 'E']);

  const state = {
    movieCode: '1',
    movieValid: true,
    theaterCode: '1',
    theaterName: 'Cinemark Premium',
    unitPrice: 39.0,
    date: '',
    time: '09:30 AM',
    selectedSeats: [],
    requestSeq: 0,
    loadingSeats: false,
    suppressUrlSync: false,
  };

  function isBookingReady() {
    return Boolean(state.movieValid && state.theaterCode);
  }

  function syncBookingUrl() {
    if (state.suppressUrlSync || !window.history || typeof window.history.replaceState !== 'function') return;
    const params = new URLSearchParams();
    if (state.movieCode) params.set('movie_code', state.movieCode);
    if (state.theaterCode) params.set('theater_code', state.theaterCode);
    if (state.date) params.set('date', state.date);
    if (state.time) params.set('time', state.time);
    if (state.selectedSeats.length) params.set('seats', state.selectedSeats.join(','));
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  function updateSeatAria(seatEl) {
    const code = seatEl.dataset.seat || '';
    const isVip = seatEl.classList.contains('vip');
    const isReserved = seatEl.classList.contains('reserved');
    const isSelected = seatEl.classList.contains('selected');
    const unavailable = !isBookingReady() || isReserved;
    const statusText = !isBookingReady() ? 'Unavailable' : (isReserved ? 'Reserved' : (isSelected ? 'Selected' : 'Available'));
    seatEl.disabled = !isBookingReady();
    seatEl.setAttribute('aria-pressed', String(isSelected));
    seatEl.setAttribute('aria-disabled', String(unavailable));
    seatEl.setAttribute(
      'aria-label',
      'Seat ' + code + (isVip ? ', Prime VIP Row' : ', Standard Row') + ', ' + statusText
    );
  }

  function syncAuditoriumControls() {
    document.querySelectorAll('.seat[data-seat]').forEach(updateSeatAria);
    const vrBtn = document.querySelector('.vr-button');
    if (vrBtn) {
      vrBtn.disabled = !isBookingReady();
    }
  }

  function focusSeatByRowCol(rowIdx, colNum) {
    const clampedRow = Math.max(0, Math.min(ROWS.length - 1, rowIdx));
    const clampedCol = Math.max(1, Math.min(SEATS_PER_ROW, colNum));
    const targetCode = ROWS[clampedRow] + clampedCol;
    const targetEl = document.querySelector('.seat[data-seat="' + targetCode + '"]');
    if (targetEl) targetEl.focus();
  }

  function buildSeatGrid() {
    const container = document.getElementById('seat-grid-rows');
    if (!container) return;

    container.innerHTML = '';
    ROWS.forEach(function (rowLetter, rowIdx) {
      const rowEl = document.createElement('div');
      rowEl.className = 'seat-row';
      rowEl.setAttribute('role', 'group');
      rowEl.setAttribute('aria-label', 'Row ' + rowLetter + (VIP_ROWS.has(rowLetter) ? ' Prime VIP' : ''));

      const leftLabel = document.createElement('span');
      leftLabel.className = 'row-label';
      leftLabel.textContent = rowLetter;
      leftLabel.setAttribute('aria-hidden', 'true');
      rowEl.appendChild(leftLabel);

      for (let num = 1; num <= SEATS_PER_ROW; num++) {
        const seatCode = rowLetter + num;
        const seatEl = document.createElement('button');
        seatEl.type = 'button';
        seatEl.className =
          'seat tabular-nums' +
          (VIP_ROWS.has(rowLetter) ? ' vip' : '') +
          (num === 3 || num === 9 ? ' seat-aisle-right' : '');
        seatEl.dataset.seat = seatCode;
        seatEl.textContent = seatCode;
        seatEl.title = 'Seat ' + seatCode + (VIP_ROWS.has(rowLetter) ? ' (Prime VIP Row)' : '');
        updateSeatAria(seatEl);

        seatEl.addEventListener('click', function () {
          if (!isBookingReady() || state.loadingSeats || seatEl.classList.contains('reserved')) return;
          toggleSeatSelection(seatCode, seatEl);
        });

        seatEl.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            focusSeatByRowCol(rowIdx, num + 1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            focusSeatByRowCol(rowIdx, num - 1);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusSeatByRowCol(rowIdx + 1, num);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusSeatByRowCol(rowIdx - 1, num);
          } else if (e.key === 'Home') {
            e.preventDefault();
            focusSeatByRowCol(rowIdx, 1);
          } else if (e.key === 'End') {
            e.preventDefault();
            focusSeatByRowCol(rowIdx, SEATS_PER_ROW);
          }
        });

        rowEl.appendChild(seatEl);
      }

      const rightLabel = document.createElement('span');
      rightLabel.className = 'row-label row-label-right';
      rightLabel.textContent = rowLetter;
      rightLabel.setAttribute('aria-hidden', 'true');
      rowEl.appendChild(rightLabel);

      container.appendChild(rowEl);
    });
  }

  function buildDateSelector(preferredIsoDate) {
    const dateContainer = document.querySelector('.date-selector');
    if (!dateContainer) return;

    const CT = window.CineTicket;
    dateContainer.innerHTML = '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const base = new Date();
    const todayIso = CT.toIsoDate(base);
    const dates = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      dates.push({ dateObj: d, iso: CT.toIsoDate(d) });
    }

    if (
      preferredIsoDate &&
      CT.isValidIsoDate(preferredIsoDate) &&
      preferredIsoDate >= todayIso &&
      !dates.some(function (x) { return x.iso === preferredIsoDate; })
    ) {
      const parts = preferredIsoDate.split('-').map(Number);
      dates.unshift({ dateObj: new Date(parts[0], parts[1] - 1, parts[2]), iso: preferredIsoDate });
    }

    const activeIso = dates.some(function (x) { return x.iso === preferredIsoDate; })
      ? preferredIsoDate
      : dates[0].iso;
    state.date = activeIso;

    dates.forEach(function (entry) {
      const d = entry.dateObj;
      const iso = entry.iso;
      const isSelected = iso === activeIso;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'date-item tabular-nums' + (isSelected ? ' active' : '');
      item.dataset.isoDate = iso;
      item.setAttribute('aria-pressed', String(isSelected));
      item.setAttribute('aria-label', dayNames[d.getDay()] + ', ' + monthNames[d.getMonth()] + ' ' + d.getDate());
      item.innerHTML =
        '<span class="date-day">' + dayNames[d.getDay()] + '</span>' +
        '<span class="date-date">' + d.getDate() + '</span>' +
        '<span class="date-month">' + monthNames[d.getMonth()] + '</span>';

      item.addEventListener('click', async function () {
        if (state.date === iso) return;
        CT.activatePill(dateContainer.querySelectorAll('.date-item'), item);
        state.date = iso;
        await loadTheaters();
        await loadOccupiedSeats([]);
      });

      dateContainer.appendChild(item);
    });
  }

  function bindTimeSlots(preferredTime) {
    const CT = window.CineTicket;
    const slots = Array.from(document.querySelectorAll('.time-slot'));
    if (!slots.length) return;

    const matched = preferredTime
      ? slots.find(function (s) { return s.textContent.trim() === preferredTime; })
      : null;
    const initialActive = matched || slots.find(function (s) { return s.classList.contains('active'); }) || slots[0];

    CT.activatePill(slots, initialActive);
    state.time = initialActive.textContent.trim();

    slots.forEach(function (slot) {
      if (slot.dataset.timeBound === 'true') return;
      slot.dataset.timeBound = 'true';
      slot.addEventListener('click', function () {
        const chosen = slot.textContent.trim();
        if (state.time === chosen) return;
        CT.activatePill(slots, slot);
        state.time = chosen;
        loadOccupiedSeats([]);
      });
    });
  }

  function renderMovieStatusBanner(title, message, onRetry) {
    const movieInfo = document.querySelector('.movie-info');
    if (!movieInfo) return;
    const esc = window.CineTicket.escapeHtml;
    movieInfo.innerHTML =
      '<div class="movie-details">' +
      '<h1>' + esc(title) + '</h1>' +
      '<p class="muted-note">' + esc(message) + '</p>' +
      (onRetry
        ? '<button type="button" class="btn btn-primary booking-retry-btn"><i class="fas fa-undo" aria-hidden="true"></i> Retry Loading</button>'
        : '<a href="homepage.html" class="inline-action-link">Return to Movies Catalog &rarr;</a>') +
      '</div>';
    if (onRetry) {
      movieInfo.querySelector('.booking-retry-btn')?.addEventListener('click', onRetry);
    }
  }

  async function loadMovieDetails() {
    const CT = window.CineTicket;
    const esc = CT.escapeHtml;
    if (!/^\d+$/.test(state.movieCode) || parseInt(state.movieCode, 10) <= 0) {
      state.movieValid = false;
      renderMovieStatusBanner('Invalid Movie Parameter', 'Please return to the Movies catalog and select an active screening.');
      syncAuditoriumControls();
      updateSummaryPanel();
      return;
    }

    try {
      const qs = new URLSearchParams({ movie_code: state.movieCode });
      if (state.date) qs.set('date', state.date);
      const payload = await CT.fetchJson('/index.php/movie/movies/getMovieByCode?' + qs.toString());
      if (!payload.success || !payload.data) {
        state.movieValid = false;
        window.showToast(payload.message || 'Movie not found', 'error');
        renderMovieStatusBanner('Movie Not Found', 'Please return to the Movies catalog and choose an active screening.');
        syncAuditoriumControls();
        updateSummaryPanel();
        return;
      }

      state.movieValid = true;
      const movie = payload.data;
      state.unitPrice = parseFloat(movie.money) || 39.0;

      const movieInfo = document.querySelector('.movie-info');
      if (movieInfo) {
        movieInfo.innerHTML =
          '<img src="' + esc(CT.resolveAssetUrl(movie.img)) + '" alt="' + esc(movie.movie_name) + '" class="movie-poster">' +
          '<div class="movie-details">' +
          '<h1>' + esc(movie.movie_name) + '</h1>' +
          '<div class="movie-meta">' +
          '<span class="meta-item"><i class="fas fa-film" aria-hidden="true"></i> ' + esc(movie.movie_type) + '</span>' +
          '<span class="meta-item"><i class="fas fa-clock" aria-hidden="true"></i> ' + esc(movie.times) + '</span>' +
          '<span class="meta-item tabular-nums"><i class="fas fa-tag" aria-hidden="true"></i> $' + state.unitPrice.toFixed(2) + ' / seat</span>' +
          '</div>' +
          '<div class="movie-rating tabular-nums"><i class="fas fa-star" aria-hidden="true"></i> ' + esc(movie.star) + ' / 5.0</div>' +
          '</div>';
      }

      syncAuditoriumControls();
      updateSummaryPanel();
    } catch (_) {
      state.movieValid = false;
      window.showToast('Unable to load movie details', 'error');
      renderMovieStatusBanner('Connection Error', 'Unable to load screening metadata right now.', async function () {
        await Promise.all([loadMovieDetails(), loadTheaters()]);
        await loadOccupiedSeats(state.selectedSeats.slice());
      });
      syncAuditoriumControls();
      updateSummaryPanel();
    }
  }

  async function loadTheaters() {
    const select = document.getElementById('theater-select');
    if (!select) return;
    if (!/^\d+$/.test(state.movieCode) || parseInt(state.movieCode, 10) <= 0) {
      select.innerHTML = '<option value="">Unavailable</option>';
      state.theaterCode = '';
      state.theaterName = 'Unavailable';
      syncAuditoriumControls();
      updateSummaryPanel();
      return;
    }

    const CT = window.CineTicket;
    try {
      const qs = new URLSearchParams({ movie_code: state.movieCode });
      if (state.date) qs.set('date', state.date);
      const payload = await CT.fetchJson('/index.php/theater/theater/getTheaterList?' + qs.toString());
      if (!payload.success || !Array.isArray(payload.data) || !payload.data.length) {
        select.innerHTML = '<option value="">No theaters currently screening this movie</option>';
        state.theaterCode = '';
        state.theaterName = 'Unscheduled';
        syncAuditoriumControls();
        updateSummaryPanel();
        return;
      }

      const hasRequested = payload.data.some(function (t) {
        return String(t.theater_code) === String(state.theaterCode);
      });
      if (!hasRequested) {
        state.theaterCode = String(payload.data[0].theater_code);
      }

      const esc = CT.escapeHtml;
      select.innerHTML = payload.data.map(function (t) {
        const selected = String(t.theater_code) === String(state.theaterCode) ? ' selected' : '';
        return (
          '<option value="' + esc(t.theater_code) + '" data-name="' + esc(t.theater_name) + '"' + selected + '>' +
          esc(t.theater_name) + ' — ' + esc(t.address) +
          '</option>'
        );
      }).join('');

      const syncSelected = function () {
        const opt = select.options[select.selectedIndex];
        state.theaterCode = select.value;
        state.theaterName = opt ? (opt.getAttribute('data-name') || opt.textContent) : '';
      };

      syncSelected();
      if (select.dataset.changeBound !== 'true') {
        select.dataset.changeBound = 'true';
        select.addEventListener('change', function () {
          syncSelected();
          loadOccupiedSeats([]);
        });
      }

      syncAuditoriumControls();
      updateSummaryPanel();
    } catch (_) {
      window.showToast('Unable to load theater schedule right now', 'warning');
    }
  }

  async function loadOccupiedSeats(restoreList) {
    if (!isBookingReady() || !state.movieCode || !state.date || !state.time) {
      syncBookingUrl();
      return;
    }

    const CT = window.CineTicket;
    state.selectedSeats = [];
    state.loadingSeats = true;
    document.querySelectorAll('.seat[data-seat]').forEach(function (seatEl) {
      seatEl.classList.remove('selected');
      updateSeatAria(seatEl);
    });
    updateSummaryPanel();

    const seq = ++state.requestSeq;
    const params = new URLSearchParams({
      movie_code: state.movieCode,
      theater_code: state.theaterCode,
      date: state.date,
      time: state.time,
    });

    try {
      const payload = await CT.fetchJson('/index.php/movie/seat/getSeatList?' + params.toString());
      if (seq !== state.requestSeq) return;

      const occupiedSet = new Set(
        payload.success && Array.isArray(payload.data)
          ? payload.data.map(function (s) { return String(s.seat_num).toUpperCase(); })
          : []
      );

      const desiredRestore = new Set(
        CT.parseSeatCodes(restoreList)
          .filter(function (c) { return !occupiedSet.has(c); })
          .slice(0, MAX_SEATS)
      );

      document.querySelectorAll('.seat[data-seat]').forEach(function (seatEl) {
        const code = seatEl.dataset.seat;
        const isReserved = occupiedSet.has(code);
        const isRestored = !isReserved && desiredRestore.has(code);
        seatEl.classList.toggle('reserved', isReserved);
        seatEl.classList.toggle('selected', isRestored);
        updateSeatAria(seatEl);
        if (isRestored) {
          state.selectedSeats.push(code);
        }
      });

      CT.sortSeatCodes(state.selectedSeats);
      state.loadingSeats = false;
      updateSummaryPanel();
    } catch (_) {
      if (seq !== state.requestSeq) return;
      state.loadingSeats = false;
      window.showToast('Could not refresh seat availability', 'warning');
      updateSummaryPanel();
    }
  }

  function toggleSeatSelection(seatCode, seatEl) {
    const idx = state.selectedSeats.indexOf(seatCode);
    if (idx >= 0) {
      state.selectedSeats.splice(idx, 1);
      seatEl.classList.remove('selected');
    } else {
      if (state.selectedSeats.length >= MAX_SEATS) {
        window.showToast('Maximum ' + MAX_SEATS + ' seats per transaction', 'warning');
        return;
      }
      state.selectedSeats.push(seatCode);
      window.CineTicket.sortSeatCodes(state.selectedSeats);
      seatEl.classList.add('selected');
    }
    updateSeatAria(seatEl);
    updateSummaryPanel();
  }

  function clearSelectedSeats() {
    state.selectedSeats = [];
    document.querySelectorAll('.seat.selected[data-seat]').forEach(function (seatEl) {
      seatEl.classList.remove('selected');
      updateSeatAria(seatEl);
    });
    updateSummaryPanel();
  }

  function updateSummaryPanel() {
    const count = state.selectedSeats.length;
    const tagsContainer = document.querySelector('.seat-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = state.selectedSeats
        .map(function (code) {
          const isVip = VIP_ROWS.has(code[0]);
          return '<div class="seat-tag' + (isVip ? ' vip-tag' : '') + '">' + code + '</div>';
        })
        .join('');
    }
    document.getElementById('selectedSeatsInfo')?.classList.toggle('active', count > 0);

    const theaterEl = document.getElementById('summary-theater');
    const datetimeEl = document.getElementById('summary-datetime');
    const countEl = document.getElementById('summary-count');
    const unitEl = document.getElementById('summary-unit-price');
    const subtotalEl = document.getElementById('summary-price');
    const proceedBtn = document.querySelector('.proceed-button');

    if (theaterEl) theaterEl.textContent = state.theaterName;
    if (datetimeEl) datetimeEl.textContent = state.date + ' • ' + state.time;
    if (countEl) countEl.textContent = String(count);
    if (unitEl) unitEl.textContent = '$' + state.unitPrice.toFixed(2);

    const pricing = window.CineTicket.calculateCheckoutPricing(state.unitPrice, count, 0);
    if (subtotalEl) {
      subtotalEl.textContent = '$' + (pricing.subtotal - pricing.groupDiscount).toFixed(2) +
        (pricing.groupDiscount > 0 ? ' (30% group savings)' : '');
    }
    if (proceedBtn) {
      proceedBtn.disabled = !isBookingReady() || count === 0;
    }

    syncBookingUrl();
  }

  function viewSeatsInVR() {
    if (!isBookingReady()) return;
    const params = new URLSearchParams({
      movie_code: state.movieCode,
      theater_code: state.theaterCode || '1',
    });
    if (state.date) params.set('date', state.date);
    if (state.time) params.set('time', state.time);
    if (state.selectedSeats.length) {
      params.set('seat', state.selectedSeats[0]);
      params.set('seats', state.selectedSeats.join(','));
    }
    window.location.href = '3d-model.html?' + params.toString();
  }

  document.addEventListener('DOMContentLoaded', async function () {
    async function initFromQuery() {
      state.suppressUrlSync = true;
      const urlParams = new URLSearchParams(window.location.search);
      state.movieCode = urlParams.get('movie_code') || '1';
      state.theaterCode = urlParams.get('theater_code') || '1';
      const initialDate = urlParams.get('date') || '';
      const initialTime = urlParams.get('time') || '';
      const initialSeats = window.CineTicket.parseSeatCodes(urlParams.get('seats') || '');

      buildDateSelector(initialDate);
      bindTimeSlots(initialTime);
      await Promise.all([loadMovieDetails(), loadTheaters()]);
      state.suppressUrlSync = false;
      await loadOccupiedSeats(initialSeats);
    }

    buildSeatGrid();

    document.querySelector('.vr-button')?.addEventListener('click', viewSeatsInVR);
    document.getElementById('clear-seats-btn')?.addEventListener('click', clearSelectedSeats);

    document.querySelector('.proceed-button')?.addEventListener('click', function () {
      if (!isBookingReady() || !state.selectedSeats.length) {
        window.showToast('Please select at least one seat', 'warning');
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

    await initFromQuery();

    window.addEventListener('popstate', function () {
      initFromQuery();
    });
    window.addEventListener('pageshow', function (event) {
      if (event && event.persisted && isBookingReady()) {
        loadOccupiedSeats(state.selectedSeats.slice());
      }
    });
  });
})();