/**
 * User Authentication & Registration Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const savedEmail = localStorage.getItem('rememberedEmail') || '';
  const emailInput = document.getElementById('email');
  const rememberBox = document.getElementById('remember');
  if (savedEmail && emailInput) {
    emailInput.value = savedEmail;
    if (rememberBox) rememberBox.checked = true;
  }

  if (new URLSearchParams(window.location.search).get('mode') === 'register') {
    showPage('register-page');
  }
});

function showPage(pageId) {
  const loginView = document.getElementById('login-page');
  const registerView = document.getElementById('register-page');

  if ((pageId === 'login-page' || pageId === 'register-page') && loginView && registerView) {
    loginView.style.display = pageId === 'login-page' ? 'block' : 'none';
    registerView.style.display = pageId === 'register-page' ? 'block' : 'none';
  } else {
    window.location.href = window.CineTicket.pageUrl('homepage.html');
  }
}

async function loginUser(event) {
  event.preventDefault();
  const CT = window.CineTicket;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const remember = Boolean(document.getElementById('remember')?.checked);
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
      if (remember) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      CT.AuthStore.setUser(result.data);
      const rawRedirect = new URLSearchParams(window.location.search).get('redirect');
      window.location.href = CT.safeRedirectUrl(rawRedirect, CT.pageUrl('homepage.html'));
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
      const rawRedirect = new URLSearchParams(window.location.search).get('redirect');
      window.location.href = CT.safeRedirectUrl(rawRedirect, CT.pageUrl('homepage.html'));
      return;
    }
    window.showToast(result.message || 'Registration failed', 'error');
  } catch (_) {
    window.showToast('Registration request failed, please try again', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}