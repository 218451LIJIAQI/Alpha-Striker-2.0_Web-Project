/**
 * Password Reset Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  const sendBtn = document.getElementById('send-code');
  if (!sendBtn) return;

  let countdown = 0;
  sendBtn.addEventListener('click', function () {
    if (countdown > 0) return;

    const emailInput = document.getElementById('email');
    const email = emailInput ? emailInput.value.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.showToast('Please enter a valid email address first', 'warning');
      if (emailInput) emailInput.focus();
      return;
    }

    window.showToast('Demo verification code sent (use 888888)', 'info');
    countdown = 60;
    sendBtn.disabled = true;
    sendBtn.textContent = countdown + 's';

    const timer = setInterval(function () {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(timer);
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Code';
      } else {
        sendBtn.textContent = countdown + 's';
      }
    }, 1000);
  });
});

async function resetPwd(event) {
  event.preventDefault();

  const email = document.getElementById('email').value.trim();
  const verificationCode = document.getElementById('Verification').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !verificationCode || !password) {
    window.showToast('Please fill in all required fields', 'warning');
    return;
  }
  if (password.length < 6) {
    window.showToast('New password must be at least 6 characters', 'warning');
    return;
  }

  try {
    const response = await fetch('/index.php/user/user/changePassword', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        pwd: password,
        verification_code: verificationCode,
      }),
    });
    const data = await response.json();

    if (data.success) {
      window.showToast('Password updated! Redirecting to login...', 'success');
      setTimeout(function () {
        window.location.href = window.CineTicket
          ? window.CineTicket.rootUrl('login.html')
          : 'login.html';
      }, 900);
    } else {
      window.showToast(data.message || 'Password reset failed', 'error');
    }
  } catch (_) {
    window.showToast('Request failed, please try again later', 'error');
  }
}