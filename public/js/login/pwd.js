/**
 * Password Reset & Authenticated Password Change Controller
 */
(function () {
  'use strict';

  async function resetPwd(event) {
    event.preventDefault();
    const CT = window.CineTicket;
    const email = document.getElementById('email').value.trim();
    const verificationCode = document.getElementById('Verification').value.trim();
    const password = document.getElementById('password').value;
    const submitBtn = document.querySelector('#reset-form button[type="submit"]');

    if (!email || !verificationCode || !password) {
      window.showToast('Please fill in all required fields', 'warning');
      return;
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      window.showToast('Please enter the 6-digit verification code', 'warning');
      return;
    }
    if (password.length < 6) {
      window.showToast('New password must be at least 6 characters', 'warning');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const data = await CT.fetchJson('/index.php/user/user/changePassword', {
        method: 'POST',
        body: { email: email, pwd: password, verification_code: verificationCode },
      });
      if (data.success) {
        CT.AuthStore.clearLocal();
        window.showToast('Password updated! Redirecting to login...', 'success');
        setTimeout(function () { window.location.href = CT.rootUrl('login.html'); }, 650);
        return;
      }
      window.showToast(data.message || 'Password reset failed', 'error');
    } catch (_) {
      window.showToast('Request failed, please try again later', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function changeSignedInPwd(event) {
    event.preventDefault();
    const CT = window.CineTicket;
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password-auth').value;
    const confirmPassword = document.getElementById('confirm-password-auth').value;
    const submitBtn = document.querySelector('#change-pwd-form button[type="submit"]');

    if (!oldPassword || !newPassword || !confirmPassword) {
      window.showToast('Please complete all password fields', 'warning');
      return;
    }
    if (newPassword.length < 6) {
      window.showToast('New password must be at least 6 characters', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      window.showToast('New passwords do not match', 'error');
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const data = await CT.fetchJson('/index.php/user/user/changePassword', {
        method: 'POST',
        body: { old_password: oldPassword, pwd: newPassword },
      });
      if (data.success) {
        window.showToast('Password changed! Returning to movies...', 'success');
        setTimeout(function () { window.location.href = CT.pageUrl('homepage.html'); }, 650);
        return;
      }
      window.showToast(data.message || 'Password update failed', 'error');
    } catch (_) {
      window.showToast('Request failed, please try again later', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    const CT = window.CineTicket;
    const sendBtn = document.getElementById('send-code');
    const tabCode = document.getElementById('tab-reset-code');
    const tabOldPwd = document.getElementById('tab-old-pwd');
    const resetForm = document.getElementById('reset-form');
    const changeForm = document.getElementById('change-pwd-form');

    resetForm?.addEventListener('submit', resetPwd);
    changeForm?.addEventListener('submit', changeSignedInPwd);

    function switchMode(mode) {
      const isOld = mode === 'change';
      tabCode?.classList.toggle('active', !isOld);
      tabCode?.setAttribute('aria-selected', String(!isOld));
      tabOldPwd?.classList.toggle('active', isOld);
      tabOldPwd?.setAttribute('aria-selected', String(isOld));
      resetForm?.classList.toggle('is-hidden', isOld);
      changeForm?.classList.toggle('is-hidden', !isOld);
    }

    tabCode?.addEventListener('click', function () { switchMode('code'); });
    tabOldPwd?.addEventListener('click', function () {
      const user = CT.AuthStore.getUser();
      if (!user.isLoggedIn) {
        window.showToast('Please sign in first to change password with your current password', 'info');
        return;
      }
      switchMode('change');
    });

    await CT.AuthStore.syncSession();
    const currentUser = CT.AuthStore.getUser();
    const emailInput = document.getElementById('email');
    if (currentUser.isLoggedIn && currentUser.userEmail && emailInput && !emailInput.value) {
      emailInput.value = currentUser.userEmail;
    }

    const requestedMode = new URLSearchParams(window.location.search).get('mode');
    if (requestedMode === 'change' && currentUser.isLoggedIn) {
      switchMode('change');
    } else {
      switchMode('code');
    }

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
          window.showToast(res.message || 'Could not send verification code', 'error');
          return;
        }

        if (res.data && res.data.debug_code) {
          window.showToast('Verification code: ' + res.data.debug_code, 'info');
        } else {
          window.showToast('6-digit verification code sent! Valid for 10 minutes.', 'success');
        }

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
        window.showToast('Unable to reach verification service', 'error');
      }
    });
  });

  window.resetPwd = resetPwd;
  window.changeSignedInPwd = changeSignedInPwd;
})();