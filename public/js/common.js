/**
 * CineTix (Alpha Striker 2.0) — Shared Frontend Runtime
 * Centralizes path resolution, XSS-safe escaping, calendar/email validation, JSON API requests,
 * server-synced & multi-tab user session state, reversible light/dark theme switching,
 * authoritative pricing/expiry helpers, toast notifications, keyboard Escape dismissal, and shared header/footer/FAQ UI.
 */
(function () {
  'use strict';

  const SERVICE_FEE = 2.50;
  const GROUP_DISCOUNT_MIN_SEATS = 5;
  const GROUP_DISCOUNT_RATE = 0.30;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('/')
    ) {
      return trimmed;
    }
    return currentDepthPrefix() + trimmed.replace(/^(\.\.\/|\.\/)+/, '');
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

  function isValidEmail(value) {
    const str = String(value || '').trim();
    return str.length > 0 && str.length <= 100 && EMAIL_PATTERN.test(str);
  }

  function formatStars(score) {
    const num = Math.max(0, Math.min(5, parseFloat(score) || 0));
    const full = Math.floor(num);
    const half = num - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function renderStarIcons(score) {
    const rating = Math.max(0, Math.min(5, parseFloat(score) || 5.0));
    const full = Math.floor(rating);
    const half = rating - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return (
      '<i class="fas fa-star"></i>'.repeat(full) +
      (half ? '<i class="fas fa-star-half-alt"></i>' : '') +
      '<i class="far fa-star"></i>'.repeat(empty)
    );
  }

  function calcGroupDiscount(subtotal, seatCount) {
    return seatCount >= GROUP_DISCOUNT_MIN_SEATS ? +(subtotal * GROUP_DISCOUNT_RATE).toFixed(2) : 0;
  }

  function calculateCheckoutPricing(unitPrice, seatCount, promoMoney) {
    const count = Math.max(0, parseInt(seatCount, 10) || 0);
    const unit = +(Math.max(0, parseFloat(unitPrice) || 0)).toFixed(2);
    const subtotal = +(unit * count).toFixed(2);
    const groupDiscount = calcGroupDiscount(subtotal, count);
    const promoDiscount = +(Math.max(0, parseFloat(promoMoney) || 0)).toFixed(2);
    const totalDiscount = +(groupDiscount + promoDiscount).toFixed(2);
    const serviceFee = count > 0 ? SERVICE_FEE : 0;
    const totalAmount = Math.max(0, +(subtotal - totalDiscount + serviceFee).toFixed(2));
    return {
      unitPrice: unit,
      seatCount: count,
      subtotal: subtotal,
      groupDiscount: groupDiscount,
      promoDiscount: promoDiscount,
      totalDiscount: totalDiscount,
      serviceFee: serviceFee,
      totalAmount: totalAmount,
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
    const nextDark = !document.documentElement.classList.contains('dark-mode');
    localStorage.setItem('darkMode', String(nextDark));
    applyTheme(nextDark);
  }

  initTheme();

  const TOAST_ICONS = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
  };

  const TOAST_TITLES = {
    success: 'Success',
    error: 'Error',
    warning: 'Notice',
    info: 'Notice',
  };

  function showToast(message, type, title) {
    const resolvedType = type || 'info';
    const resolvedTitle = title || TOAST_TITLES[resolvedType] || 'Notice';

    const el = document.createElement('div');
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
      el.remove();
    });

    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.remove();
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

    const closeBtn = popup.querySelector('.close-btn');
    closeBtn.addEventListener('click', function () {
      popup.remove();
    });
    popup.addEventListener('click', function (e) {
      if (e.target === popup) popup.remove();
    });
    document.body.appendChild(popup);
    if (closeBtn && typeof closeBtn.focus === 'function') {
      closeBtn.focus();
    }
  }

  function clickEmailUs() {
    const modal = document.getElementById('email-modal');
    if (modal) {
      modal.style.display = 'flex';
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

    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleDarkMode);

    const profileTrigger = document.getElementById('user-profile-trigger');
    const dropdown = document.getElementById('userDropdown');
    if (profileTrigger && dropdown) {
      profileTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        const nextOpen = !dropdown.classList.contains('show');
        dropdown.classList.toggle('show', nextOpen);
        profileTrigger.setAttribute('aria-expanded', String(nextOpen));
      });
    }

    document.getElementById('header-auth-btn')?.addEventListener('click', async function (e) {
      if (!user.isLoggedIn) return;
      e.preventDefault();
      await AuthStore.logout();
      window.location.href = rootUrl('login.html');
    });
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
    if (event.key !== 'Escape') return;

    const dd = document.getElementById('userDropdown');
    if (dd && dd.classList.contains('show')) {
      dd.classList.remove('show');
      const trigger = document.getElementById('user-profile-trigger');
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
    }

    const popup = document.querySelector('.contact-popup');
    if (popup) popup.remove();

    document.querySelectorAll('.contact-modal').forEach(function (modal) {
      if (modal.style && modal.style.display && modal.style.display !== 'none') {
        modal.style.display = 'none';
      }
    });

    const chatDialog = document.getElementById('chat-dialog');
    if (chatDialog && chatDialog.style && chatDialog.style.display && chatDialog.style.display !== 'none') {
      chatDialog.style.display = 'none';
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
    calcGroupDiscount: calcGroupDiscount,
    calculateCheckoutPricing: calculateCheckoutPricing,
    escapeHtml: escapeHtml,
    fetchJson: fetchJson,
    formatStars: formatStars,
    isCardExpiryValid: isCardExpiryValid,
    isValidEmail: isValidEmail,
    isValidIsoDate: isValidIsoDate,
    pageUrl: pageUrl,
    renderStarIcons: renderStarIcons,
    resolveAssetUrl: resolveAssetUrl,
    rootUrl: rootUrl,
    showToast: showToast,
    themeToggleSvgMarkup: themeToggleSvgMarkup,
    todayIso: todayIso,
    toggleDarkMode: toggleDarkMode,
    toIsoDate: toIsoDate,
  };

  window.toggleDarkMode = toggleDarkMode;
  window.showToast = showToast;
  window.showNotification = showNotification;
  window.clickEmailUs = clickEmailUs;
  window.clickCallUs = clickCallUs;
  window.clickLink = clickLink;
})();