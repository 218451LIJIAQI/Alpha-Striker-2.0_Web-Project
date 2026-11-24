/**
 * Shared Admin Console Runtime
 * Centralizes authenticated API calls (X-Admin-Token), navigation, relation checklists,
 * reusable search/filter/sort/pagination table tools, anti-double-submit CRUD helpers, and Canvas charts.
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
    const isDark = document.documentElement.classList.contains('dark-mode');

    mount.innerHTML =
      '<nav class="admin-nav" aria-label="Admin Console Navigation">' +
      '<div class="nav-left">' +
      '<a href="dashboard.html" class="admin-logo"><i class="fas fa-shield-alt" aria-hidden="true"></i><span>CineTix Admin</span></a>' +
      '<div class="nav-links">' +
      items.map(function (item) {
        const isCurrent = item.key === activeKey;
        const cls = isCurrent ? 'active' : '';
        const aria = isCurrent ? ' aria-current="page"' : '';
        return '<a href="' + item.href + '" class="' + cls + '"' + aria + '><i class="' + item.icon + '" aria-hidden="true"></i> ' + item.label + '</a>';
      }).join('') +
      '</div>' +
      '</div>' +
      '<div class="admin-nav-right">' +
      '<a href="../pages/homepage.html" class="storefront-link" title="Open Public Box Office"><i class="fas fa-external-link-alt" aria-hidden="true"></i><span>Box Office</span></a>' +
      '<button type="button" class="dark-mode-toggle" id="admin-theme-toggle" title="Toggle Dark Mode" aria-label="Toggle Dark Mode" aria-pressed="' + String(isDark) + '">' +
      CT.themeToggleSvgMarkup() +
      '</button>' +
      '<div class="admin-user-profile">' +
      '<div class="admin-avatar"><i class="fas fa-user-shield" aria-hidden="true"></i></div>' +
      '<span class="admin-user-name">' + CT.escapeHtml(getAdminName()) + '</span>' +
      '</div>' +
      '<a href="login.html" class="logout-btn" id="admin-logout-btn"><i class="fas fa-sign-out-alt" aria-hidden="true"></i><span>Logout</span></a>' +
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

  function bindCheckControls(container, selectAllId, clearAllId) {
    document.getElementById(selectAllId)?.addEventListener('click', function () {
      container?.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = true; });
    });
    document.getElementById(clearAllId)?.addEventListener('click', function () {
      container?.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
    });
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
        if (btn.disabled) return;
        const id = btn.getAttribute('data-id');
        if (!window.confirm(opts.confirmText(id))) return;
        btn.disabled = true;
        const body = {};
        body[opts.idKey] = id;
        try {
          const res = await apiFetch(opts.endpoint, { method: 'POST', body: body });
          if (res.success) {
            window.showToast(typeof opts.successText === 'function' ? opts.successText(id) : opts.successText, 'success');
            opts.onSuccess();
            return;
          }
          window.showToast(res.message || 'Operation failed', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function bindImagePreview(inputEl, previewEl) {
    if (!inputEl || !previewEl) return function () {};
    previewEl.addEventListener('error', function () {
      previewEl.style.display = 'none';
    });
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

  async function submitForm(endpoint, payload, redirectUrl, successMsg, fallbackErr, submitBtn) {
    const btn = submitBtn || document.querySelector('.submit-btn');
    if (btn && btn.disabled) return;
    if (btn) btn.disabled = true;
    try {
      const res = await apiFetch(endpoint, { method: 'POST', body: payload });
      if (res.success) {
        window.showToast(successMsg, 'success');
        setTimeout(function () { window.location.href = redirectUrl; }, 420);
        return;
      }
      window.showToast(res.message || fallbackErr, 'error');
      if (btn) btn.disabled = false;
    } catch (_) {
      window.showToast(fallbackErr || 'Request failed', 'error');
      if (btn) btn.disabled = false;
    }
  }

  /**
   * Reusable client-side search, filter, sort & pagination controller for Admin tables.
   */
  function createTableController(config) {
    const toolbarEl = document.getElementById(config.toolbarId);
    const tbody = document.getElementById(config.tbodyId);
    let allItems = [];
    let query = '';
    let filterVal = 'all';
    let sortKey = (config.sorts && config.sorts[0] && config.sorts[0].key) || 'default';
    let page = 1;
    let pageSize = config.pageSize || 25;

    if (toolbarEl) {
      const filterSelectHtml = Array.isArray(config.filters) && config.filters.length
        ? '<select class="toolbar-select" data-role="filter" aria-label="Filter records">' +
          config.filters.map(function (f) {
            return '<option value="' + CT.escapeHtml(f.value) + '">' + CT.escapeHtml(f.label) + '</option>';
          }).join('') +
          '</select>'
        : '';

      const sortSelectHtml = Array.isArray(config.sorts) && config.sorts.length
        ? '<select class="toolbar-select" data-role="sort" aria-label="Sort records">' +
          config.sorts.map(function (s) {
            return '<option value="' + CT.escapeHtml(s.key) + '">' + CT.escapeHtml(s.label) + '</option>';
          }).join('') +
          '</select>'
        : '';

      toolbarEl.innerHTML =
        '<div class="admin-toolbar-left">' +
        '<input type="search" class="toolbar-search" placeholder="' + CT.escapeHtml(config.searchPlaceholder || 'Search records...') + '" aria-label="Search table">' +
        filterSelectHtml +
        sortSelectHtml +
        '</div>' +
        '<div class="admin-toolbar-right">' +
        '<span class="toolbar-count tabular-nums" data-role="count">0 records</span>' +
        '<div class="toolbar-pager" data-role="pager"></div>' +
        '</div>';

      toolbarEl.querySelector('.toolbar-search')?.addEventListener('input', function (e) {
        query = e.target.value.trim().toLowerCase();
        page = 1;
        render();
      });
      toolbarEl.querySelector('[data-role="filter"]')?.addEventListener('change', function (e) {
        filterVal = e.target.value;
        page = 1;
        render();
      });
      toolbarEl.querySelector('[data-role="sort"]')?.addEventListener('change', function (e) {
        sortKey = e.target.value;
        page = 1;
        render();
      });
    }

    function render() {
      if (!tbody) return;
      let list = allItems.slice();

      if (query && typeof config.searchText === 'function') {
        list = list.filter(function (item) {
          return String(config.searchText(item) || '').toLowerCase().includes(query);
        });
      }
      if (filterVal !== 'all' && typeof config.matchFilter === 'function') {
        list = list.filter(function (item) {
          return config.matchFilter(item, filterVal);
        });
      }
      const sortDef = (config.sorts || []).find(function (s) { return s.key === sortKey; });
      if (sortDef && typeof sortDef.compare === 'function') {
        list.sort(sortDef.compare);
      }

      const total = list.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (page > totalPages) page = totalPages;

      const slice = list.slice((page - 1) * pageSize, page * pageSize);

      if (toolbarEl) {
        const countEl = toolbarEl.querySelector('[data-role="count"]');
        if (countEl) {
          countEl.textContent =
            total === allItems.length
              ? (total + ' record' + (total === 1 ? '' : 's'))
              : ('Showing ' + slice.length + ' of ' + total + ' (filtered from ' + allItems.length + ')');
        }
        const pagerEl = toolbarEl.querySelector('[data-role="pager"]');
        if (pagerEl) {
          if (totalPages <= 1) {
            pagerEl.innerHTML = '';
          } else {
            pagerEl.innerHTML =
              '<button type="button" class="pager-btn" data-dir="-1"' + (page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">&lsaquo;</button>' +
              '<span class="pager-label tabular-nums">' + page + ' / ' + totalPages + '</span>' +
              '<button type="button" class="pager-btn" data-dir="1"' + (page >= totalPages ? ' disabled' : '') + ' aria-label="Next page">&rsaquo;</button>';
            pagerEl.querySelectorAll('.pager-btn').forEach(function (btn) {
              btn.addEventListener('click', function () {
                page += Number(btn.getAttribute('data-dir') || 0);
                render();
              });
            });
          }
        }
      }

      if (slice.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="' + (config.colSpan || 8) + '" class="empty-state">' +
          CT.escapeHtml(allItems.length === 0 ? (config.emptyText || 'No records found.') : 'No matching records for current filter.') +
          '</td></tr>';
        return;
      }

      tbody.innerHTML = slice.map(config.renderRow).join('');
      if (typeof config.afterRender === 'function') {
        config.afterRender(tbody);
      }
    }

    return {
      setItems: function (items) {
        allItems = Array.isArray(items) ? items : [];
        render();
      },
      refresh: render,
    };
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
    const textColor = isDark ? '#cbd5e1' : '#334155';
    const gridColor = isDark ? '#2d3648' : '#e2e8f0';

    if (!labels.length) {
      ctx.fillStyle = textColor;
      ctx.font = '14px Inter, sans-serif';
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
    const steps = Math.max(1, Math.min(4, Math.ceil(maxVal)));

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let step = 0; step <= steps; step++) {
      const y = padTop + plotH - (step / steps) * plotH;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round((step / steps) * maxVal)), padLeft - 6, y + 4);
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
      ctx.font = '600 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(val), x + barW / 2, y - 6);

      const shortLabel = label.length > 11 ? label.slice(0, 10) + '…' : label;
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(shortLabel, x + barW / 2, height - 16);
    });
  }

  window.AdminApp = {
    apiFetch: apiFetch,
    bindCheckControls: bindCheckControls,
    bindDeleteActions: bindDeleteActions,
    bindImagePreview: bindImagePreview,
    createTableController: createTableController,
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