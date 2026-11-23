/**
 * Shared Admin Console Runtime
 * Reuses CineTicket core utilities (escaping, asset paths, dark mode) and centralizes
 * authenticated API calls (X-Admin-Token), navigation, relation checklists, CRUD helpers, and Canvas charts.
 */
(function () {
  'use strict';

  const CT = window.CineTicket;

  function getToken() {
    return localStorage.getItem('adminToken') || '';
  }

  function getAdminName() {
    return localStorage.getItem('adminUser') || 'admin';
  }

  function clearAdminSession() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    localStorage.removeItem('adminRemember');
  }

  async function apiFetch(url, options) {
    const opts = Object.assign({ credentials: 'same-origin' }, options || {});
    const headers = Object.assign({}, opts.headers || {});
    const token = getToken();
    if (token) {
      headers['X-Admin-Token'] = token;
    }
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    opts.headers = headers;

    const response = await fetch(url, opts);
    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      payload = { success: false, message: 'Invalid server response' };
    }

    if (response.status === 401 || response.status === 403) {
      clearAdminSession();
      if (!(window.location.pathname || '').endsWith('/login.html')) {
        window.location.href = 'login.html';
      }
    }

    return payload;
  }

  async function ensureAuthenticated() {
    if ((window.location.pathname || '').endsWith('/login.html')) return true;
    if (!getToken()) {
      window.location.href = 'login.html';
      return false;
    }

    try {
      const res = await apiFetch('/index.php/admin/auth/checkAuth', { method: 'POST' });
      if (!res || !res.success) {
        clearAdminSession();
        window.location.href = 'login.html';
        return false;
      }
      return true;
    } catch (_) {
      window.location.href = 'login.html';
      return false;
    }
  }

  async function logoutAdmin(event) {
    if (event) event.preventDefault();
    try {
      await apiFetch('/index.php/admin/auth/logout', { method: 'POST' });
    } catch (_) {
      // Proceed with local cleanup
    }
    clearAdminSession();
    window.location.href = 'login.html';
  }

  function renderAdminNav(activeKey) {
    const mount = document.getElementById('admin-nav-container');
    if (!mount) return;

    const items = [
      { key: 'dashboard', href: 'dashboard.html', icon: 'fas fa-chart-pie', label: 'Dashboard' },
      { key: 'movies', href: 'movies.html', icon: 'fas fa-film', label: 'Movies' },
      { key: 'theaters', href: 'theaters.html', icon: 'fas fa-building', label: 'Theaters' },
      { key: 'offers', href: 'offers.html', icon: 'fas fa-tags', label: 'Offers' },
      { key: 'seats', href: 'seat.html', icon: 'fas fa-chair', label: 'Seat Bookings' },
      { key: 'users', href: 'user.html', icon: 'fas fa-users', label: 'Users' },
    ];

    mount.innerHTML =
      '<nav class="admin-nav">' +
      '<div class="nav-left">' +
      '<a href="dashboard.html" class="admin-logo"><i class="fas fa-shield-alt"></i><span>CineTix Admin</span></a>' +
      '<div class="nav-links">' +
      items.map(function (item) {
        const cls = item.key === activeKey ? 'active' : '';
        return '<a href="' + item.href + '" class="' + cls + '"><i class="' + item.icon + '"></i> ' + item.label + '</a>';
      }).join('') +
      '</div>' +
      '</div>' +
      '<div class="admin-nav-right">' +
      '<button type="button" class="dark-mode-toggle" id="admin-theme-toggle" title="Toggle Dark Mode" aria-label="Toggle Dark Mode">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="moon-icon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sun-icon"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line></svg>' +
      '</button>' +
      '<div class="admin-user-profile">' +
      '<div class="admin-avatar"><i class="fas fa-user-shield"></i></div>' +
      '<span class="admin-user-name">' + CT.escapeHtml(getAdminName()) + '</span>' +
      '</div>' +
      '<a href="login.html" class="logout-btn" id="admin-logout-btn"><i class="fas fa-sign-out-alt"></i><span>Logout</span></a>' +
      '</div>' +
      '</nav>';

    document.getElementById('admin-theme-toggle')?.addEventListener('click', CT.toggleDarkMode);
    document.getElementById('admin-logout-btn')?.addEventListener('click', logoutAdmin);
  }

  function renderCheckList(container, items, idKey, labelFn, checkedIds) {
    if (!container) return;
    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = '<span class="form-hint">No items available.</span>';
      return;
    }

    const checkedSet = checkedIds === null || checkedIds === undefined
      ? null
      : new Set(checkedIds.map(function (v) { return Number(v); }));

    container.innerHTML = items.map(function (item) {
      const id = Number(item[idKey]);
      const isChecked = checkedSet === null ? true : checkedSet.has(id);
      return (
        '<label class="relation-check-item">' +
        '<input type="checkbox" value="' + id + '"' + (isChecked ? ' checked' : '') + '>' +
        '<span>' + CT.escapeHtml(labelFn(item)) + '</span>' +
        '</label>'
      );
    }).join('');
  }

  function getCheckedIds(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
      .map(function (el) { return parseInt(el.value, 10); })
      .filter(function (n) { return n > 0; });
  }

  function bindDeleteActions(container, opts) {
    container.querySelectorAll(opts.selector || '.delete-btn').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-id');
        if (!window.confirm(opts.confirmText(id))) return;
        const body = {};
        body[opts.idKey] = id;
        const res = await apiFetch(opts.endpoint, { method: 'POST', body: body });
        if (res.success) {
          window.showToast(typeof opts.successText === 'function' ? opts.successText(id) : opts.successText, 'success');
          opts.onSuccess();
        } else {
          window.showToast(res.message || 'Operation failed', 'error');
        }
      });
    });
  }

  function bindImagePreview(inputEl, previewEl) {
    function sync() {
      const val = inputEl.value.trim();
      if (/\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(val) || val.startsWith('data:')) {
        previewEl.src = CT.resolveAssetUrl(val);
        previewEl.style.display = 'block';
      } else {
        previewEl.style.display = 'none';
      }
    }
    inputEl.addEventListener('change', sync);
    inputEl.addEventListener('input', sync);
    return sync;
  }

  async function submitForm(endpoint, payload, redirectUrl, successMsg, fallbackErr) {
    const res = await apiFetch(endpoint, { method: 'POST', body: payload });
    if (res.success) {
      window.showToast(successMsg, 'success');
      setTimeout(function () { window.location.href = redirectUrl; }, 500);
    } else {
      window.showToast(res.message || fallbackErr, 'error');
    }
  }

  function drawBarChart(canvas, labels, values, colors) {
    if (!canvas || !canvas.getContext) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 460;
    const height = 240;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const isDark = document.documentElement.classList.contains('dark-mode');
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    if (!labels.length) {
      ctx.fillStyle = textColor;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', width / 2, height / 2);
      return;
    }

    const padLeft = 40;
    const padRight = 20;
    const padTop = 24;
    const padBottom = 44;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const maxVal = Math.max(1, Math.max.apply(null, values));

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let step = 0; step <= 4; step++) {
      const y = padTop + plotH - (step / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round((step / 4) * maxVal)), padLeft - 6, y + 4);
    }

    const slotW = plotW / labels.length;
    const barW = Math.min(44, slotW * 0.58);

    labels.forEach(function (label, idx) {
      const val = values[idx] || 0;
      const barH = (val / maxVal) * plotH;
      const x = padLeft + idx * slotW + (slotW - barW) / 2;
      const y = padTop + plotH - barH;

      ctx.fillStyle = colors[idx % colors.length];
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, barW, barH, 6) : ctx.rect(x, y, barW, barH);
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(val), x + barW / 2, y - 6);

      const shortLabel = label.length > 10 ? label.slice(0, 9) + '…' : label;
      ctx.font = '11px sans-serif';
      ctx.fillText(shortLabel, x + barW / 2, height - 16);
    });
  }

  window.AdminApp = {
    apiFetch: apiFetch,
    bindDeleteActions: bindDeleteActions,
    bindImagePreview: bindImagePreview,
    drawBarChart: drawBarChart,
    ensureAuthenticated: ensureAuthenticated,
    escapeHtml: CT.escapeHtml,
    getCheckedIds: getCheckedIds,
    renderAdminNav: renderAdminNav,
    renderCheckList: renderCheckList,
    resolveAdminAsset: CT.resolveAssetUrl,
    submitForm: submitForm,
  };
})();