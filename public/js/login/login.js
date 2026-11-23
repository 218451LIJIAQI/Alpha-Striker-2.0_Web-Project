/**
 * User Authentication & Registration Controller
 */
function showPage(pageId) {
  const loginView = document.getElementById('login-page');
  const registerView = document.getElementById('register-page');

  if (pageId === 'login-page' && loginView && registerView) {
    loginView.style.display = 'block';
    registerView.style.display = 'none';
  } else if (pageId === 'register-page' && loginView && registerView) {
    loginView.style.display = 'none';
    registerView.style.display = 'block';
  } else {
    window.location.href = window.CineTicket
      ? window.CineTicket.pageUrl('homepage.html')
      : 'pages/homepage.html';
  }
}

async function loginUser(event) {
  event.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    window.showToast('Please enter your email and password', 'warning');
    return;
  }

  try {
    const response = await fetch('/index.php/user/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    });
    const result = await response.json();

    if (result.success && result.data) {
      window.CineTicket.AuthStore.setUser(result.data);
      const redirectTarget = new URLSearchParams(window.location.search).get('redirect');
      window.location.href = redirectTarget || window.CineTicket.pageUrl('homepage.html');
    } else {
      window.showToast(result.message || 'Invalid email or password', 'error');
    }
  } catch (_) {
    window.showToast('Login request failed, please try again', 'error');
  }
}

async function registerUser(event) {
  event.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

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

  try {
    const response = await fetch('/index.php/user/user/reg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, email: email, password: password }),
    });
    const result = await response.json();

    if (result.success && result.data) {
      window.CineTicket.AuthStore.setUser(result.data);
      window.location.href = window.CineTicket.pageUrl('homepage.html');
    } else {
      window.showToast(result.message || 'Registration failed', 'error');
    }
  } catch (_) {
    window.showToast('Registration request failed, please try again', 'error');
  }
}