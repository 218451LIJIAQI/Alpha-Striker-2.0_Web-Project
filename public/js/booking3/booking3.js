/**
 * Interactive Seat Selection, Keyboard Matrix Navigation & Screening Schedule Controller
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
  };

  function isBookingReady() {
    return Boolean(state.movieValid && state.theaterCode);
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
    const dates = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      dates.push({ dateObj: d, iso: CT.toIsoDate(d) });
    }

    if (preferredIsoDate && CT.isValidIsoDate(preferredIsoDate) && !dates.some(function (x) { return x.iso === preferredIsoDate; })) {
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

      item.addEventListener('click', function () {
        if (state.date === iso) return;
        dateContainer.querySelectorAll('.date-item').forEach(function (el) {
          el.classList.remove('active');
          el.setAttribute('aria-pressed', 'false');
        });
        item.classList.add('active');
        item.setAttribute('aria-pressed', 'true');
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
      const isAct = slot.classList.contains('active');
      slot.setAttribute('aria-pressed', String(isAct));
      if (isAct) {
        state.time = slot.textContent.trim();
      }
      slot.addEventListener('click', function () {
        const chosen = slot.textContent.trim();
        if (state.time === chosen) return;
        slots.forEach(function (s) {
          s.classList.remove('active');
          s.setAttribute('aria-pressed', 'false');
        });
        slot.classList.add('active');
        slot.setAttribute('aria-pressed', 'true');
        state.time = chosen;
        loadOccupiedSeats([]);
      });
    });
  }

  async function loadMovieDetails() {
    const CT = window.CineTicket;
    const esc = CT.escapeHtml;
    if (!/^\d+$/.test(state.movieCode) || parseInt(state.movieCode, 10) <= 0) {
      state.movieValid = false;
      const movieInfo = document.querySelector('.movie-info');
      if (movieInfo) {
        movieInfo.innerHTML =
          '<div class="movie-details">' +
          '<h1>Invalid Movie Parameter</h1>' +
          '<p class="muted-note">Please return to the Movies catalog and select an active screening.</p>' +
          '<a href="homepage.html" class="inline-action-link">Return to Movies Catalog &rarr;</a>' +
          '</div>';
      }
      syncAuditoriumControls();
      updateSummaryPanel();
      return;
    }

    try {
      const payload = await CT.fetchJson('/index.php/movie/movies/getMovieByCode?movie_code=' + encodeURIComponent(state.movieCode));
      if (!payload.success || !payload.data) {
        state.movieValid = false;
        window.showToast(payload.message || 'Movie not found', 'error');
        const movieInfo = document.querySelector('.movie-info');
        if (movieInfo) {
          movieInfo.innerHTML =
            '<div class="movie-details">' +
            '<h1>Movie Not Found</h1>' +
            '<p class="muted-note">Please return to the Movies catalog and choose an active screening.</p>' +
            '<a href="homepage.html" class="inline-action-link">Return to Movies Catalog &rarr;</a>' +
            '</div>';
        }
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
      window.showToast('Unable to load movie details', 'error');
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
      const payload = await CT.fetchJson(
        '/index.php/theater/theater/getTheaterList?movie_code=' + encodeURIComponent(state.movieCode)
      );
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
      select.addEventListener('change', function () {
        syncSelected();
        loadOccupiedSeats([]);
      });

      syncAuditoriumControls();
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
    if (!isBookingReady() || !state.movieCode || !state.date || !state.time) return;

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
        updateSeatAria(seatEl);
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

    await Promise.all([loadMovieDetails(), loadTheaters()]);
    await loadOccupiedSeats(initialSeats);

    window.addEventListener('pageshow', function (event) {
      if (event && event.persisted && isBookingReady()) {
        loadOccupiedSeats(state.selectedSeats.slice());
      }
    });
  });
})();