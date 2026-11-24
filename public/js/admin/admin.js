/**
 * Shared Admin Console Runtime
 * Centralizes authenticated API calls (X-Admin-Token), cross-tab session guard, navigation,
 * relation checklists, accessible search/filter/sort/reset/pagination/atomic-bulk-action/CSV(formula-safe)/print table controller,
 * load-error retry handling, anti-double-submit CRUD helpers, and Canvas charts.
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
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', function (e) {
      if (e && (e.key === 'adminToken' || e.key === null) && !getToken()) {
        const path = window.location.pathname || '';
        if (path.includes('/admin/') && !path.endsWith('/login.html')) {
          window.location.href = 'login.html';
        }
      }
    });
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

  function getQueryId(paramName, fallbackUrl) {
    const raw = (new URLSearchParams(window.location.search).get(paramName) || '').trim();
    if (!/^[1-9]\d*$/.test(raw)) {
      if (fallbackUrl) window.location.href = fallbackUrl;
      return '';
    }
    return raw;
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

  function populateUserSelect(selectEl, users, selectedCode) {
    if (!selectEl || !Array.isArray(users)) return;
    users.forEach(function (u) {
      const opt = document.createElement('option');
      opt.value = String(u.user_code);
      opt.textContent = u.user_name + ' (' + u.email + ')';
      selectEl.appendChild(opt);
    });
    if (selectedCode !== undefined && selectedCode !== null && selectedCode !== '') {
      selectEl.value = String(selectedCode);
    }
  }

  function ensureSelectOption(selectEl, value) {
    if (!selectEl || !value) return;
    const strVal = String(value);
    const exists = Array.from(selectEl.options || []).some(function (o) { return o.value === strVal; });
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = strVal;
      opt.textContent = strVal;
      selectEl.appendChild(opt);
    }
    selectEl.value = strVal;
  }

  function sanitizeCsvCell(value) {
    const raw = value === null || value === undefined ? '' : String(value);
    const safe = (/^[\t\r\n ]*[=+\-@]/.test(raw) || /^[\t\r]/.test(raw)) ? ("'" + raw) : raw;
    return /[",\r\n]/.test(safe) ? ('"' + safe.replace(/"/g, '""') + '"') : safe;
  }

  function downloadCsv(filename, headers, rows) {
    const lines = [(headers || []).map(sanitizeCsvCell).join(',')].concat(
      (rows || []).map(function (r) { return r.map(sanitizeCsvCell).join(','); })
    );
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
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
        } catch (_) {
          window.showToast('Network error while processing delete request', 'error');
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
      if (/\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(val) || /^data:image\//i.test(val)) {
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

  function renderFormLoadError(formEl, message, backHref, backLabel, onRetry) {
    if (!formEl) return;
    formEl.innerHTML =
      '<div class="empty-state table-error-state" role="alert">' +
      '<strong>Unable to load record:</strong> ' + CT.escapeHtml(message || 'Record could not be retrieved.') +
      '<div class="form-actions" style="justify-content:center;border-top:0;padding-top:14px;margin-top:10px;">' +
      (typeof onRetry === 'function'
        ? '<button type="button" class="submit-btn" data-role="retry-form"><i class="fas fa-undo" aria-hidden="true"></i> Retry</button>'
        : '') +
      '<a href="' + CT.escapeHtml(backHref || 'dashboard.html') + '" class="cancel-btn">' + CT.escapeHtml(backLabel || 'Back to List') + '</a>' +
      '</div></div>';
    if (typeof onRetry === 'function') {
      formEl.querySelector('[data-role="retry-form"]')?.addEventListener('click', onRetry);
    }
  }

  function validateFields(rules) {
    let firstInvalidEl = null;
    let firstMessage = '';
    (rules || []).forEach(function (rule) {
      if (!rule || !rule.el) return;
      CT.clearFieldError(rule.el);
      const ok = typeof rule.check === 'function' ? Boolean(rule.check(rule.el.value, rule.el)) : true;
      if (!ok) {
        const isFirst = firstInvalidEl === null;
        if (isFirst) {
          firstInvalidEl = rule.el;
          firstMessage = rule.message || 'Please review highlighted fields';
        }
        CT.flagFieldError(rule.el, rule.message || 'Invalid value', !isFirst);
      }
    });
    if (firstInvalidEl) {
      window.showToast(firstMessage, 'warning');
      return false;
    }
    return true;
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
   * Reusable client-side search, filter, whitelisted sort, reset, pagination, atomic bulk-action, error/retry & CSV/Print controller.
   */
  function createTableController(config) {
    const toolbarEl = document.getElementById(config.toolbarId);
    const tbody = document.getElementById(config.tbodyId);
    const defaultSortKey = (config.sorts && config.sorts[0] && config.sorts[0].key) || 'default';
    const allowedSortKeys = new Set((config.sorts || []).map(function (s) { return s.key; }));
    const idPrefix = String(config.toolbarId || 'admin-toolbar').replace(/[^A-Za-z0-9_-]/g, '');
    let allItems = [];
    let filteredCache = [];
    let loadError = '';
    let loadSeq = 0;
    let query = '';
    let filterVal = 'all';
    let sortKey = defaultSortKey;
    let page = 1;
    const pageSize = config.pageSize || 25;
    const selectedIds = new Set();
    const bulkCfg = config.bulkAction || null;
    const deleteCfg = config.deleteAction || null;
    const exportCfg = config.exportCsv || null;

    async function reload() {
      if (!config.endpoint) return;
      const seq = ++loadSeq;
      try {
        const res = await apiFetch(config.endpoint);
        if (seq !== loadSeq) return;
        if (res && res.success && Array.isArray(res.data)) {
          loadError = '';
          setItems(res.data);
          return;
        }
        setError((res && res.message) || 'Failed to load records.');
      } catch (_) {
        if (seq !== loadSeq) return;
        setError('Unable to reach server. Check connection and retry.');
      }
    }

    if (toolbarEl) {
      const searchInputId = idPrefix + '-search';
      const filterSelectId = idPrefix + '-filter';
      const sortSelectId = idPrefix + '-sort';

      const filterSelectHtml = Array.isArray(config.filters) && config.filters.length
        ? '<label class="sr-only" for="' + CT.escapeHtml(filterSelectId) + '">Filter records</label>' +
          '<select id="' + CT.escapeHtml(filterSelectId) + '" class="toolbar-select" data-role="filter" aria-label="Filter records">' +
          config.filters.map(function (f) {
            return '<option value="' + CT.escapeHtml(f.value) + '">' + CT.escapeHtml(f.label) + '</option>';
          }).join('') +
          '</select>'
        : '';

      const sortSelectHtml = Array.isArray(config.sorts) && config.sorts.length
        ? '<label class="sr-only" for="' + CT.escapeHtml(sortSelectId) + '">Sort records</label>' +
          '<select id="' + CT.escapeHtml(sortSelectId) + '" class="toolbar-select" data-role="sort" aria-label="Sort records">' +
          config.sorts.map(function (s) {
            return '<option value="' + CT.escapeHtml(s.key) + '">' + CT.escapeHtml(s.label) + '</option>';
          }).join('') +
          '</select>'
        : '';

      const resetBtnHtml = '<button type="button" class="toolbar-btn is-hidden" data-role="reset" aria-label="Reset table filters">Reset</button>';
      const bulkBtnHtml = bulkCfg
        ? '<button type="button" class="delete-btn toolbar-bulk-btn is-hidden" data-role="bulk"></button>'
        : '';
      const exportBtnsHtml = exportCfg
        ? '<button type="button" class="toolbar-btn" data-role="export" title="Export filtered rows as CSV"><i class="fas fa-clipboard-list" aria-hidden="true"></i> Export CSV</button>' +
          '<button type="button" class="toolbar-btn" data-role="print" title="Print current table"><i class="fas fa-print" aria-hidden="true"></i> Print</button>'
        : '';

      toolbarEl.innerHTML =
        '<div class="admin-toolbar-left">' +
        '<label class="sr-only" for="' + CT.escapeHtml(searchInputId) + '">Search records</label>' +
        '<input id="' + CT.escapeHtml(searchInputId) + '" type="search" class="toolbar-search" placeholder="' + CT.escapeHtml(config.searchPlaceholder || 'Search records...') + '" aria-label="Search table">' +
        filterSelectHtml +
        sortSelectHtml +
        resetBtnHtml +
        '</div>' +
        '<div class="admin-toolbar-right">' +
        bulkBtnHtml +
        exportBtnsHtml +
        '<span class="toolbar-count tabular-nums" data-role="count">0 records</span>' +
        '<div class="toolbar-pager" data-role="pager"></div>' +
        '</div>';

      const searchEl = toolbarEl.querySelector('.toolbar-search');
      const filterEl = toolbarEl.querySelector('[data-role="filter"]');
      const sortEl = toolbarEl.querySelector('[data-role="sort"]');

      searchEl?.addEventListener('input', function (e) {
        query = e.target.value.trim().toLowerCase();
        page = 1;
        render();
      });
      filterEl?.addEventListener('change', function (e) {
        filterVal = e.target.value;
        page = 1;
        render();
      });
      sortEl?.addEventListener('change', function (e) {
        const nextSort = e.target.value;
        sortKey = allowedSortKeys.has(nextSort) ? nextSort : defaultSortKey;
        page = 1;
        render();
      });
      toolbarEl.querySelector('[data-role="reset"]')?.addEventListener('click', function () {
        query = '';
        filterVal = 'all';
        sortKey = defaultSortKey;
        page = 1;
        if (searchEl) searchEl.value = '';
        if (filterEl) filterEl.value = 'all';
        if (sortEl) sortEl.value = defaultSortKey;
        render();
      });
      toolbarEl.querySelector('[data-role="export"]')?.addEventListener('click', function () {
        if (!exportCfg) return;
        downloadCsv(
          exportCfg.filename || 'cinetix-export.csv',
          exportCfg.headers || [],
          filteredCache.map(exportCfg.row)
        );
      });
      toolbarEl.querySelector('[data-role="print"]')?.addEventListener('click', function () {
        window.print();
      });
      toolbarEl.querySelector('[data-role="bulk"]')?.addEventListener('click', async function (e) {
        if (!bulkCfg || !selectedIds.size) return;
        const btn = e.currentTarget;
        if (btn.disabled) return;
        const ids = Array.from(selectedIds);
        const msg = typeof bulkCfg.confirmText === 'function'
          ? bulkCfg.confirmText(ids.length)
          : ('Delete ' + ids.length + ' selected record(s)?');
        if (!window.confirm(msg)) return;
        btn.disabled = true;
        let okCount = 0;
        try {
          if (bulkCfg.batchKey) {
            const batchPayload = {};
            batchPayload[bulkCfg.batchKey] = ids;
            const res = await apiFetch(bulkCfg.endpoint, { method: 'POST', body: batchPayload });
            if (res && res.success) {
              okCount = (res.data && Number(res.data.deleted_count)) || ids.length;
              ids.forEach(function (id) { selectedIds.delete(id); });
            } else if (res && res.message) {
              window.showToast(res.message, 'error');
              return;
            }
          } else {
            for (let i = 0; i < ids.length; i++) {
              const payload = {};
              payload[bulkCfg.idKey] = ids[i];
              const res = await apiFetch(bulkCfg.endpoint, { method: 'POST', body: payload });
              if (res && res.success) {
                okCount += 1;
                selectedIds.delete(ids[i]);
              }
            }
          }
          if (okCount > 0) {
            window.showToast((bulkCfg.successPrefix || 'Removed') + ' ' + okCount + ' record(s)', 'success');
            if (typeof bulkCfg.onSuccess === 'function') bulkCfg.onSuccess();
            else reload();
          } else {
            window.showToast('Bulk operation could not complete', 'error');
          }
        } catch (_) {
          window.showToast('Network error during bulk operation', 'error');
        } finally {
          btn.disabled = false;
        }
      });
    }

    const checkAllEl = tbody && tbody.closest && tbody.closest('table')
      ? tbody.closest('table').querySelector('[data-role="check-all"]')
      : null;

    function syncBulkToolbar(slice) {
      if (!bulkCfg || !toolbarEl) return;
      const bulkBtn = toolbarEl.querySelector('[data-role="bulk"]');
      if (bulkBtn) {
        const n = selectedIds.size;
        bulkBtn.classList.toggle('is-hidden', n === 0);
        bulkBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i> ' + CT.escapeHtml((bulkCfg.label || 'Delete Selected') + ' (' + n + ')');
      }
      if (checkAllEl) {
        const sliceIds = (slice || []).map(function (it) { return String(it[bulkCfg.idKey]); });
        checkAllEl.checked = sliceIds.length > 0 && sliceIds.every(function (id) { return selectedIds.has(id); });
      }
    }

    checkAllEl?.addEventListener('change', function () {
      if (!bulkCfg || !tbody) return;
      tbody.querySelectorAll('.row-check').forEach(function (cb) {
        cb.checked = checkAllEl.checked;
        if (checkAllEl.checked) selectedIds.add(String(cb.value));
        else selectedIds.delete(String(cb.value));
      });
      syncBulkToolbar(filteredCache.slice((page - 1) * pageSize, page * pageSize));
    });

    function render() {
      if (!tbody) return;

      if (loadError) {
        filteredCache = [];
        if (toolbarEl) {
          const countEl = toolbarEl.querySelector('[data-role="count"]');
          if (countEl) countEl.textContent = 'Load failed';
          const pagerEl = toolbarEl.querySelector('[data-role="pager"]');
          if (pagerEl) pagerEl.innerHTML = '';
        }
        tbody.innerHTML =
          '<tr><td colspan="' + (config.colSpan || 8) + '" class="empty-state table-error-state" role="alert">' +
          '<strong>Unable to load records:</strong> ' + CT.escapeHtml(loadError) +
          (config.endpoint ? ' <button type="button" class="toolbar-btn retry-table-btn"><i class="fas fa-undo" aria-hidden="true"></i> Retry</button>' : '') +
          '</td></tr>';
        tbody.querySelector('.retry-table-btn')?.addEventListener('click', reload);
        syncBulkToolbar([]);
        return;
      }

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

      filteredCache = list;
      const total = list.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (page > totalPages) page = totalPages;

      const slice = list.slice((page - 1) * pageSize, page * pageSize);

      if (toolbarEl) {
        const resetEl = toolbarEl.querySelector('[data-role="reset"]');
        if (resetEl && resetEl.classList) {
          resetEl.classList.toggle('is-hidden', !query && filterVal === 'all' && sortKey === defaultSortKey);
        }
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
        syncBulkToolbar([]);
        return;
      }

      tbody.innerHTML = slice.map(config.renderRow).join('');
      if (bulkCfg) {
        tbody.querySelectorAll('.row-check').forEach(function (cb) {
          const val = String(cb.value);
          cb.checked = selectedIds.has(val);
          cb.addEventListener('change', function () {
            if (cb.checked) selectedIds.add(val);
            else selectedIds.delete(val);
            syncBulkToolbar(slice);
          });
        });
      }
      syncBulkToolbar(slice);
      if (deleteCfg) {
        bindDeleteActions(tbody, Object.assign({ onSuccess: reload }, deleteCfg));
      }
      if (typeof config.afterRender === 'function') {
        config.afterRender(tbody);
      }
    }

    function setItems(items) {
      loadError = '';
      allItems = Array.isArray(items) ? items : [];
      if (bulkCfg) {
        const validSet = new Set(allItems.map(function (it) { return String(it[bulkCfg.idKey]); }));
        Array.from(selectedIds).forEach(function (id) {
          if (!validSet.has(id)) selectedIds.delete(id);
        });
      }
      render();
    }

    function setError(message) {
      loadError = message || 'Failed to load records.';
      render();
    }

    return {
      reload: reload,
      refresh: render,
      setError: setError,
      setItems: setItems,
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
    downloadCsv: downloadCsv,
    drawBarChart: drawBarChart,
    ensureAuthenticated: ensureAuthenticated,
    ensureSelectOption: ensureSelectOption,
    escapeHtml: CT.escapeHtml,
    getCheckedIds: getCheckedIds,
    getQueryId: getQueryId,
    populateUserSelect: populateUserSelect,
    renderAdminNav: renderAdminNav,
    renderCheckList: renderCheckList,
    renderFormLoadError: renderFormLoadError,
    sanitizeCsvCell: sanitizeCsvCell,
    submitForm: submitForm,
    validateFields: validateFields,
  };
})();