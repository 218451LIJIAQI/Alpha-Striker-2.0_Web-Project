/**
 * User Authentication & Registration Controller
 */
(function () {
  'use strict';

  function showPage(pageId) {
    const loginView = document.getElementById('login-page');
    const registerView = document.getElementById('register-page');

    if ((pageId === 'login-page' || pageId === 'register-page') && loginView && registerView) {
      loginView.classList.toggle('is-hidden', pageId !== 'login-page');
      registerView.classList.toggle('is-hidden', pageId !== 'register-page');
    } else {
      window.location.href = window.CineTicket.pageUrl('homepage.html');
    }
  }

  async function loginUser(event) {
    event.preventDefault();
    const CT = window.CineTicket;
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const submitBtn = document.querySelector('#login-form button[type="submit"]');

    if (!email || !password) {
      window.showToast('Please enter your email and password', 'warning');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const result = await CT.fetchJson('/index.php/user/user/login', {
        method: 'POST',
        body: { email: email, password: password },
      });
      if (result.success && result.data) {
        CT.AuthStore.setUser(result.data);
        const rawRedirect = new URLSearchParams(window.location.search).get('redirect') || '';
        const safeRedirect = rawRedirect && !/^(?:https?:|javascript:|\/\/)/i.test(rawRedirect)
          ? rawRedirect
          : CT.pageUrl('homepage.html');
        window.location.href = safeRedirect;
        return;
      }
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
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const submitBtn = document.querySelector('#register-form button[type="submit"]');

    if (!name || !email || !password) {
      window.showToast('Please complete all required fields', 'warning');
      return;
    }
    if (password.length < 6) {
      window.showToast('Password must be at least 6 characters', 'warning');
      return;
    }
    if (password !== confirmPassword) {
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
      window.showToast(result.message || 'Registration failed', 'error');
    } catch (_) {
      window.showToast('Registration request failed, please try again', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'register') {
      showPage('register-page');
    }

    document.getElementById('login-form')?.addEventListener('submit', loginUser);
    document.getElementById('register-form')?.addEventListener('submit', registerUser);

    document.querySelectorAll('[data-auth-switch]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        showPage(link.getAttribute('data-auth-switch'));
      });
    });

    document.querySelectorAll('.social-icon').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.showToast('Please use email & password login in this demo environment.', 'info');
      });
    });
  });

  window.showPage = showPage;
  window.loginUser = loginUser;
  window.registerUser = registerUser;
})();