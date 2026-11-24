/**
 * About Page, Team Contacts, Support Modals & Live Chat Assistant Controller
 */
(function () {
  'use strict';

  function makeCall(phoneNumber) {
    window.location.href = 'tel:' + encodeURIComponent(phoneNumber);
    window.showToast('Dialing ' + phoneNumber + '...', 'info');
  }

  function openEmail(emailAddress) {
    window.location.href = 'mailto:' + encodeURIComponent(emailAddress);
    window.showToast('Opening mail client for ' + emailAddress, 'info');
  }

  function closeModalAndRestoreFocus(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = 'none';
    window.CineTicket.restoreDialogFocus();
  }

  function applyFieldPrefill(inputEl, nextVal) {
    if (!inputEl) return;
    if (inputEl.dataset && !inputEl.dataset.prefillTrackBound) {
      inputEl.dataset.prefillTrackBound = '1';
      inputEl.addEventListener('input', function () {
        inputEl.dataset.userEdited = inputEl.value.trim() ? '1' : '';
        delete inputEl.dataset.autofilled;
      });
    }
    const isUntouched = !inputEl.dataset || !inputEl.dataset.userEdited;
    const wasAutofilled = Boolean(inputEl.dataset && inputEl.dataset.autofilled === '1');
    if (nextVal) {
      if (!inputEl.value.trim() || (wasAutofilled && isUntouched)) {
        inputEl.value = nextVal;
        if (inputEl.dataset) {
          inputEl.dataset.autofilled = '1';
          inputEl.dataset.userEdited = '';
        }
      }
    } else if (wasAutofilled && isUntouched) {
      inputEl.value = '';
      if (inputEl.dataset) {
        delete inputEl.dataset.autofilled;
      }
    }
  }

  function syncSupportUserPrefill() {
    const user = window.CineTicket.AuthStore.getUser();
    const nameVal = user.isLoggedIn ? (user.userName || '') : '';
    const emailVal = user.isLoggedIn ? (user.userEmail || '') : '';
    applyFieldPrefill(document.getElementById('support-name-input'), nameVal);
    applyFieldPrefill(document.getElementById('support-email-input'), emailVal);
    applyFieldPrefill(document.getElementById('cat-email-input'), emailVal);
  }

  function selectCategory(category, triggerEl) {
    const CT = window.CineTicket;
    CT.activatePill(document.querySelectorAll('.category-card'), triggerEl);

    const container = document.getElementById('category-form');
    if (!container) return;

    const titles = {
      booking: 'Booking & Refund Support',
      technical: 'Technical Issue Report',
      account: 'Account Assistance',
      feedback: 'Guest Experience Feedback',
    };
    const resolvedTitle = titles[category] || 'Support Inquiry';

    container.classList.remove('is-hidden');
    if (!container.querySelector('.submit-category-form')) {
      container.innerHTML =
        '<h4 class="category-form-heading">' + CT.escapeHtml(resolvedTitle) + '</h4>' +
        '<div class="form-group"><label for="cat-email-input">Contact Email *</label><input type="email" id="cat-email-input" class="cat-email" placeholder="your.email@example.com" required></div>' +
        '<div class="form-group"><label for="cat-details-input">Details *</label><textarea id="cat-details-input" class="cat-details" rows="3" placeholder="Share relevant booking ID or details..." required></textarea></div>' +
        '<button type="button" class="send-email-btn submit-category-form">Submit Request</button>';

      container.querySelector('.submit-category-form').addEventListener('click', function () {
        const emailEl = container.querySelector('.cat-email');
        const detailsEl = container.querySelector('.cat-details');
        const email = emailEl ? emailEl.value.trim() : '';
        const details = detailsEl ? detailsEl.value.trim() : '';
        [emailEl, detailsEl].forEach(CT.clearFieldError);

        if (!CT.isValidEmail(email)) {
          CT.flagFieldError(emailEl, 'Please enter a valid contact email');
          window.showToast('Please provide a valid email and inquiry details', 'warning');
          return;
        }
        if (!details) {
          CT.flagFieldError(detailsEl, 'Please describe your inquiry');
          window.showToast('Please provide a valid email and inquiry details', 'warning');
          return;
        }
        window.showToast('Request received! Our team will follow up shortly.', 'success');
        if (detailsEl) detailsEl.value = '';
        if (emailEl && emailEl.dataset) {
          emailEl.dataset.userEdited = '';
        }
        syncSupportUserPrefill();
        CT.activatePill(document.querySelectorAll('.category-card'), null);
        container.classList.add('is-hidden');
      });
    } else {
      const headingEl = container.querySelector('.category-form-heading') || container.querySelector('h4');
      if (headingEl) headingEl.textContent = resolvedTitle;
      [container.querySelector('.cat-email'), container.querySelector('.cat-details')].forEach(CT.clearFieldError);
    }

    syncSupportUserPrefill();
  }

  function clickLiveChat() {
    const dialog = document.getElementById('chat-dialog');
    if (dialog) {
      window.CineTicket.rememberDialogTrigger();
      dialog.style.display = 'flex';
      document.getElementById('chat-input-field')?.focus();
    }
  }

  function selectQuickAction(topic) {
    const prompts = {
      booking: 'How do I check or modify my movie booking?',
      refund: 'How can I cancel a booked seat and request a refund?',
      technical: 'I need help with promo codes at checkout.',
      theaters: 'Where can I view theaters and showtimes?',
    };
    const input = document.getElementById('chat-input-field');
    if (input) {
      input.value = prompts[topic] || 'Hello, I need assistance.';
      sendChatMessage();
    }
  }

  function sendChatMessage() {
    const input = document.getElementById('chat-input-field');
    const messagesBox = document.querySelector('.chat-messages');
    if (!input || !messagesBox) return;

    const text = input.value.trim();
    if (!text) return;

    appendChatBubble(messagesBox, text, 'user');
    input.value = '';

    setTimeout(function () {
      appendChatBubble(messagesBox, buildSupportReply(text), 'bot');
    }, 380);
  }

  function appendChatBubble(container, message, role) {
    const esc = window.CineTicket.escapeHtml;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isUser = role === 'user';
    const div = document.createElement('div');
    div.className = 'chat-message ' + (isUser ? 'user-message' : 'bot-message');
    div.innerHTML =
      '<div class="message-avatar"><i class="fas ' + (isUser ? 'fa-user' : 'fa-robot') + '" aria-hidden="true"></i></div>' +
      '<div class="message-content">' +
      '<div class="message-text">' + esc(message) + '</div>' +
      '<div class="message-time tabular-nums">' + esc(now) + '</div>' +
      '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function buildSupportReply(query) {
    const q = query.toLowerCase();
    if (q.includes('cancel') || q.includes('refund')) {
      return 'Upcoming tickets can be cancelled anytime before screening start from the Tickets page in the top navigation bar.';
    }
    if (q.includes('promo') || q.includes('discount') || q.includes('offer')) {
      return 'Visit the Offers tab to copy any active promo code for instant savings, or book 5+ seats for 30% group savings!';
    }
    if (q.includes('theater') || q.includes('showtime')) {
      return 'Visit the Theaters tab to explore partner locations, amenities, 3D sightlines, and daily screening schedules.';
    }
    if (q.includes('booking') || q.includes('ticket')) {
      return 'Open the Tickets tab in the header to view your digital tickets, row/seat details, and print/PDF export.';
    }
    return 'Thanks for reaching out! For urgent booking inquiries, email lijiaqi0807@gmail.com or visit our Help Center.';
  }

  document.addEventListener('DOMContentLoaded', function () {
    const CT = window.CineTicket;

    document.querySelectorAll('.close-modal').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeModalAndRestoreFocus(btn.closest('.contact-modal'));
      });
    });

    document.querySelectorAll('.contact-modal').forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModalAndRestoreFocus(modal);
      });
    });

    document.querySelector('.call-btn')?.addEventListener('click', window.clickCallUs);
    document.querySelector('.email-btn')?.addEventListener('click', window.clickEmailUs);
    document.querySelector('.chat-btn')?.addEventListener('click', clickLiveChat);

    document.querySelectorAll('[data-call-phone]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        makeCall(btn.getAttribute('data-call-phone'));
      });
    });

    document.querySelectorAll('[data-direct-email]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openEmail(btn.getAttribute('data-direct-email'));
      });
    });

    document.querySelectorAll('.category-card[data-support-cat]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectCategory(btn.getAttribute('data-support-cat'), btn);
      });
    });

    document.querySelectorAll('.quick-action-btn[data-chat-topic]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectQuickAction(btn.getAttribute('data-chat-topic'));
      });
    });

    document.querySelectorAll('.team-social-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const member = btn.getAttribute('data-member') || 'Alpha Striker 2.0 Team';
        const channel = btn.getAttribute('data-channel') || 'Contact';
        const detail = btn.getAttribute('data-contact') || 'lijiaqi0807@gmail.com';
        window.showToast(member + ' • ' + channel + ': ' + detail, 'info', 'Leadership Directory');
      });
    });

    document.querySelector('.callback-btn')?.addEventListener('click', function () {
      const phoneInput = document.querySelector('.callback-input');
      const timeSelect = document.querySelector('.callback-time');
      const phone = phoneInput ? phoneInput.value.trim() : '';

      if (!phone) {
        CT.flagFieldError(phoneInput, 'Please enter your phone number');
        window.showToast('Please enter your phone number', 'warning');
        return;
      }
      CT.clearFieldError(phoneInput);

      const slot = timeSelect ? timeSelect.value : 'next available window';
      window.showToast('Callback scheduled (' + slot + ') for ' + phone, 'success');
      if (phoneInput) phoneInput.value = '';
      if (timeSelect) timeSelect.selectedIndex = 0;
    });

    CT.bindTabList(document.querySelectorAll('.email-tab'));
    syncSupportUserPrefill();
    window.addEventListener('cinetix:authchange', syncSupportUserPrefill);
    window.addEventListener('cinetix:emailmodalopen', syncSupportUserPrefill);

    document.querySelector('.send-email-btn')?.addEventListener('click', function () {
      const categoryEl = document.querySelector('.support-category');
      const nameInput = document.getElementById('support-name-input');
      const emailInput = document.getElementById('support-email-input');
      const subjectInput = document.getElementById('support-subject-input');
      const messageInput = document.getElementById('support-message-input');

      [categoryEl, nameInput, emailInput, subjectInput, messageInput].forEach(CT.clearFieldError);

      const category = categoryEl?.value || '';
      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const subject = subjectInput ? subjectInput.value.trim() : '';
      const message = messageInput ? messageInput.value.trim() : '';

      if (!category || category === 'Select your inquiry type') {
        CT.flagFieldError(categoryEl, 'Please select an inquiry type');
        window.showToast('Please select an inquiry type', 'warning');
        return;
      }
      if (!name) {
        CT.flagFieldError(nameInput, 'Please enter your name');
        window.showToast('Please enter your name and a valid email address', 'warning');
        return;
      }
      if (!CT.isValidEmail(email)) {
        CT.flagFieldError(emailInput, 'Please enter a valid email address');
        window.showToast('Please enter your name and a valid email address', 'warning');
        return;
      }
      if (!subject) {
        CT.flagFieldError(subjectInput, 'Please enter a subject');
        window.showToast('Please enter both a subject and message', 'warning');
        return;
      }
      if (!message) {
        CT.flagFieldError(messageInput, 'Please enter your message');
        window.showToast('Please enter both a subject and message', 'warning');
        return;
      }

      window.showToast('Support ticket submitted! We will reply within 24 hours.', 'success');
      if (categoryEl) categoryEl.selectedIndex = 0;
      nameInput.value = '';
      emailInput.value = '';
      if (nameInput.dataset) { nameInput.dataset.userEdited = ''; delete nameInput.dataset.autofilled; }
      if (emailInput.dataset) { emailInput.dataset.userEdited = ''; delete emailInput.dataset.autofilled; }
      subjectInput.value = '';
      messageInput.value = '';
      syncSupportUserPrefill();
      closeModalAndRestoreFocus(document.getElementById('email-modal'));
    });

    const chatDialog = document.getElementById('chat-dialog');
    if (chatDialog) {
      chatDialog.querySelector('.close-chat')?.addEventListener('click', function () {
        closeModalAndRestoreFocus(chatDialog);
      });
      chatDialog.querySelector('.send-message')?.addEventListener('click', sendChatMessage);
      document.getElementById('chat-input-field')?.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendChatMessage();
        }
      });
    }
  });
})();