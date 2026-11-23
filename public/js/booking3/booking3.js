/**
 * Interactive Seat Selection & Screening Schedule Controller
 */
(function () {
  'use strict';

  const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const SEATS_PER_ROW = 12;
  const MAX_SEATS = 10;
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
    loadingSeats: false,
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
        const seatEl = document.createElement('div');
        seatEl.className = 'seat' + (VIP_ROWS.has(rowLetter) ? ' vip' : '');
        seatEl.dataset.seat = seatCode;
        seatEl.title = 'Seat ' + seatCode + (VIP_ROWS.has(rowLetter) ? ' (Prime Row)' : '');
        seatEl.addEventListener('click', function () {
          if (!state.loadingSeats && !seatEl.classList.contains('reserved')) {
            toggleSeatSelection(seatCode, seatEl);
          }
        });
        rowEl.appendChild(seatEl);
      }

      container.appendChild(rowEl);
    });
  }

  function buildDateSelector(preferredIsoDate) {
    const dateContainer = document.querySelector('.date-selector');
    if (!dateContainer) return;

    dateContainer.innerHTML = '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const base = new Date();
    const dates = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      dates.push({ dateObj: d, iso: toIsoDate(d) });
    }

    if (preferredIsoDate && /^\d{4}-\d{2}-\d{2}$/.test(preferredIsoDate) && !dates.some(function (x) { return x.iso === preferredIsoDate; })) {
      const parts = preferredIsoDate.split('-').map(Number);
      const customObj = new Date(parts[0], parts[1] - 1, parts[2]);
      if (!isNaN(customObj.getTime())) {
        dates.unshift({ dateObj: customObj, iso: preferredIsoDate });
      }
    }

    const activeIso = dates.some(function (x) { return x.iso === preferredIsoDate; })
      ? preferredIsoDate
      : dates[0].iso;
    state.date = activeIso;

    dates.forEach(function (entry) {
      const d = entry.dateObj;
      const iso = entry.iso;
      const item = document.createElement('div');
      item.className = 'date-item' + (iso === activeIso ? ' active' : '');
      item.dataset.isoDate = iso;
      item.innerHTML =
        '<span class="date-day">' + dayNames[d.getDay()] + '</span>' +
        '<span class="date-date">' + d.getDate() + '</span>' +
        '<span class="date-month">' + monthNames[d.getMonth()] + '</span>';

      item.addEventListener('click', function () {
        if (state.date === iso) return;
        dateContainer.querySelectorAll('.date-item').forEach(function (el) { el.classList.remove('active'); });
        item.classList.add('active');
        state.date = iso;
        loadOccupiedSeats([]);
      });

      dateContainer.appendChild(item);
    });
  }

  function bindTimeSlots(preferredTime) {
    const slots = Array.from(document.querySelectorAll('.time-slot'));
    if (!slots.length) return;

    if (preferredTime) {
      const matched = slots.find(function (s) { return s.textContent.trim() === preferredTime; });
      if (matched) {
        slots.forEach(function (s) { s.classList.remove('active'); });
        matched.classList.add('active');
      }
    }

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
        loadOccupiedSeats([]);
      });
    });
  }

  async function loadMovieDetails() {
    const CT = window.CineTicket;
    try {
      const payload = await CT.fetchJson('/index.php/movie/movies/getMovieByCode?movie_code=' + encodeURIComponent(state.movieCode));
      if (!payload.success || !payload.data) {
        window.showToast(payload.message || 'Movie not found', 'error');
        return;
      }

      const movie = payload.data;
      state.unitPrice = parseFloat(movie.money) || 39.0;

      const esc = CT.escapeHtml;
      const movieInfo = document.querySelector('.movie-info');
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
      window.showToast('Unable to load movie details', 'error');
    }
  }

  async function loadTheaters() {
    const select = document.getElementById('theater-select');
    if (!select) return;

    const CT = window.CineTicket;
    try {
      const payload = await CT.fetchJson(
        '/index.php/theater/theater/getTheaterList?movie_code=' + encodeURIComponent(state.movieCode)
      );
      if (!payload.success || !Array.isArray(payload.data) || !payload.data.length) {
        select.innerHTML = '<option value="">No theaters currently screening this movie</option>';
        state.theaterCode = '';
        state.theaterName = 'Unscheduled';
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
      select.addEventListener('change', function () {
        syncSelected();
        loadOccupiedSeats([]);
      });

      updateSummaryPanel();
    } catch (_) {
      // Keep default theater fallback if offline
    }
  }

  function sortSeatCodes(list) {
    return list.sort(function (a, b) {
      return a[0] === b[0]
        ? parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10)
        : a.localeCompare(b);
    });
  }

  async function loadOccupiedSeats(restoreList) {
    if (!state.movieCode || !state.theaterCode || !state.date || !state.time) return;

    state.selectedSeats = [];
    state.loadingSeats = true;
    document.querySelectorAll('.seat[data-seat]').forEach(function (seatEl) {
      seatEl.classList.remove('selected');
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
      const payload = await window.CineTicket.fetchJson('/index.php/movie/seat/getSeatList?' + params.toString());
      if (seq !== state.requestSeq) return;

      const occupiedSet = new Set(
        payload.success && Array.isArray(payload.data)
          ? payload.data.map(function (s) { return String(s.seat_num).toUpperCase(); })
          : []
      );

      const desiredRestore = new Set(
        Array.isArray(restoreList)
          ? restoreList
              .map(function (c) { return String(c).trim().toUpperCase(); })
              .filter(function (c) { return /^[A-H](?:[1-9]|1[0-2])$/.test(c) && !occupiedSet.has(c); })
              .slice(0, MAX_SEATS)
          : []
      );

      document.querySelectorAll('.seat[data-seat]').forEach(function (seatEl) {
        const code = seatEl.dataset.seat;
        const isReserved = occupiedSet.has(code);
        const isRestored = !isReserved && desiredRestore.has(code);
        seatEl.classList.toggle('reserved', isReserved);
        seatEl.classList.toggle('selected', isRestored);
        if (isRestored) {
          state.selectedSeats.push(code);
        }
      });

      sortSeatCodes(state.selectedSeats);
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
      sortSeatCodes(state.selectedSeats);
      seatEl.classList.add('selected');
    }
    updateSummaryPanel();
  }

  function updateSummaryPanel() {
    const count = state.selectedSeats.length;
    const tagsContainer = document.querySelector('.seat-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = state.selectedSeats
        .map(function (code) { return '<div class="seat-tag">' + code + '</div>'; })
        .join('');
    }
    document.getElementById('selectedSeatsInfo')?.classList.toggle('active', count > 0);

    const theaterEl = document.getElementById('summary-theater');
    const datetimeEl = document.getElementById('summary-datetime');
    const countEl = document.getElementById('summary-count');
    const subtotalEl = document.getElementById('summary-price');
    const proceedBtn = document.querySelector('.proceed-button');

    if (theaterEl) theaterEl.textContent = state.theaterName;
    if (datetimeEl) datetimeEl.textContent = state.date + ' • ' + state.time;
    if (countEl) countEl.textContent = String(count);

    const pricing = window.CineTicket.calculateCheckoutPricing(state.unitPrice, count, 0);
    if (subtotalEl) {
      subtotalEl.textContent = '$' + (pricing.subtotal - pricing.groupDiscount).toFixed(2) +
        (pricing.groupDiscount > 0 ? ' (30% group savings)' : '');
    }
    if (proceedBtn) {
      proceedBtn.disabled = count === 0 || !state.theaterCode;
    }
  }

  window.viewSeatsInVR = function () {
    const params = new URLSearchParams({
      movie_code: state.movieCode,
      theater_code: state.theaterCode || '1',
    });
    if (state.selectedSeats.length) {
      params.set('seat', state.selectedSeats[0]);
    }
    window.location.href = '3d-model.html?' + params.toString();
  };

  document.addEventListener('DOMContentLoaded', async function () {
    const urlParams = new URLSearchParams(window.location.search);
    state.movieCode = urlParams.get('movie_code') || '1';
    state.theaterCode = urlParams.get('theater_code') || '1';
    const initialDate = urlParams.get('date') || '';
    const initialTime = urlParams.get('time') || '';
    const initialSeats = (urlParams.get('seats') || '')
      .split(',')
      .map(function (s) { return s.trim().toUpperCase(); })
      .filter(Boolean);

    buildSeatGrid();
    buildDateSelector(initialDate);
    bindTimeSlots(initialTime);

    document.querySelector('.proceed-button')?.addEventListener('click', function () {
      if (!state.selectedSeats.length) {
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

    await Promise.all([loadMovieDetails(), loadTheaters()]);
    await loadOccupiedSeats(initialSeats);
  });
})();