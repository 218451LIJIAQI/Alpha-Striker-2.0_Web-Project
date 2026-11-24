/**
 * CineTix (Alpha Striker 2.0) — Shared Frontend Runtime
 * Centralizes path resolution, XSS-safe escaping, calendar/screening-time/email/password/redirect validation,
 * JSON API requests, server-synced & multi-tab user session state, reversible light/dark theme switching,
 * integer-cent pricing/expiry helpers, persistent field-error helpers, pill/tab/state-card UI primitives,
 * WAI-ARIA focus-trapped modals & keyboard-navigable menus, and shared header/footer.
 */
(function () {
  'use strict';

  const SERVICE_FEE_CENTS = 250;
  const GROUP_DISCOUNT_MIN_SEATS = 5;
  const GROUP_DISCOUNT_RATE = 0.30;
  const MAX_PASSWORD_BYTES = 72;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const SEAT_CODE_PATTERN = /^[A-H](?:[1-9]|1[0-2])$/;
  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let lastDialogTrigger = null;

  function currentDepthPrefix() {
    const path = window.location.pathname || '';
    return path.includes('/pages/') || path.includes('/admin/') ? '../' : '';
  }

  function inPagesDir() {
    return (window.location.pathname || '').includes('/pages/');
  }

  function pageUrl(fileWithQuery) {
    if (!fileWithQuery) return inPagesDir() ? 'homepage.html' : 'pages/homepage.html';
    if (inPagesDir()) return fileWithQuery;
    if ((window.location.pathname || '').includes('/admin/')) return '../pages/' + fileWithQuery;
    return 'pages/' + fileWithQuery;
  }

  function rootUrl(fileWithQuery) {
    return currentDepthPrefix() + fileWithQuery;
  }

  function resolveAssetUrl(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') {
      return currentDepthPrefix() + 'img/logo.jpg';
    }
    const trimmed = rawPath.trim();
    if (!trimmed || /[\x00-\x1f\x7f]/.test(trimmed)) {
      return currentDepthPrefix() + 'img/logo.jpg';
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      if (/^(?:https?:\/\/|data:image\/)/i.test(trimmed)) {
        return trimmed;
      }
      return currentDepthPrefix() + 'img/logo.jpg';
    }
    if (trimmed.startsWith('/')) {
      return trimmed;
    }
    return currentDepthPrefix() + trimmed.replace(/^(\.\.\/|\.\/)+/, '');
  }

  function isValidAssetPath(rawPath) {
    if (typeof rawPath !== 'string') return false;
    const trimmed = rawPath.trim();
    if (!trimmed || trimmed.length > 500 || /[\x00-\x1f\x7f]/.test(trimmed)) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      return /^(?:https?:\/\/|data:image\/)/i.test(trimmed);
    }
    return true;
  }

  function sanitizeRedirectPath(rawPath, fallbackPath) {
    const fallback = fallbackPath || pageUrl('homepage.html');
    const candidate = String(rawPath || '').trim();
    if (
      !candidate ||
      /[\x00-\x1f\x7f\\]/.test(candidate) ||
      candidate.startsWith('//') ||
      /^[a-z][a-z0-9+.-]*:/i.test(candidate)
    ) {
      return fallback;
    }
    if (
      candidate.startsWith('/') ||
      /^(?:\.\.?\/)?[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-.]+)*(?:\.[A-Za-z0-9]+)?(?:[?#][^\s]*)?$/.test(candidate)
    ) {
      return candidate;
    }
    return fallback;
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function utf8ByteLength(value) {
    const str = String(value || '');
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(str).length;
    }
    return unescape(encodeURIComponent(str)).length;
  }

  function isValidPasswordBytes(value) {
    const str = String(value || '');
    return Array.from(str).length >= 6 && utf8ByteLength(str) <= MAX_PASSWORD_BYTES;
  }

  function toIsoDate(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date();
    return (
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function todayIso() {
    return toIsoDate(new Date());
  }

  function isValidIsoDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!m) return false;
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const probe = new Date(year, month - 1, day);
    return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
  }

  function parseScreeningMinutes(timeValue) {
    const str = String(timeValue || '').trim();
    if (!str) return -1;
    const m12 = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/.exec(str);
    if (m12) {
      const hour = parseInt(m12[1], 10);
      const min = parseInt(m12[2], 10);
      if (hour < 1 || hour > 12 || min > 59) return -1;
      const hour24 = (hour % 12) + (m12[3].toUpperCase() === 'PM' ? 12 : 0);
      return hour24 * 60 + min;
    }
    const m24 = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(str);
    if (m24) {
      return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
    }
    return -1;
  }

  function isScreeningCancelable(dateStr, timeStr, referenceDate) {
    const iso = String(dateStr || '').trim();
    if (!isValidIsoDate(iso)) return false;
    const mins = parseScreeningMinutes(timeStr);
    if (mins < 0) return false;
    const now = referenceDate instanceof Date ? referenceDate : new Date();
    const curIso = toIsoDate(now);
    if (iso < curIso) return false;
    if (iso > curIso) return true;
    const curMins = now.getHours() * 60 + now.getMinutes();
    return mins > curMins;
  }

  function isValidEmail(value) {
    const str = String(value || '').trim();
    return str.length > 0 && str.length <= 100 && EMAIL_PATTERN.test(str);
  }

  function compareSeatCodes(a, b) {
    const sa = String(a || '').trim().toUpperCase();
    const sb = String(b || '').trim().toUpperCase();
    if (sa === sb) return 0;
    const ma = /^([A-Z]+)(\d+)$/.exec(sa);
    const mb = /^([A-Z]+)(\d+)$/.exec(sb);
    if (ma && mb) {
      return ma[1] === mb[1]
        ? parseInt(ma[2], 10) - parseInt(mb[2], 10)
        : ma[1].localeCompare(mb[1]);
    }
    return sa.localeCompare(sb);
  }

  function sortSeatCodes(list) {
    return list.sort(compareSeatCodes);
  }

  function parseSeatCodes(raw, maxSeats) {
    const source = Array.isArray(raw) ? raw : String(raw || '').split(',');
    const unique = [];
    const seen = new Set();
    source.forEach(function (item) {
      const code = String(item || '').trim().toUpperCase();
      if (SEAT_CODE_PATTERN.test(code) && !seen.has(code)) {
        seen.add(code);
        unique.push(code);
      }
    });
    sortSeatCodes(unique);
    return maxSeats > 0 ? unique.slice(0, maxSeats) : unique;
  }

  function clearFieldError(inputEl) {
    if (!inputEl) return;
    if (inputEl.classList) {
      inputEl.classList.remove('input-error');
    }
    if (typeof inputEl.removeAttribute === 'function') {
      inputEl.removeAttribute('aria-invalid');
    } else if (typeof inputEl.setAttribute === 'function') {
      inputEl.setAttribute('aria-invalid', 'false');
    }
    const container =
      (typeof inputEl.closest === 'function' && inputEl.closest('.form-group, .input-group, .promo-form')) ||
      inputEl.parentNode;
    if (container && typeof container.querySelector === 'function') {
      const targetId = inputEl.id ? '[data-error-for="' + inputEl.id + '"]' : '.field-error-hint';
      const hint = container.querySelector(targetId);
      if (hint && typeof hint.remove === 'function') {
        hint.remove();
      }
    }
  }

  function flagFieldError(inputEl, message, skipFocus) {
    if (!inputEl) return;
    if (inputEl.classList) {
      inputEl.classList.add('input-error');
    }
    if (typeof inputEl.setAttribute === 'function') {
      inputEl.setAttribute('aria-invalid', 'true');
    }
    if (!skipFocus && typeof inputEl.focus === 'function') {
      inputEl.focus();
    }
    if (inputEl.dataset && !inputEl.dataset.errClearBound && typeof inputEl.addEventListener === 'function') {
      inputEl.dataset.errClearBound = '1';
      inputEl.addEventListener('input', function () { clearFieldError(inputEl); });
      inputEl.addEventListener('change', function () { clearFieldError(inputEl); });
    }
    if (message) {
      const container =
        (typeof inputEl.closest === 'function' && inputEl.closest('.form-group, .input-group, .promo-form')) ||
        null;
      if (container && typeof container.querySelector === 'function' && typeof container.appendChild === 'function') {
        const selector = inputEl.id ? '[data-error-for="' + inputEl.id + '"]' : '.field-error-hint';
        let hint = container.querySelector(selector);
        if (!hint && typeof document.createElement === 'function') {
          hint = document.createElement('div');
          hint.className = 'field-error-hint';
          if (typeof hint.setAttribute === 'function') {
            hint.setAttribute('role', 'alert');
            if (inputEl.id) hint.setAttribute('data-error-for', inputEl.id);
          }
          container.appendChild(hint);
        }
        if (hint) {
          hint.textContent = String(message);
        }
      }
    }
  }

  function bindFieldErrorClear(scopeEl) {
    const root = scopeEl || document;
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('input, select, textarea').forEach(function (field) {
      if (field.dataset && field.dataset.errClearBound) return;
      if (field.dataset) field.dataset.errClearBound = '1';
      field.addEventListener('input', function () { clearFieldError(field); });
      field.addEventListener('change', function () { clearFieldError(field); });
    });
  }

  function splitStars(score, fallback) {
    const val = Math.max(0, Math.min(5, parseFloat(score) || fallback));
    const full = Math.floor(val);
    const half = val - full >= 0.5 ? 1 : 0;
    return { full: full, half: half, empty: 5 - full - half };
  }

  function formatStars(score) {
    const s = splitStars(score, 0);
    return '★'.repeat(s.full) + (s.half ? '½' : '') + '☆'.repeat(s.empty);
  }

  function renderStarIcons(score) {
    const s = splitStars(score, 5.0);
    return (
      '<i class="fas fa-star"></i>'.repeat(s.full) +
      (s.half ? '<i class="fas fa-star-half-alt"></i>' : '') +
      '<i class="far fa-star"></i>'.repeat(s.empty)
    );
  }

  function roundCents(value) {
    return Math.round((parseFloat(value) || 0) * 100) / 100;
  }

  function calcGroupDiscount(subtotal, seatCount) {
    if ((parseInt(seatCount, 10) || 0) < GROUP_DISCOUNT_MIN_SEATS) return 0;
    const subtotalCents = Math.round(Math.max(0, parseFloat(subtotal) || 0) * 100);
    return Math.round(subtotalCents * GROUP_DISCOUNT_RATE) / 100;
  }

  function calculateCheckoutPricing(unitPrice, seatCount, promoMoney) {
    const count = Math.max(0, parseInt(seatCount, 10) || 0);
    const unitCents = Math.round(Math.max(0, parseFloat(unitPrice) || 0) * 100);
    const subtotalCents = unitCents * count;
    const groupCents = Math.round(calcGroupDiscount(subtotalCents / 100, count) * 100);
    const promoCents = Math.round(Math.max(0, parseFloat(promoMoney) || 0) * 100);
    const totalDiscountCents = groupCents + promoCents;
    const feeCents = count > 0 ? SERVICE_FEE_CENTS : 0;
    const totalCents = Math.max(0, subtotalCents - totalDiscountCents + feeCents);
    return {
      unitPrice: unitCents / 100,
      seatCount: count,
      subtotal: subtotalCents / 100,
      groupDiscount: groupCents / 100,
      promoDiscount: promoCents / 100,
      totalDiscount: totalDiscountCents / 100,
      serviceFee: feeCents / 100,
      totalAmount: totalCents / 100,
    };
  }

  function isCardExpiryValid(expiryStr, referenceDate) {
    const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(String(expiryStr || '').trim());
    if (!match) return false;
    const expMonth = parseInt(match[1], 10);
    const expYear = 2000 + parseInt(match[2], 10);
    const now = referenceDate instanceof Date ? referenceDate : new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    if (expYear < curYear) return false;
    if (expYear === curYear && expMonth < curMonth) return false;
    return true;
  }

  function activatePill(buttons, activeTarget) {
    const matchFn = typeof activeTarget === 'function'
      ? activeTarget
      : function (btn) { return btn === activeTarget; };
    Array.from(buttons || []).forEach(function (btn, idx) {
      const isActive = Boolean(matchFn(btn, idx));
      btn.classList.toggle('active', isActive);
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-pressed', String(isActive));
      }
    });
  }

  function bindTabList(buttons, onActivate) {
    const list = Array.from(buttons || []);
    if (!list.length) return function () {};

    function syncPanelVisibility(btn, isActive) {
      const panelId = typeof btn.getAttribute === 'function' ? btn.getAttribute('aria-controls') : '';
      const panel = panelId && typeof document !== 'undefined' && typeof document.getElementById === 'function'
        ? document.getElementById(panelId)
        : null;
      if (!panel) return;
      if (panel.classList) {
        panel.classList.toggle('active', isActive);
      }
      panel.hidden = !isActive;
      if (isActive && typeof panel.removeAttribute === 'function') {
        panel.removeAttribute('hidden');
      } else if (!isActive && typeof panel.setAttribute === 'function') {
        panel.setAttribute('hidden', '');
      }
    }

    function syncTabState(activeBtn) {
      list.forEach(function (btn) {
        const isActive = btn === activeBtn;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
        syncPanelVisibility(btn, isActive);
      });
    }

    list.forEach(function (btn, idx) {
      btn.setAttribute('role', 'tab');
      const isInitial = btn.classList.contains('active');
      btn.setAttribute('aria-selected', String(isInitial));
      btn.setAttribute('tabindex', isInitial ? '0' : '-1');
      syncPanelVisibility(btn, isInitial);

      btn.addEventListener('click', function () {
        if (typeof onActivate === 'function' && onActivate(btn, idx) === false) return;
        syncTabState(btn);
      });

      btn.addEventListener('keydown', function (e) {
        let nextIdx = -1;
        if (e.key === 'ArrowRight') nextIdx = (idx + 1) % list.length;
        else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + list.length) % list.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = list.length - 1;
        if (nextIdx < 0) return;

        e.preventDefault();
        const candidate = list[nextIdx];
        if (typeof onActivate === 'function' && onActivate(candidate, nextIdx) === false) return;
        syncTabState(candidate);
        candidate.focus();
      });
    });

    return syncTabState;
  }

  function renderStateCard(container, opts) {
    if (!container || !opts) return;
    const isError = Boolean(opts.isError);
    const cls = (opts.className || 'grid-empty-state') + (isError ? ' is-error-state' : '');
    const roleAttr = isError ? ' role="alert"' : '';
    const tag = opts.headingTag === 'h2' ? 'h2' : 'h3';
    const btnClass = opts.buttonClass || 'btn btn-primary empty-reset-btn';
    const iconHtml = opts.iconClass ? '<i class="' + escapeHtml(opts.iconClass) + '" aria-hidden="true"></i>' : '';
    const actionHtml = opts.actionLabel
      ? (typeof opts.onAction === 'function'
          ? '<button type="button" class="' + escapeHtml(btnClass) + '" data-state-action="1">' + escapeHtml(opts.actionLabel) + '</button>'
          : (opts.actionHref
              ? '<a href="' + escapeHtml(opts.actionHref) + '" class="' + escapeHtml(btnClass) + '">' + escapeHtml(opts.actionLabel) + '</a>'
              : ''))
      : '';

    container.innerHTML =
      '<div class="' + escapeHtml(cls) + '"' + roleAttr + '>' +
      iconHtml +
      '<' + tag + '>' + escapeHtml(opts.heading || 'Notice') + '</' + tag + '>' +
      '<p>' + escapeHtml(opts.message || '') + '</p>' +
      actionHtml +
      '</div>';

    if (typeof opts.onAction === 'function') {
      container.querySelector('[data-state-action="1"]')?.addEventListener('click', opts.onAction);
    }
  }

  function rememberDialogTrigger(triggerEl) {
    const candidate = triggerEl || document.activeElement;
    if (candidate && candidate !== document.body && typeof candidate.focus === 'function') {
      lastDialogTrigger = candidate;
    }
  }

  function restoreDialogFocus() {
    const target = lastDialogTrigger;
    lastDialogTrigger = null;
    if (target && target.isConnected !== false && typeof target.focus === 'function') {
      target.focus();
    }
  }

  function getActiveModalDialog() {
    if (typeof document.querySelector !== 'function') return null;
    const popup = document.querySelector('.contact-popup');
    if (popup) return popup;

    const modals = document.querySelectorAll('.contact-modal');
    for (let i = 0; i < modals.length; i++) {
      const m = modals[i];
      if (m.style && m.style.display && m.style.display !== 'none') return m;
    }

    const chatDialog = document.getElementById('chat-dialog');
    if (chatDialog && chatDialog.style && chatDialog.style.display && chatDialog.style.display !== 'none') {
      return chatDialog;
    }

    const backdrop = document.querySelector('.modal-backdrop:not(.is-hidden)');
    if (backdrop) return backdrop;

    return null;
  }

  async function fetchJson(url, options) {
    const opts = Object.assign({ credentials: 'same-origin' }, options || {});
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    opts.headers = headers;
    const res = await fetch(url, opts);
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object' && typeof res.status === 'number') {
      Object.defineProperty(parsed, 'httpStatus', {
        value: res.status,
        enumerable: false,
        configurable: true,
      });
    }
    return parsed;
  }

  function dispatchAuthChange() {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('cinetix:authchange', { detail: AuthStore.getUser() }));
    }
  }

  let sessionSyncPromise = null;

  const AuthStore = {
    getUser() {
      const userId = parseInt(localStorage.getItem('userId') || '0', 10) || 0;
      const userName = localStorage.getItem('userName') || '';
      const userEmail = localStorage.getItem('userEmail') || '';
      const token = localStorage.getItem('userToken') || '';
      const isLoggedIn = Boolean(token && (userId > 0 || userEmail));
      return {
        userId,
        userName: userName || (userEmail ? userEmail.split('@')[0] : 'Guest'),
        userEmail,
        isLoggedIn,
      };
    },

    setUser(userData) {
      if (!userData) return;
      localStorage.setItem('userToken', 'authenticated');
      if (userData.user_id !== undefined && userData.user_id !== null) {
        localStorage.setItem('userId', String(userData.user_id));
      }
      if (userData.user_name) {
        localStorage.setItem('userName', String(userData.user_name));
      }
      if (userData.email) {
        localStorage.setItem('userEmail', String(userData.email));
      }
      localStorage.removeItem('pwd');
      localStorage.removeItem('email');
      dispatchAuthChange();
    },

    clearLocal() {
      ['userToken', 'userId', 'userName', 'userEmail', 'email', 'pwd'].forEach(function (k) {
        localStorage.removeItem(k);
      });
      dispatchAuthChange();
    },

    async syncSession() {
      if (sessionSyncPromise) return sessionSyncPromise;
      sessionSyncPromise = (async function () {
        try {
          const prev = AuthStore.getUser();
          const res = await fetchJson('/index.php/user/user/session');
          if (res && res.success && res.data && typeof res.data.authenticated === 'boolean') {
            if (res.data.authenticated) {
              AuthStore.setUser(res.data);
            } else {
              AuthStore.clearLocal();
            }
            const next = AuthStore.getUser();
            if (
              prev.isLoggedIn !== next.isLoggedIn ||
              prev.userId !== next.userId ||
              prev.userName !== next.userName ||
              prev.userEmail !== next.userEmail
            ) {
              renderHeader();
            }
          }
        } catch (_) {
          // Keep current local state if offline
        } finally {
          sessionSyncPromise = null;
        }
        return AuthStore.getUser();
      })();
      return sessionSyncPromise;
    },

    async logout() {
      AuthStore.clearLocal();
      try {
        await fetch('/index.php/user/user/logout', { method: 'POST', credentials: 'same-origin' });
      } catch (_) {
        // Ignore network errors during client logout cleanup
      }
    },
  };

  function ensureStylesheet(id, relativeHref) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = currentDepthPrefix() + relativeHref;
    document.head.appendChild(link);
  }

  function ensureFavicon() {
    if (document.getElementById('cinetix-favicon')) return;
    const icon = document.createElement('link');
    icon.id = 'cinetix-favicon';
    icon.rel = 'icon';
    icon.href = currentDepthPrefix() + 'favicon.ico';
    document.head.appendChild(icon);
  }

  function syncThemeButtons(isDark) {
    document.querySelectorAll('.dark-mode-toggle').forEach(function (btn) {
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-pressed', String(Boolean(isDark)));
      }
    });
  }

  function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark-mode', isDark);
    if (document.body) {
      document.body.classList.toggle('dark-mode', isDark);
    }
    syncThemeButtons(isDark);
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('cinetix:themechange', { detail: { isDark: Boolean(isDark) } }));
    }
  }

  function initTheme() {
    ensureFavicon();
    ensureStylesheet('dark-mode-css', 'css/common/dark-mode.css');
    applyTheme(localStorage.getItem('darkMode') === 'true');
  }

  function toggleDarkMode() {
    const rootEl = document.documentElement;
    const nextDark = !rootEl.classList.contains('dark-mode');
    localStorage.setItem('darkMode', String(nextDark));
    rootEl.classList.add('theme-switching');
    applyTheme(nextDark);
    void rootEl.offsetHeight;
    rootEl.classList.remove('theme-switching');
  }

  initTheme();

  const TOAST_ICONS = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#991b1b" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
  };

  const TOAST_TITLES = {
    success: 'Success',
    error: 'Error',
    warning: 'Notice',
    info: 'Notice',
  };

  const activeToasts = [];

  function repositionToasts() {
    for (let i = activeToasts.length - 1; i >= 0; i -= 1) {
      const candidate = activeToasts[i];
      if (!candidate || candidate.removed || !candidate.parentNode) {
        activeToasts.splice(i, 1);
      }
    }
    let offsetTop = 84;
    for (let i = 0; i < activeToasts.length; i += 1) {
      const toastEl = activeToasts[i];
      if (!toastEl.style) toastEl.style = {};
      toastEl.style.top = offsetTop + 'px';
      const measuredHeight = Number(toastEl.offsetHeight) > 0 ? Number(toastEl.offsetHeight) : 76;
      offsetTop += measuredHeight + 12;
    }
  }

  function dismissToast(toastEl) {
    if (!toastEl) return;
    const idx = activeToasts.indexOf(toastEl);
    if (idx >= 0) activeToasts.splice(idx, 1);
    if (toastEl.parentNode && typeof toastEl.remove === 'function') {
      toastEl.remove();
    }
    repositionToasts();
  }

  function showToast(message, type, title) {
    const resolvedType = type || 'info';
    const resolvedTitle = title || TOAST_TITLES[resolvedType] || 'Notice';

    for (let i = activeToasts.length - 1; i >= 0; i -= 1) {
      if (activeToasts[i] && activeToasts[i].dataset && activeToasts[i].dataset.toastKey === resolvedType + ':' + message) {
        dismissToast(activeToasts[i]);
      }
    }
    while (activeToasts.length >= 2) {
      dismissToast(activeToasts[0]);
    }

    let initialTop = 84;
    for (let i = 0; i < activeToasts.length; i += 1) {
      const h = Number(activeToasts[i].offsetHeight) > 0 ? Number(activeToasts[i].offsetHeight) : 76;
      initialTop += h + 12;
    }

    const el = document.createElement('div');
    if (!el.style) el.style = {};
    el.style.top = initialTop + 'px';
    if (el.dataset) el.dataset.toastKey = resolvedType + ':' + message;
    el.className = 'user-notification ' + escapeHtml(resolvedType);
    if (typeof el.setAttribute === 'function') {
      el.setAttribute('role', resolvedType === 'error' ? 'alert' : 'status');
      el.setAttribute('aria-live', resolvedType === 'error' ? 'assertive' : 'polite');
    }
    el.innerHTML =
      '<div class="notification-content">' +
      '<div class="notification-icon">' + (TOAST_ICONS[resolvedType] || TOAST_ICONS.info) + '</div>' +
      '<div class="notification-text">' +
      '<div class="notification-title">' + escapeHtml(resolvedTitle) + '</div>' +
      '<div class="notification-message">' + escapeHtml(message) + '</div>' +
      '</div>' +
      '<button type="button" class="notification-close" aria-label="Close notification">&times;</button>' +
      '</div>';

    el.querySelector('.notification-close').addEventListener('click', function () {
      dismissToast(el);
    });

    document.body.appendChild(el);
    activeToasts.push(el);
    repositionToasts();
    setTimeout(function () {
      dismissToast(el);
    }, 3600);
  }

  function showNotification(arg1, arg2, arg3) {
    if (arg3 !== undefined) {
      showToast(arg2, arg3, arg1);
    } else {
      showToast(arg1, arg2 || 'info');
    }
  }

  function openContactPopup(title, lines) {
    rememberDialogTrigger();
    const existing = document.querySelector('.contact-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'contact-popup';
    if (typeof popup.setAttribute === 'function') {
      popup.setAttribute('role', 'dialog');
      popup.setAttribute('aria-modal', 'true');
      popup.setAttribute('aria-label', title);
    }
    popup.innerHTML =
      '<div class="contact-popup-content">' +
      '<div class="contact-popup-header">' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<button type="button" class="close-btn" aria-label="Close dialog">&times;</button>' +
      '</div>' +
      '<div class="contact-popup-body">' +
      lines.map(function (item) {
        return '<p><i class="' + escapeHtml(item.icon) + '" aria-hidden="true"></i> <span>' + escapeHtml(item.text) + '</span></p>';
      }).join('') +
      '</div>' +
      '</div>';

    const closePopup = function () {
      popup.remove();
      restoreDialogFocus();
    };

    const closeBtn = popup.querySelector('.close-btn');
    closeBtn.addEventListener('click', closePopup);
    popup.addEventListener('click', function (e) {
      if (e.target === popup) closePopup();
    });
    document.body.appendChild(popup);
    if (closeBtn && typeof closeBtn.focus === 'function') {
      closeBtn.focus();
    }
  }

  function clickEmailUs() {
    const modal = document.getElementById('email-modal');
    if (modal) {
      rememberDialogTrigger();
      modal.style.display = 'flex';
      if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('cinetix:emailmodalopen'));
      }
      modal.querySelector('.close-modal')?.focus();
      return;
    }
    openContactPopup('Email Support', [
      { icon: 'fas fa-envelope', text: 'lijiaqi0807@gmail.com' },
    ]);
  }

  function clickCallUs() {
    const modal = document.getElementById('call-modal');
    if (modal) {
      rememberDialogTrigger();
      modal.style.display = 'flex';
      modal.querySelector('.close-modal')?.focus();
      return;
    }
    openContactPopup('Phone Support', [
      { icon: 'fas fa-phone', text: '+60 17-607 3401 (9:00 AM - 6:00 PM)' },
    ]);
  }

  function clickLink() {
    openContactPopup('Contact Us', [
      { icon: 'fas fa-envelope', text: 'lijiaqi0807@gmail.com' },
      { icon: 'fas fa-phone', text: '+60 17-607 3401 (9:00 AM - 6:00 PM)' },
    ]);
  }

  function themeToggleSvgMarkup() {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="moon-icon" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sun-icon" aria-hidden="true"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>'
    );
  }

  function renderHeader() {
    const headerContainer = document.getElementById('header-container');
    if (!headerContainer) return;

    const prevActiveId =
      document.activeElement &&
      typeof headerContainer.contains === 'function' &&
      headerContainer.contains(document.activeElement)
        ? document.activeElement.id
        : '';
    const wasDropdownOpen = Boolean(document.getElementById('userDropdown')?.classList.contains('show'));

    ensureStylesheet('common-header-css', 'css/common/header.css');
    const user = AuthStore.getUser();
    const logoSrc = resolveAssetUrl('img/logo.jpg');
    const homeHref = pageUrl('homepage.html');
    const ticketsHref = pageUrl('generate_ticket.html');
    const pwdHref = rootUrl('pwd.html') + (user.isLoggedIn ? '?mode=change' : '');
    const authBtnLabel = user.isLoggedIn ? 'Logout' : 'Sign In';
    const isDark = document.documentElement.classList.contains('dark-mode');

    headerContainer.innerHTML =
      '<header class="header" role="banner">' +
      '<div class="logo-container">' +
      '<a href="' + escapeHtml(homeHref) + '" class="logo-link" aria-label="CineTix Home">' +
      '<img src="' + escapeHtml(logoSrc) + '" alt="CineTix Logo" id="logo-image">' +
      '<span class="brand-wordmark">CineTix<small>BOX OFFICE</small></span>' +
      '</a>' +
      '</div>' +
      '<nav class="nav-links" aria-label="Primary Navigation">' +
      '<a href="' + escapeHtml(homeHref) + '" class="nav-link" data-page="homepage.html">Movies</a>' +
      '<a href="' + escapeHtml(pageUrl('theater.html')) + '" class="nav-link" data-page="theater.html">Theaters</a>' +
      '<a href="' + escapeHtml(pageUrl('offer.html')) + '" class="nav-link" data-page="offer.html">Offers</a>' +
      '<a href="' + escapeHtml(pageUrl('upcoming.html')) + '" class="nav-link" data-page="upcoming.html">Upcoming</a>' +
      '<a href="' + escapeHtml(pageUrl('about.html')) + '" class="nav-link" data-page="about.html">About</a>' +
      '</nav>' +
      '<div class="user-actions">' +
      '<button type="button" class="dark-mode-toggle" id="theme-toggle-btn" title="Toggle Dark Mode" aria-label="Toggle Dark Mode" aria-pressed="' + String(isDark) + '">' +
      themeToggleSvgMarkup() +
      '</button>' +
      '<a href="' + escapeHtml(ticketsHref) + '" class="user-profile" id="header-tickets-link" title="My Tickets">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path><path d="M13 5v2"></path><path d="M13 17v2"></path><path d="M13 11v2"></path></svg>' +
      '<span class="user-name" id="header-cart">Tickets</span>' +
      '</a>' +
      '<div class="user-profile-menu" id="user-profile-menu">' +
      '<button type="button" class="user-profile" id="user-profile-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="userDropdown">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
      '<span class="user-name" id="header-username">' + escapeHtml(user.userName) + '</span>' +
      '</button>' +
      '<div class="dropdown-content" id="userDropdown" role="menu">' +
      '<div class="user-profile-card">' +
      '<div class="user-avatar">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
      '</div>' +
      '<div class="user-display-name" id="dropdown-username">' + escapeHtml(user.userName) + '</div>' +
      '<div class="user-email" id="dropdown-email">' + escapeHtml(user.userEmail || 'Guest Session') + '</div>' +
      '<div class="user-membership">' + (user.isLoggedIn ? 'Member Account' : 'Guest Visitor') + '</div>' +
      '</div>' +
      '<div class="user-info-section">' +
      '<div class="info-item"><span class="info-label">Account:</span><span class="info-value">' + escapeHtml(user.userName) + '</span></div>' +
      '<div class="info-item"><span class="info-label">Email:</span><span class="info-value">' + escapeHtml(user.userEmail || 'Not signed in') + '</span></div>' +
      '<div class="info-item"><span class="info-label">Status:</span><span class="info-value">' + (user.isLoggedIn ? 'Authenticated' : 'Browsing as Guest') + '</span></div>' +
      '</div>' +
      '<div class="dropdown-menu">' +
      '<a href="' + escapeHtml(homeHref) + '" class="dropdown-item" role="menuitem"><div class="dropdown-item-text"><span class="dropdown-item-title">Browse Movies</span><span class="dropdown-item-desc">Explore current screenings</span></div></a>' +
      '<a href="' + escapeHtml(pageUrl('theater.html')) + '" class="dropdown-item" role="menuitem"><div class="dropdown-item-text"><span class="dropdown-item-title">Find Theaters</span><span class="dropdown-item-desc">View cinema locations &amp; 3D halls</span></div></a>' +
      '<a href="' + escapeHtml(pageUrl('offer.html')) + '" class="dropdown-item" role="menuitem"><div class="dropdown-item-text"><span class="dropdown-item-title">Special Offers</span><span class="dropdown-item-desc">Claim active promo codes</span></div></a>' +
      '<a href="' + escapeHtml(pageUrl('giftcards.html')) + '" class="dropdown-item" role="menuitem"><div class="dropdown-item-text"><span class="dropdown-item-title">Digital Gift Cards</span><span class="dropdown-item-desc">Issue or check e-gift balances</span></div></a>' +
      '<a href="' + escapeHtml(ticketsHref) + '" class="dropdown-item" role="menuitem"><div class="dropdown-item-text"><span class="dropdown-item-title">My Tickets</span><span class="dropdown-item-desc">Manage or print bookings</span></div></a>' +
      '<a href="' + escapeHtml(pwdHref) + '" class="dropdown-item" role="menuitem"><div class="dropdown-item-text"><span class="dropdown-item-title">' + (user.isLoggedIn ? 'Change Password' : 'Reset Password') + '</span><span class="dropdown-item-desc">Manage account security</span></div></a>' +
      '<div class="dropdown-separator"></div>' +
      '<a href="' + escapeHtml(pageUrl('help.html')) + '" class="dropdown-item" role="menuitem"><div class="dropdown-item-text"><span class="dropdown-item-title">Help Center</span><span class="dropdown-item-desc">FAQs and customer support</span></div></a>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<a href="' + escapeHtml(rootUrl('login.html')) + '" class="logout-btn" id="header-auth-btn">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
      '<span>' + escapeHtml(authBtnLabel) + '</span>' +
      '</a>' +
      '</div>' +
      '</header>';

    const rawFile = (window.location.pathname || '').split('/').pop();
    const currentFile = !rawFile || rawFile === 'index.html' ? 'homepage.html' : rawFile;
    const navMap = {
      'booking3.html': 'homepage.html',
      'pay.html': 'homepage.html',
      'paysuccess.html': 'homepage.html',
      'theater-details.html': 'theater.html',
      'giftcards.html': 'offer.html',
      'help.html': 'about.html',
      'faqs.html': 'about.html',
      'privacy.html': 'about.html',
      'team.html': 'about.html',
    };
    const effectiveFile = navMap[currentFile] || currentFile;
    document.querySelectorAll('.header .nav-link').forEach(function (link) {
      const isCurrent = link.getAttribute('data-page') === effectiveFile;
      link.classList.toggle('active', isCurrent);
      if (isCurrent) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    const headerTicketsLink = document.getElementById('header-tickets-link');
    if (headerTicketsLink) {
      const isWallet = currentFile === 'generate_ticket.html';
      headerTicketsLink.classList.toggle('active', isWallet);
      if (isWallet) headerTicketsLink.setAttribute('aria-current', 'page');
      else headerTicketsLink.removeAttribute('aria-current');
    }

    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleDarkMode);

    const profileTrigger = document.getElementById('user-profile-trigger');
    const dropdown = document.getElementById('userDropdown');
    if (profileTrigger && dropdown) {
      const getMenuItems = function () {
        return Array.from(dropdown.querySelectorAll('.dropdown-item'));
      };
      const openMenuAt = function (targetIdx) {
        const items = getMenuItems();
        dropdown.classList.add('show');
        profileTrigger.setAttribute('aria-expanded', 'true');
        if (items.length) {
          const idx = ((targetIdx % items.length) + items.length) % items.length;
          items[idx].focus();
        }
      };

      profileTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        const nextOpen = !dropdown.classList.contains('show');
        dropdown.classList.toggle('show', nextOpen);
        profileTrigger.setAttribute('aria-expanded', String(nextOpen));
      });
      profileTrigger.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          openMenuAt(0);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          openMenuAt(-1);
        }
      });
      dropdown.addEventListener('keydown', function (e) {
        const items = getMenuItems();
        if (!items.length) return;
        const curIdx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          items[(curIdx + 1) % items.length].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          items[(curIdx <= 0 ? items.length - 1 : curIdx - 1)].focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          items[0].focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (e.key === 'Tab') {
          dropdown.classList.remove('show');
          profileTrigger.setAttribute('aria-expanded', 'false');
        }
      });
    }

    document.getElementById('header-auth-btn')?.addEventListener('click', async function (e) {
      if (!user.isLoggedIn) return;
      e.preventDefault();
      await AuthStore.logout();
      window.location.href = rootUrl('login.html');
    });

    if (wasDropdownOpen && dropdown && profileTrigger) {
      dropdown.classList.add('show');
      profileTrigger.setAttribute('aria-expanded', 'true');
    }
    if (prevActiveId) {
      document.getElementById(prevActiveId)?.focus();
    }
  }

  function renderFooter() {
    const bottomContainer = document.getElementById('bottom-container');
    if (!bottomContainer) return;

    ensureStylesheet('common-footer-css', 'css/common/footer.css');
    bottomContainer.innerHTML =
      '<footer class="homepage-footer" role="contentinfo">' +
      '<div class="footer-container">' +
      '<div class="footer-grid">' +
      '<div class="footer-column">' +
      '<h3>CineTix</h3>' +
      '<p>Desktop cinema box office for browsing feature screenings, inspecting interactive 3D sightlines, locking reserved seats, and managing digital tickets.</p>' +
      '</div>' +
      '<div class="footer-column">' +
      '<h3>Box Office</h3>' +
      '<ul class="footer-links-list">' +
      '<li><a href="' + escapeHtml(pageUrl('homepage.html')) + '">Movies Catalog</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('theater.html')) + '">Partner Theaters</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('upcoming.html')) + '">Upcoming Releases</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('giftcards.html')) + '">Digital Gift Cards</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('offer.html')) + '">Offers &amp; Discounts</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('generate_ticket.html')) + '">My Tickets Wallet</a></li>' +
      '</ul>' +
      '</div>' +
      '<div class="footer-column">' +
      '<h3>Support &amp; Policies</h3>' +
      '<ul class="footer-links-list">' +
      '<li><a href="' + escapeHtml(pageUrl('faqs.html')) + '">FAQs</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('about.html#contact-section')) + '" id="footer-contact-trigger">Contact Us</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('team.html')) + '">Terms of Service</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('privacy.html')) + '">Privacy Policy</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('help.html')) + '">Help Center</a></li>' +
      '</ul>' +
      '</div>' +
      '</div>' +
      '<div class="footer-bottom">' +
      '<p>&copy; 2026 Alpha Striker 2.0 (CineTix). All rights reserved.</p>' +
      '</div>' +
      '</div>' +
      '</footer>';

    document.getElementById('footer-contact-trigger')?.addEventListener('click', function (e) {
      e.preventDefault();
      clickLink();
    });
  }

  function initFaqAccordions() {
    document.querySelectorAll('.faq-question').forEach(function (questionEl) {
      if (questionEl.dataset.faqBound === 'true') return;
      questionEl.dataset.faqBound = 'true';
      questionEl.setAttribute('role', 'button');
      questionEl.setAttribute('tabindex', '0');
      questionEl.setAttribute('aria-expanded', String(questionEl.classList.contains('active')));

      const toggle = function () {
        const active = questionEl.classList.toggle('active');
        questionEl.setAttribute('aria-expanded', String(active));
        questionEl.closest('.faq-item')?.classList.toggle('active', active);
      };
      questionEl.addEventListener('click', toggle);
      questionEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  function bindStandaloneThemeButtons() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      if (btn.dataset.themeBound === 'true') return;
      btn.dataset.themeBound = 'true';
      if (!btn.innerHTML.trim()) {
        btn.innerHTML = themeToggleSvgMarkup();
      }
      btn.setAttribute('aria-pressed', String(document.documentElement.classList.contains('dark-mode')));
      btn.addEventListener('click', toggleDarkMode);
    });
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', function (event) {
      if (!event) return;
      if (event.key === 'darkMode' || event.key === null) {
        applyTheme(localStorage.getItem('darkMode') === 'true');
      }
      if (event.key === null || ['userToken', 'userId', 'userName', 'userEmail'].includes(event.key)) {
        renderHeader();
        dispatchAuthChange();
      }
    });
  }

  document.addEventListener('click', function (event) {
    if (event.target && typeof event.target.closest === 'function' && !event.target.closest('#user-profile-menu')) {
      const dd = document.getElementById('userDropdown');
      if (dd && dd.classList.contains('show')) {
        dd.classList.remove('show');
        document.getElementById('user-profile-trigger')?.setAttribute('aria-expanded', 'false');
      }
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Tab') {
      const activeModal = getActiveModalDialog();
      if (activeModal && typeof activeModal.querySelectorAll === 'function') {
        const focusables = Array.from(activeModal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(function (el) {
          return !el.closest('.is-hidden') && !el.closest('[hidden]');
        });
        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const active = document.activeElement;
          const inside = focusables.indexOf(active) !== -1;
          if (event.shiftKey) {
            if (!inside || active === first) {
              event.preventDefault();
              last.focus();
            }
          } else if (!inside || active === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      return;
    }

    if (event.key !== 'Escape') return;

    const dd = document.getElementById('userDropdown');
    if (dd && dd.classList.contains('show')) {
      dd.classList.remove('show');
      const trigger = document.getElementById('user-profile-trigger');
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
    }

    let closedAnyDialog = false;
    const popup = document.querySelector('.contact-popup');
    if (popup) {
      popup.remove();
      closedAnyDialog = true;
    }

    document.querySelectorAll('.contact-modal').forEach(function (modal) {
      if (modal.style && modal.style.display && modal.style.display !== 'none') {
        modal.style.display = 'none';
        closedAnyDialog = true;
      }
    });

    const chatDialog = document.getElementById('chat-dialog');
    if (chatDialog && chatDialog.style && chatDialog.style.display && chatDialog.style.display !== 'none') {
      chatDialog.style.display = 'none';
      closedAnyDialog = true;
    }

    if (closedAnyDialog) {
      restoreDialogFocus();
    }

    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('cinetix:escape'));
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    renderHeader();
    renderFooter();
    initFaqAccordions();
    bindStandaloneThemeButtons();
    if (!(window.location.pathname || '').includes('/admin/')) {
      AuthStore.syncSession();
    }
  });

  window.CineTicket = {
    AuthStore: AuthStore,
    activatePill: activatePill,
    bindFieldErrorClear: bindFieldErrorClear,
    bindTabList: bindTabList,
    calcGroupDiscount: calcGroupDiscount,
    calculateCheckoutPricing: calculateCheckoutPricing,
    clearFieldError: clearFieldError,
    compareSeatCodes: compareSeatCodes,
    escapeHtml: escapeHtml,
    fetchJson: fetchJson,
    flagFieldError: flagFieldError,
    formatStars: formatStars,
    isCardExpiryValid: isCardExpiryValid,
    isScreeningCancelable: isScreeningCancelable,
    isValidAssetPath: isValidAssetPath,
    isValidEmail: isValidEmail,
    isValidIsoDate: isValidIsoDate,
    isValidPasswordBytes: isValidPasswordBytes,
    pageUrl: pageUrl,
    parseScreeningMinutes: parseScreeningMinutes,
    parseSeatCodes: parseSeatCodes,
    rememberDialogTrigger: rememberDialogTrigger,
    renderStarIcons: renderStarIcons,
    renderStateCard: renderStateCard,
    resolveAssetUrl: resolveAssetUrl,
    restoreDialogFocus: restoreDialogFocus,
    rootUrl: rootUrl,
    roundCents: roundCents,
    sanitizeRedirectPath: sanitizeRedirectPath,
    showToast: showToast,
    sortSeatCodes: sortSeatCodes,
    themeToggleSvgMarkup: themeToggleSvgMarkup,
    todayIso: todayIso,
    toggleDarkMode: toggleDarkMode,
    toIsoDate: toIsoDate,
    utf8ByteLength: utf8ByteLength,
  };

  window.toggleDarkMode = toggleDarkMode;
  window.showToast = showToast;
  window.showNotification = showNotification;
  window.clickEmailUs = clickEmailUs;
  window.clickCallUs = clickCallUs;
  window.clickLink = clickLink;
})();