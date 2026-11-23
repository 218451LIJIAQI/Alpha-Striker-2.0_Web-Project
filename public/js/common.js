/**
 * CineTicket (Alpha Striker 2.0) — Shared Frontend Runtime
 * Centralizes path resolution, XSS-safe escaping, user session state, theme switching,
 * toast notifications, and shared header/footer/FAQ behaviors.
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
    const clean = trimmed.replace(/^(\.\.\/|\.\/)+/, '');
    return currentDepthPrefix() + clean;
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

    async logout() {
      localStorage.removeItem('userToken');
      localStorage.removeItem('userId');
      localStorage.removeItem('userName');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('email');
      localStorage.removeItem('pwd');
      try {
        await fetch('/index.php/user/user/logout', { method: 'POST' });
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

  function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark-mode', isDark);
    if (document.body) {
      document.body.classList.toggle('dark-mode', isDark);
    }
  }

  function initTheme() {
    ensureStylesheet('dark-mode-css', 'css/common/dark-mode.css');
    const savedDark = localStorage.getItem('darkMode') === 'true';
    applyTheme(savedDark);
  }

  function toggleDarkMode() {
    const nextDark = !document.documentElement.classList.contains('dark-mode');
    localStorage.setItem('darkMode', String(nextDark));
    applyTheme(nextDark);
  }

  // Apply theme immediately during <head> execution to prevent light-flash
  initTheme();

  function getToastIcon(type) {
    if (type === 'success') {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }
    if (type === 'error') {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    }
    if (type === 'warning') {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  function showToast(message, type, title) {
    const resolvedType = type || 'info';
    const defaultTitles = {
      success: 'Success',
      error: 'Error',
      warning: 'Notice',
      info: 'Notice',
    };
    const resolvedTitle = title || defaultTitles[resolvedType] || 'Notice';

    const el = document.createElement('div');
    el.className = 'user-notification ' + escapeHtml(resolvedType);
    el.innerHTML =
      '<div class="notification-content">' +
      '<div class="notification-icon">' + getToastIcon(resolvedType) + '</div>' +
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

  // Supports both showNotification(title, message, type) and showNotification(message, type)
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

  function highlightCurrentNavItem() {
    const rawFile = (window.location.pathname || '').split('/').pop();
    const currentFile = !rawFile || rawFile === 'index.html' ? 'homepage.html' : rawFile;

    document.querySelectorAll('.header .nav-link').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-page') === currentFile);
    });
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
      '<nav class="nav-links">' +
      '<a href="' + escapeHtml(pageUrl('homepage.html')) + '" class="nav-link" data-page="homepage.html">Movies</a>' +
      '<a href="' + escapeHtml(pageUrl('theater.html')) + '" class="nav-link" data-page="theater.html">Theaters</a>' +
      '<a href="' + escapeHtml(pageUrl('offer.html')) + '" class="nav-link" data-page="offer.html">Offers</a>' +
      '<a href="' + escapeHtml(pageUrl('about.html')) + '" class="nav-link" data-page="about.html">About</a>' +
      '</nav>' +
      '<div class="user-actions">' +
      '<button type="button" class="dark-mode-toggle" id="theme-toggle-btn" title="Toggle Dark Mode" aria-label="Toggle Dark Mode">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="moon-icon">' +
      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>' +
      '</svg>' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sun-icon">' +
      '<circle cx="12" cy="12" r="5"></circle>' +
      '<line x1="12" y1="1" x2="12" y2="3"></line>' +
      '<line x1="12" y1="21" x2="12" y2="23"></line>' +
      '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>' +
      '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>' +
      '<line x1="1" y1="12" x2="3" y2="12"></line>' +
      '<line x1="21" y1="12" x2="23" y2="12"></line>' +
      '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>' +
      '<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>' +
      '</svg>' +
      '</button>' +
      '<a href="' + escapeHtml(ticketsHref) + '" class="user-profile" id="header-tickets-link" title="My Tickets">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>' +
      '<span class="user-name" id="header-cart">Tickets</span>' +
      '</a>' +
      '<div class="user-profile" id="user-profile-trigger">' +
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
      '<a href="' + escapeHtml(pageUrl('homepage.html')) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">Browse Movies</span><span class="dropdown-item-desc">Explore current screenings</span></div></a>' +
      '<a href="' + escapeHtml(pageUrl('theater.html')) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">Find Theaters</span><span class="dropdown-item-desc">View cinema locations & schedules</span></div></a>' +
      '<a href="' + escapeHtml(pageUrl('offer.html')) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">Special Offers</span><span class="dropdown-item-desc">Claim active promo codes</span></div></a>' +
      '<a href="' + escapeHtml(ticketsHref) + '" class="dropdown-item"><div class="dropdown-item-text"><span class="dropdown-item-title">My Tickets</span><span class="dropdown-item-desc">Manage or print bookings</span></div></a>' +
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

    highlightCurrentNavItem();

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', toggleDarkMode);
    }

    const profileTrigger = document.getElementById('user-profile-trigger');
    const dropdown = document.getElementById('userDropdown');
    if (profileTrigger && dropdown) {
      profileTrigger.addEventListener('click', function (e) {
        if (e.target.closest('.dropdown-item')) return;
        e.stopPropagation();
        dropdown.classList.toggle('show');
      });
    }

    const authBtn = document.getElementById('header-auth-btn');
    if (authBtn) {
      authBtn.addEventListener('click', async function (e) {
        if (!user.isLoggedIn) {
          return; // Navigate directly to login.html
        }
        e.preventDefault();
        await AuthStore.logout();
        window.location.href = rootUrl('login.html');
      });
    }
  }

  function addBottom() {
    const bottomContainer = document.getElementById('bottom-container');
    if (!bottomContainer) return;

    const currentFile = (window.location.pathname || '').split('/').pop();
    const skipFooter = ['booking3.html', 'pay.html', 'paysuccess.html'];
    if (skipFooter.includes(currentFile)) {
      bottomContainer.innerHTML = '';
      return;
    }

    ensureStylesheet('common-footer-css', 'css/common/footer.css');
    const appStoreImg = resolveAssetUrl('img/app-store.png');

    bottomContainer.innerHTML =
      '<footer class="homepage-footer">' +
      '<div class="container" style="max-width:1200px; margin: 0 auto; padding: 0 20px;">' +
      '<div class="footer-grid">' +
      '<div class="footer-column">' +
      '<h3>CineTix</h3>' +
      '<p>The premier destination for movie enthusiasts to discover screenings, reserve seats, and enjoy cinema experiences.</p>' +
      '</div>' +
      '<div class="footer-column">' +
      '<h3>Quick Links</h3>' +
      '<ul class="footer-links-list">' +
      '<li><a href="' + escapeHtml(pageUrl('homepage.html')) + '">Movies</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('theater.html')) + '">Theaters</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('upcoming.html')) + '">Upcoming Releases</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('giftcards.html')) + '">Gift Cards</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('offer.html')) + '">Offers &amp; Discounts</a></li>' +
      '</ul>' +
      '</div>' +
      '<div class="footer-column">' +
      '<h3>Support</h3>' +
      '<ul class="footer-links-list">' +
      '<li><a href="' + escapeHtml(pageUrl('faqs.html')) + '">FAQs</a></li>' +
      '<li><a href="#" id="footer-contact-trigger">Contact Us</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('team.html')) + '">Terms of Service</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('privacy.html')) + '">Privacy Policy</a></li>' +
      '<li><a href="' + escapeHtml(pageUrl('help.html')) + '">Help Center</a></li>' +
      '</ul>' +
      '</div>' +
      '<div class="footer-column">' +
      '<h3>Mobile App</h3>' +
      '<p>Access your digital tickets and showtimes anywhere.</p>' +
      '<a href="' + escapeHtml(pageUrl('generate_ticket.html')) + '" class="app-store-link">' +
      '<img src="' + escapeHtml(appStoreImg) + '" alt="App Store">' +
      '</a>' +
      '</div>' +
      '</div>' +
      '<div class="footer-bottom">' +
      '<p>&copy; 2026 Alpha Striker 2.0 (CineTix). All rights reserved.</p>' +
      '</div>' +
      '</div>' +
      '</footer>';

    const contactTrigger = document.getElementById('footer-contact-trigger');
    if (contactTrigger) {
      contactTrigger.addEventListener('click', function (e) {
        e.preventDefault();
        clickLink();
      });
    }
  }

  function initFaqAccordions() {
    document.querySelectorAll('.faq-question').forEach(function (questionEl) {
      if (questionEl.dataset.faqBound === 'true') return;
      questionEl.dataset.faqBound = 'true';
      questionEl.addEventListener('click', function () {
        const parentItem = questionEl.closest('.faq-item');
        questionEl.classList.toggle('active');
        if (parentItem) {
          parentItem.classList.toggle('active');
        }
      });
    });
  }

  document.addEventListener('click', function (event) {
    if (!event.target.closest('#user-profile-trigger')) {
      const dropdown = document.getElementById('userDropdown');
      if (dropdown) dropdown.classList.remove('show');
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    renderHeader();
    addBottom();
    initFaqAccordions();
  });

  // Expose structured namespace and backwards-compatible global helpers
  window.CineTicket = {
    AuthStore: AuthStore,
    escapeHtml: escapeHtml,
    formatStars: formatStars,
    pageUrl: pageUrl,
    rootUrl: rootUrl,
    resolveAssetUrl: resolveAssetUrl,
    showToast: showToast,
    toggleDarkMode: toggleDarkMode,
  };

  window.toggleDarkMode = toggleDarkMode;
  window.showToast = showToast;
  window.showNotification = showNotification;
  window.clickEmailUs = clickEmailUs;
  window.clickCallUs = clickCallUs;
  window.clickLink = clickLink;
  window.addBottom = addBottom;
  window.checkLoginStatus = function () {
    return AuthStore.getUser().isLoggedIn;
  };
})();