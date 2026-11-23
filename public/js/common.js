/**
 * CineTicket (Alpha Striker 2.0) — Shared Frontend Runtime
 * Centralizes path resolution, XSS-safe escaping, safe redirects, JSON API requests,
 * session-backed user state, theme switching, pricing/rating helpers, state blocks,
 * keyboard accessibility, toast notifications, and shared header/footer/FAQ UI.
 */
(function () {
  'use strict';

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
    const fallback = currentDepthPrefix() + 'img/logo.jpg';
    if (!rawPath || typeof rawPath !== 'string') {
      return fallback;
    }
    const trimmed = rawPath.trim();
    if (!trimmed || /[\x00-\x1F\x7F]/.test(trimmed)) {
      return fallback;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      if (/^(https?:\/\/|data:image\/[a-zA-Z0-9.+-]+;base64,)/i.test(trimmed)) {
        return trimmed;
      }
      return fallback;
    }
    if (trimmed.startsWith('//')) {
      return fallback;
    }
    if (trimmed.startsWith('/')) {
      return trimmed;
    }
    return currentDepthPrefix() + trimmed.replace(/^(\.\.\/|\.\/)+/, '');
  }

  function safeRedirectUrl(rawTarget, fallbackUrl) {
    const fallback = fallbackUrl || pageUrl('homepage.html');
    if (!rawTarget || typeof rawTarget !== 'string') return fallback;
    const trimmed = rawTarget.trim();
    if (
      !trimmed ||
      trimmed.startsWith('//') ||
      trimmed.includes('\\') ||
      /[\x00-\x1F\x7F]/.test(trimmed) ||
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ) {
      return fallback;
    }
    return trimmed;
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
    return seatCount >= 5 ? +(subtotal * 0.30).toFixed(2) : 0;
  }

  function calcCheckoutTotals(unitPrice, seatCount, promoDiscount) {
    const unit = Math.max(0, parseFloat(unitPrice) || 0);
    const count = Math.max(0, parseInt(seatCount, 10) || 0);
    const subtotal = +(unit * count).toFixed(2);
    const groupDiscount = calcGroupDiscount(subtotal, count);
    const promoOff = Math.max(0, +(parseFloat(promoDiscount) || 0).toFixed(2));
    const serviceFee = count > 0 ? 2.50 : 0;
    const totalPaid = Math.max(0, +(subtotal - (groupDiscount + promoOff) + serviceFee).toFixed(2));
    return {
      unitPrice: unit,
      seatCount: count,
      subtotal: subtotal,
      groupDiscount: groupDiscount,
      promoDiscount: promoOff,
      serviceFee: serviceFee,
      totalPaid: totalPaid,
    };
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
    const payload = await res.json();
    if (payload && typeof payload === 'object' && res.status !== undefined) {
      Object.defineProperty(payload, '_status', { value: res.status, enumerable: false });
    }
    return payload;
  }

  function clearUserStorage() {
    ['userToken', 'userId', 'userName', 'userEmail', 'email', 'pwd'].forEach(function (k) {
      localStorage.removeItem(k);
    });
  }

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
    },

    clearLocal: clearUserStorage,

    async syncSession() {
      try {
        const res = await fetchJson('/index.php/user/user/session');
        if (res && res.success && res.data) {
          if (res.data.authenticated) {
            AuthStore.setUser(res.data);
            return AuthStore.getUser();
          }
          if (AuthStore.getUser().isLoggedIn) {
            clearUserStorage();
          }
        }
      } catch (_) {
        // Keep existing client state if session check cannot be reached
      }
      return AuthStore.getUser();
    },

    async logout() {
      clearUserStorage();
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
    if (!document.head || document.querySelector?.('link[rel="icon"]')) return;
    const icon = document.createElement('link');
    icon.id = 'site-favicon';
    icon.rel = 'icon';
    icon.href = currentDepthPrefix() + 'favicon.ico';
    document.head.appendChild(icon);
  }

  function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark-mode', isDark);
    if (document.body) {
      document.body.classList.toggle('dark-mode', isDark);
    }
  }

  function initTheme() {
    ensureStylesheet('dark-mode-css', 'css/common/dark-mode.css');
    ensureFavicon();
    applyTheme(localStorage.getItem('darkMode') === 'true');
  }

  function toggleDarkMode() {
    const nextDark = !document.documentElement.classList.contains('dark-mode');
    localStorage.setItem('darkMode', String(nextDark));
    applyTheme(nextDark);
  }

  initTheme();

  function bindActivateKey(el, callback) {
    if (!el) return;
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        callback(e);
      }
    });
  }

  function renderStateBlock(container, stateType, title, message, retryFn) {
    if (!container) return;
    const iconMap = {
      loading: '<i class="fas fa-circle-notch fa-spin state-block-icon"></i>',
      empty: '<i class="fas fa-Inbox state-block-icon"></i>'.replace('fa-Inbox', 'fa-film'),
      error: '<i class="fas fa-exclamation-triangle state-block-icon error"></i>',
    };
    container.innerHTML =
      '<div class="state-block state-' + escapeHtml(stateType) + '">' +
      (iconMap[stateType] || '') +
      '<h3>' + escapeHtml(title) + '</h3>' +
      (message ? '<p>' + escapeHtml(message) + '</p>' : '') +
      (typeof retryFn === 'function'
        ? '<button type="button" class="btn btn-primary state-retry-btn"><i class="fas fa-redo"></i> Retry</button>'
        : '') +
      '</div>';

    if (typeof retryFn === 'function') {
      container.querySelector('.state-retry-btn')?.addEventListener('click', retryFn);
    }
  }

  const TOAST_ICONS = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
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
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<div class="notification-content">' +
      '<div class="notification-icon">' + (TOAST_ICONS[resolvedType] || TOAST_ICONS.info) + '</div>' +
      '<div class="notification-text">' +
      '<div class="notification-title">' + escapeHtml(resolvedTitle) + '</div>' +
      '<div class="notification-message">' + escapeHtml(message) + '</div>' +
      '</div>' +
      '<button type="button" class="notification-close" aria-label="Close">&times;</button>' +
      '</div>';

    el.querySelector('.notification-close').addEventListener('click', function () {
      el.remove();
    });

    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.remove();
    }, 3500);
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
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');
    popup.innerHTML =
      '<div class="contact-popup-content">' +
      '<div class="contact-popup-header">' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<button type="button" class="close-btn" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="contact-popup-body">' +
      lines.map(function (item) {
        return '<p><i class="' + escapeHtml(item.icon) + '"></i> ' + escapeHtml(item.text) + '</p>';
      }).join('') +
      '</div>' +
      '</div>';

    popup.querySelector('.close-btn').addEventListener('click', function () {
      popup.remove();
    });
    popup.addEventListener('click', function (e) {
      if (e.target === popup) popup.remove();
    });
    document.body.appendChild(popup);
  }

  function clickEmailUs() {
    const modal = document.getElementById('email-modal');
    if (modal) {
      modal.style.display = 'flex';
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

  function renderHeader() {
    const headerContainer = document.getElementById('header-container');
    if (!headerContainer) return;

    ensureStylesheet('common-header-css', 'css/common/header.css');
    const user = AuthStore.getUser();
    const logoSrc = resolveAssetUrl('img/logo.jpg');
    const homeHref = pageUrl('homepage.html');
    const ticketsHref = pageUrl('generate_ticket.html');
    const authBtnLabel = user.isLoggedIn ? 'Logout' : 'Sign In';

    headerContainer.innerHTML =
      '<header class="header">' +
      '<div class="logo-container">' +
      '<a href="' + escapeHtml(homeHref) + '" class="logo-link">' +
      '<img src="' + escapeHtml(logoSrc) + '" alt="Alpha Striker 2.0" id="logo-image">' +
      '</a>' +
      '</div>' +
      '<nav class="nav-links" aria-label="Main Navigation">' +
      '<a href="' + escapeHtml(homeHref) + '" class="nav-link" data-page="homepage.html">Movies</a>' +
      '<a href="' + escapeHtml(pageUrl('theater.html')) + '" class="nav-link" data-page="theater.html">Theaters</a>' +
      '<a href="' + escapeHtml(pageUrl('offer.html')) + '" class="nav-link" data-page="offer.html">Offers</a>' +
      '<a href="' + escapeHtml(pageUrl('about.html')) + '" class="nav-link" data-page="about.html">About</a>' +
      '</nav>' +
      '<div class="user-actions">' +
      '<button type="button" class="dark-mode-toggle" id="theme-toggle-btn" title="Toggle Dark Mode" aria-label="Toggle Dark Mode">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="moon-icon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sun-icon"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>' +
      '</button>' +
      '<a href="' + escapeHtml(ticketsHref) + '" class="user-profile" id="header-tickets-link" title="My Tickets">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>' +
      '<span class="user-name" id="header-cart">Tickets</span>' +
      '</a>' +
      '<div class="user-profile" id="user-profile-trigger" tabindex="0" role="button" aria-haspopup="true" aria-expanded="false">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
      '<span class="user-name" id="header-username">' + escapeHtml(user.userName) + '</span>' +
      '<div class="dropdown-content" id="userDropdown">' +
      '<div class="user-profile-card">' +
      '<div class="user-avatar">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
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
      '<a href="' + escapeHtml(homeHref) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">Browse Movies</span><span class="dropdown-item-desc">Explore current screenings</span></div></a>' +
      '<a href="' + escapeHtml(pageUrl('theater.html')) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">Find Theaters</span><span class="dropdown-item-desc">View cinema locations &amp; schedules</span></div></a>' +
      '<a href="' + escapeHtml(pageUrl('offer.html')) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">Special Offers</span><span class="dropdown-item-desc">Claim active promo codes</span></div></a>' +
      '<a href="' + escapeHtml(ticketsHref) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">My Tickets</span><span class="dropdown-item-desc">Manage or print bookings</span></div></a>' +
      (user.isLoggedIn
        ? '<a href="' + escapeHtml(rootUrl('pwd.html')) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">Change Password</span><span class="dropdown-item-desc">Update your account password</span></div></a>'
        : '') +
      '<div class="dropdown-separator"></div>' +
      '<a href="' + escapeHtml(pageUrl('help.html')) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">Help Center</span><span class="dropdown-item-desc">FAQs and customer support</span></div></a>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<a href="' + escapeHtml(rootUrl('login.html')) + '" class="logout-btn" id="header-auth-btn">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
      '<span>' + escapeHtml(authBtnLabel) + '</span>' +
      '</a>' +
      '</div>' +
      '</header>';

    const rawFile = (window.location.pathname || '').split('/').pop();
    const currentFile = !rawFile || rawFile === 'index.html' ? 'homepage.html' : rawFile;
    document.querySelectorAll('.header .nav-link').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-page') === currentFile);
    });

    document.getElementById('theme-toggle-btn')?.addEventListener('click', toggleDarkMode);

    const profileTrigger = document.getElementById('user-profile-trigger');
    const dropdown = document.getElementById('userDropdown');
    if (profileTrigger && dropdown) {
      const toggleMenu = function (e) {
        if (e.target && e.target.closest && e.target.closest('.dropdown-item')) return;
        e.stopPropagation();
        const open = dropdown.classList.toggle('show');
        profileTrigger.setAttribute('aria-expanded', String(open));
      };
      profileTrigger.addEventListener('click', toggleMenu);
      bindActivateKey(profileTrigger, toggleMenu);
    }

    document.getElementById('header-auth-btn')?.addEventListener('click', async function (e) {
      if (!AuthStore.getUser().isLoggedIn) return;
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
      '<footer class="homepage-footer">' +
      '<div class="container" style="max-width:1200px; margin:0 auto; padding:0 20px;">' +
      '<div class="footer-grid">' +
      '<div class="footer-column">' +
      '<h3>CineTix</h3>' +
      '<p>The premier web destination for movie enthusiasts to discover screenings, preview 3D auditoriums, reserve seats, and manage digital tickets.</p>' +
      '</div>' +
      '<div class="footer-column">' +
      '<h3>Quick Links</h3>' +
      '<ul class="footer-links-list">' +
      '<li><a href="' + escapeHtml(pageUrl('homepage.html')) + '">Movies</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('theater.html')) + '">Theaters</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('upcoming.html')) + '">Upcoming Releases</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('giftcards.html')) + '">Gift Cards</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('offer.html')) + '">Offers &amp; Discounts</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('generate_ticket.html')) + '">My Tickets</a></li>' +
      '</ul>' +
      '</div>' +
      '<div class="footer-column">' +
      '<h3>Support</h3>' +
      '<ul class="footer-links-list">' +
      '<li><a href="' + escapeHtml(pageUrl('faqs.html')) + '">FAQs</a></li>' +
      '<li><a href="#contact" id="footer-contact-trigger">Contact Us</a></li>' +
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
      questionEl.setAttribute('tabindex', '0');
      questionEl.setAttribute('role', 'button');
      questionEl.setAttribute('aria-expanded', String(questionEl.classList.contains('active')));

      const toggleFaq = function () {
        const isActive = questionEl.classList.toggle('active');
        questionEl.setAttribute('aria-expanded', String(isActive));
        questionEl.closest('.faq-item')?.classList.toggle('active', isActive);
      };
      questionEl.addEventListener('click', toggleFaq);
      bindActivateKey(questionEl, toggleFaq);
    });
  }

  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && !event.target.closest('#user-profile-trigger')) {
      const dd = document.getElementById('userDropdown');
      if (dd && dd.classList.contains('show')) {
        dd.classList.remove('show');
        document.getElementById('user-profile-trigger')?.setAttribute('aria-expanded', 'false');
      }
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    document.querySelector('.contact-popup')?.remove();
    document.querySelectorAll('.contact-modal').forEach(function (m) { m.style.display = 'none'; });
    const chat = document.getElementById('chat-dialog');
    if (chat) chat.style.display = 'none';
    const dd = document.getElementById('userDropdown');
    if (dd && dd.classList.contains('show')) {
      dd.classList.remove('show');
      document.getElementById('user-profile-trigger')?.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('DOMContentLoaded', async function () {
    initTheme();
    renderHeader();
    renderFooter();
    initFaqAccordions();

    if (document.getElementById('header-container')) {
      const before = AuthStore.getUser();
      const after = await AuthStore.syncSession();
      if (before.isLoggedIn !== after.isLoggedIn || before.userName !== after.userName) {
        renderHeader();
      }
    }
  });

  window.CineTicket = {
    AuthStore: AuthStore,
    bindActivateKey: bindActivateKey,
    calcCheckoutTotals: calcCheckoutTotals,
    calcGroupDiscount: calcGroupDiscount,
    escapeHtml: escapeHtml,
    fetchJson: fetchJson,
    formatStars: formatStars,
    initFaqAccordions: initFaqAccordions,
    pageUrl: pageUrl,
    renderHeader: renderHeader,
    renderStarIcons: renderStarIcons,
    renderStateBlock: renderStateBlock,
    resolveAssetUrl: resolveAssetUrl,
    rootUrl: rootUrl,
    safeRedirectUrl: safeRedirectUrl,
    showToast: showToast,
    toggleDarkMode: toggleDarkMode,
  };

  window.toggleDarkMode = toggleDarkMode;
  window.showToast = showToast;
  window.showNotification = showNotification;
  window.clickEmailUs = clickEmailUs;
  window.clickCallUs = clickCallUs;
  window.clickLink = clickLink;
})();