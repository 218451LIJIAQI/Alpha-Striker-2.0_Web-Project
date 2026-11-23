/**
 * Password Reset & Authenticated Password Change Controller
 */
let useCurrentPasswordMode = false;

document.addEventListener('DOMContentLoaded', async function () {
  const CT = window.CineTicket;
  const sendBtn = document.getElementById('send-code');
  const emailInput = document.getElementById('email');
  const modeSwitchWrap = document.getElementById('pwd-mode-switch');
  const toggleModeBtn = document.getElementById('toggle-pwd-mode');
  const otpGroup = document.getElementById('otp-group');
  const curPwdGroup = document.getElementById('current-pwd-group');
  const heading = document.getElementById('pwd-heading');
  const subheading = document.getElementById('pwd-subheading');
  const banner = document.getElementById('demo-otp-banner');

  const sessionUser = await CT.AuthStore.syncSession();
  if (sessionUser.isLoggedIn && sessionUser.userEmail) {
    if (emailInput) emailInput.value = sessionUser.userEmail;
    if (modeSwitchWrap) modeSwitchWrap.style.display = 'block';
  }

  toggleModeBtn?.addEventListener('click', function () {
    useCurrentPasswordMode = !useCurrentPasswordMode;
    if (otpGroup) otpGroup.style.display = useCurrentPasswordMode ? 'none' : 'block';
    if (curPwdGroup) curPwdGroup.style.display = useCurrentPasswordMode ? 'block' : 'none';
    if (banner && useCurrentPasswordMode) banner.style.display = 'none';
    if (heading) heading.textContent = useCurrentPasswordMode ? 'Change Password' : 'Reset Password';
    if (subheading) {
      subheading.textContent = useCurrentPasswordMode
        ? 'Verify your current password to set a new account password'
        : 'Request a one-time verification code for your registered email';
    }
    toggleModeBtn.textContent = useCurrentPasswordMode
      ? 'Forgot current password? Use Email Verification Code'
      : 'Switch to Current-Password Verification';
  });

  if (!sendBtn) return;

  let countdown = 0;
  sendBtn.addEventListener('click', async function () {
    if (countdown > 0) return;

    const email = emailInput ? emailInput.value.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.showToast('Please enter a valid email address first', 'warning');
      emailInput?.focus();
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const res = await CT.fetchJson('/index.php/user/user/sendResetCode', {
        method: 'POST',
        body: { email: email },
      });

      if (!res.success) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Code';
        window.showToast(res.message || 'Unable to send verification code', 'error');
        return;
      }

      if (res.data && res.data.demo_code && banner) {
        banner.style.display = 'block';
        banner.innerHTML =
          '<strong>Local Screening Demo Mailbox:</strong> Your one-time code for <strong>' +
          CT.escapeHtml(email) +
          '</strong> is <code id="issued-otp-code" style="font-weight:700; font-size:14px;">' +
          CT.escapeHtml(res.data.demo_code) +
          '</code> (valid for 5 minutes).';
      }
      window.showToast('One-time verification code issued!', 'success');

      countdown = 60;
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
    } catch (_) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Code';
      window.showToast('Network error while requesting verification code', 'error');
    }
  });
});

async function resetPwd(event) {
  event.preventDefault();
  const CT = window.CineTicket;
  const email = document.getElementById('email').value.trim();
  const verificationCode = document.getElementById('Verification')?.value.trim() || '';
  const currentPassword = document.getElementById('current-password')?.value || '';
  const password = document.getElementById('password').value;
  const submitBtn = document.getElementById('pwd-submit-btn');

  if (!email || !password) {
    window.showToast('Please fill in all required fields', 'warning');
    return;
  }
  if (!useCurrentPasswordMode && !verificationCode) {
    window.showToast('Please request and enter your verification code', 'warning');
    return;
  }
  if (useCurrentPasswordMode && !currentPassword) {
    window.showToast('Please enter your current password', 'warning');
    return;
  }
  if (password.length < 6) {
    window.showToast('New password must be at least 6 characters', 'warning');
    return;
  }

  const body = useCurrentPasswordMode
    ? { email: email, current_password: currentPassword, pwd: password }
    : { email: email, verification_code: verificationCode, pwd: password };

  if (submitBtn) submitBtn.disabled = true;
  try {
    const data = await CT.fetchJson('/index.php/user/user/changePassword', {
      method: 'POST',
      body: body,
    });
    if (data.success) {
      if (!useCurrentPasswordMode) {
        CT.AuthStore.clearLocal();
      }
      window.showToast('Password updated! Redirecting...', 'success');
      setTimeout(function () {
        window.location.href = useCurrentPasswordMode
          ? CT.pageUrl('homepage.html')
          : CT.rootUrl('login.html');
      }, 700);
      return;
    }
    window.showToast(data.message || 'Password update failed', 'error');
  } catch (_) {
    window.showToast('Request failed, please try again later', 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}