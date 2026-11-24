/**
 * User Authentication & Registration Controller
 * Supports URL mode deep-linking (?mode=register), popstate sync, and persistent field-level error retention.
 */
(function () {
  'use strict';

  const REMEMBER_EMAIL_KEY = 'cinetixRememberedEmail';

  function showPage(pageId, pushUrl) {
    const loginView = document.getElementById('login-page');
    const registerView = document.getElementById('register-page');

    if ((pageId === 'login-page' || pageId === 'register-page') && loginView && registerView) {
      const isRegister = pageId === 'register-page';
      loginView.classList.toggle('is-hidden', isRegister);
      registerView.classList.toggle('is-hidden', !isRegister);
      if (pushUrl && window.history && typeof window.history.pushState === 'function') {
        const qs = new URLSearchParams(window.location.search);
        if (isRegister) qs.set('mode', 'register');
        else qs.delete('mode');
        const query = qs.toString();
        window.history.pushState(null, '', window.location.pathname + (query ? '?' + query : ''));
      }
    } else {
      window.location.href = window.CineTicket.pageUrl('homepage.html');
    }
  }

  async function loginUser(event) {
    event.preventDefault();
    const CT = window.CineTicket;
    const emailEl = document.getElementById('email');
    const passwordEl = document.getElementById('password');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const rememberBox = document.getElementById('remember');
    const submitBtn = document.querySelector('#login-form button[type="submit"]');

    [emailEl, passwordEl].forEach(CT.clearFieldError);

    if (!email) {
      CT.flagFieldError(emailEl, 'Email address is required');
      window.showToast('Please enter your email and password', 'warning');
      return;
    }
    if (!password) {
      CT.flagFieldError(passwordEl, 'Password is required');
      window.showToast('Please enter your email and password', 'warning');
      return;
    }
    if (CT.utf8ByteLength(password) > 72) {
      CT.flagFieldError(passwordEl, 'Password must be 6-72 UTF-8 bytes');
      window.showToast('Password must be 6-72 bytes', 'warning');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const result = await CT.fetchJson('/index.php/user/user/login', {
        method: 'POST',
        body: { email: email, password: password },
      });
      if (result.success && result.data) {
        if (rememberBox && rememberBox.checked) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, email);
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
        CT.AuthStore.setUser(result.data);
        const rawRedirect = new URLSearchParams(window.location.search).get('redirect') || '';
        window.location.href = CT.sanitizeRedirectPath(rawRedirect, CT.pageUrl('homepage.html'));
        return;
      }
      CT.flagFieldError(passwordEl, result.message || 'Invalid email or password');
      window.showToast(result.message || 'Invalid email or password', 'error');
    } catch (_) {
      window.showToast('Login request failed, please try again', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function registerUser(event) {
    event.preventDefault();
    const CT = window.CineTicket;
    const nameEl = document.getElementById('name');
    const emailEl = document.getElementById('reg-email');
    const passwordEl = document.getElementById('reg-password');
    const confirmEl = document.getElementById('confirm-password');

    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const confirmPassword = confirmEl ? confirmEl.value : '';
    const submitBtn = document.querySelector('#register-form button[type="submit"]');

    [nameEl, emailEl, passwordEl, confirmEl].forEach(CT.clearFieldError);

    if (!name) {
      CT.flagFieldError(nameEl, 'Full name is required');
      window.showToast('Please complete all required fields', 'warning');
      return;
    }
    if (!CT.isValidEmail(email)) {
      CT.flagFieldError(emailEl, 'Please enter a valid email address');
      window.showToast('Please enter a valid email address', 'warning');
      return;
    }
    if (!CT.isValidPasswordBytes(password)) {
      CT.flagFieldError(passwordEl, 'Password must be 6-72 UTF-8 bytes');
      window.showToast('Password must be 6-72 UTF-8 bytes', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      CT.flagFieldError(confirmEl, 'Passwords do not match');
      window.showToast('The two passwords entered do not match', 'error');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const result = await CT.fetchJson('/index.php/user/user/reg', {
        method: 'POST',
        body: { name: name, email: email, password: password },
      });
      if (result.success && result.data) {
        CT.AuthStore.setUser(result.data);
        window.location.href = CT.pageUrl('homepage.html');
        return;
      }
      CT.flagFieldError(emailEl, result.message || 'Registration failed');
      window.showToast(result.message || 'Registration failed', 'error');
    } catch (_) {
      window.showToast('Registration request failed, please try again', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    function syncViewFromUrl() {
      const mode = new URLSearchParams(window.location.search).get('mode');
      showPage(mode === 'register' ? 'register-page' : 'login-page', false);
    }

    syncViewFromUrl();
    window.addEventListener('popstate', syncViewFromUrl);

    const remembered = localStorage.getItem(REMEMBER_EMAIL_KEY);
    const emailEl = document.getElementById('email');
    const rememberEl = document.getElementById('remember');
    if (remembered && emailEl && !emailEl.value) {
      emailEl.value = remembered;
      if (rememberEl) rememberEl.checked = true;
    }

    document.getElementById('login-form')?.addEventListener('submit', loginUser);
    document.getElementById('register-form')?.addEventListener('submit', registerUser);

    document.querySelectorAll('[data-auth-switch]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        showPage(link.getAttribute('data-auth-switch'), true);
      });
    });

    document.querySelectorAll('.social-icon').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.showToast('Please use email & password login in this demo environment.', 'info');
      });
    });
  });
})();