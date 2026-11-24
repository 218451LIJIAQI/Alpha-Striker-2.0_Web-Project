/**
 * Password Reset & Authenticated Password Change Controller
 * Supports ?mode=change URL deep-linking, popstate sync, and persistent field-level error highlighting.
 */
(function () {
  'use strict';

  async function resetPwd(event) {
    event.preventDefault();
    const CT = window.CineTicket;
    const emailEl = document.getElementById('email');
    const codeEl = document.getElementById('Verification');
    const pwdEl = document.getElementById('password');

    const email = emailEl ? emailEl.value.trim() : '';
    const verificationCode = codeEl ? codeEl.value.trim() : '';
    const password = pwdEl ? pwdEl.value : '';
    const submitBtn = document.querySelector('#reset-form button[type="submit"]');

    [emailEl, codeEl, pwdEl].forEach(CT.clearFieldError);

    if (!CT.isValidEmail(email)) {
      CT.flagFieldError(emailEl, 'Please enter a valid email address');
      window.showToast('Please enter a valid email address', 'warning');
      return;
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      CT.flagFieldError(codeEl, 'Enter the 6-digit verification code');
      window.showToast('Please enter the 6-digit verification code', 'warning');
      return;
    }
    if (!CT.isValidPasswordBytes(password)) {
      CT.flagFieldError(pwdEl, 'New password must be 6-72 UTF-8 bytes');
      window.showToast('New password must be 6-72 UTF-8 bytes', 'warning');
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
      CT.flagFieldError(codeEl, data.message || 'Password reset failed');
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
    const oldEl = document.getElementById('old-password');
    const newEl = document.getElementById('new-password-auth');
    const confirmEl = document.getElementById('confirm-password-auth');

    const oldPassword = oldEl ? oldEl.value : '';
    const newPassword = newEl ? newEl.value : '';
    const confirmPassword = confirmEl ? confirmEl.value : '';
    const submitBtn = document.querySelector('#change-pwd-form button[type="submit"]');

    [oldEl, newEl, confirmEl].forEach(CT.clearFieldError);

    if (!oldPassword) {
      CT.flagFieldError(oldEl, 'Current password is required');
      window.showToast('Please complete all password fields', 'warning');
      return;
    }
    if (!CT.isValidPasswordBytes(newPassword)) {
      CT.flagFieldError(newEl, 'New password must be 6-72 UTF-8 bytes');
      window.showToast('New password must be 6-72 UTF-8 bytes', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      CT.flagFieldError(confirmEl, 'New passwords do not match');
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
      if (data.httpStatus === 401) {
        CT.AuthStore.clearLocal();
        window.showToast(data.message || 'Session expired — please sign in again', 'warning');
        return;
      }
      CT.flagFieldError(oldEl, data.message || 'Password update failed');
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

    function syncUrlMode(isOld) {
      if (!window.history || typeof window.history.replaceState !== 'function') return;
      const qs = new URLSearchParams(window.location.search);
      if (isOld) qs.set('mode', 'change');
      else qs.delete('mode');
      const query = qs.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
    }

    const syncTabs = CT.bindTabList([tabCode, tabOldPwd].filter(Boolean), function (btn) {
      if (btn === tabOldPwd && !CT.AuthStore.getUser().isLoggedIn) {
        window.showToast('Please sign in first to change password with your current password', 'info');
        return false;
      }
      syncUrlMode(btn === tabOldPwd);
      return true;
    });

    function switchMode(mode) {
      const isOld = mode === 'change' && CT.AuthStore.getUser().isLoggedIn;
      syncTabs(isOld ? tabOldPwd : tabCode);
    }

    window.addEventListener('cinetix:authchange', function () {
      if (!CT.AuthStore.getUser().isLoggedIn && tabOldPwd?.classList.contains('active')) {
        switchMode('code');
        syncUrlMode(false);
      }
    });

    await CT.AuthStore.syncSession();
    const currentUser = CT.AuthStore.getUser();
    const emailInput = document.getElementById('email');
    if (currentUser.isLoggedIn && currentUser.userEmail && emailInput && !emailInput.value) {
      emailInput.value = currentUser.userEmail;
    }

    const applyModeFromUrl = function () {
      const requestedMode = new URLSearchParams(window.location.search).get('mode');
      switchMode(requestedMode === 'change' ? 'change' : 'code');
    };
    applyModeFromUrl();
    window.addEventListener('popstate', applyModeFromUrl);

    if (!sendBtn) return;

    let countdown = 0;
    sendBtn.addEventListener('click', async function () {
      if (countdown > 0) return;

      const email = emailInput ? emailInput.value.trim() : '';
      if (!CT.isValidEmail(email)) {
        CT.flagFieldError(emailInput, 'Please enter a valid email address first');
        window.showToast('Please enter a valid email address first', 'warning');
        return;
      }
      CT.clearFieldError(emailInput);

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
          CT.flagFieldError(emailInput, res.message || 'Could not send verification code');
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
})();