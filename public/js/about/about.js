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

  function selectCategory(category, triggerEl) {
    document.querySelectorAll('.category-card').forEach(function (card) {
      const isAct = card === triggerEl;
      card.classList.toggle('active', isAct);
      card.setAttribute('aria-pressed', String(isAct));
    });

    const container = document.getElementById('category-form');
    if (!container) return;

    const CT = window.CineTicket;
    const titles = {
      booking: 'Booking & Refund Support',
      technical: 'Technical Issue Report',
      account: 'Account Assistance',
      feedback: 'Guest Experience Feedback',
    };

    container.classList.remove('is-hidden');
    container.innerHTML =
      '<h4>' + CT.escapeHtml(titles[category] || 'Support Inquiry') + '</h4>' +
      '<div class="form-group"><label for="cat-email-input">Contact Email</label><input type="email" id="cat-email-input" class="cat-email" placeholder="your.email@example.com"></div>' +
      '<div class="form-group"><label for="cat-details-input">Details</label><textarea id="cat-details-input" class="cat-details" rows="3" placeholder="Share relevant booking ID or details..."></textarea></div>' +
      '<button type="button" class="send-email-btn submit-category-form">Submit Request</button>';

    container.querySelector('.submit-category-form').addEventListener('click', function () {
      const email = container.querySelector('.cat-email').value.trim();
      const details = container.querySelector('.cat-details').value.trim();
      if (!CT.isValidEmail(email) || !details) {
        window.showToast('Please provide a valid email and inquiry details', 'warning');
        return;
      }
      window.showToast('Request received! Our team will follow up shortly.', 'success');
      container.classList.add('is-hidden');
    });
  }

  function clickLiveChat() {
    const dialog = document.getElementById('chat-dialog');
    if (dialog) {
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
      return 'You can cancel any reserved seat directly from the Tickets page in the top navigation bar.';
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
        const modal = btn.closest('.contact-modal');
        if (modal) modal.style.display = 'none';
      });
    });

    document.querySelectorAll('.contact-modal').forEach(function (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.style.display = 'none';
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
        window.showToast('Please enter your phone number', 'warning');
        phoneInput?.focus();
        return;
      }

      const slot = timeSelect ? timeSelect.value : 'next available window';
      window.showToast('Callback scheduled (' + slot + ') for ' + phone, 'success');
      if (phoneInput) phoneInput.value = '';
      if (timeSelect) timeSelect.selectedIndex = 0;
    });

    document.querySelectorAll('.email-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        const targetId = tab.getAttribute('data-tab');
        document.querySelectorAll('.email-tab').forEach(function (t) {
          const act = t === tab;
          t.classList.toggle('active', act);
          t.setAttribute('aria-selected', String(act));
        });
        document.querySelectorAll('.email-tab-content').forEach(function (c) {
          c.classList.toggle('active', c.id === targetId);
        });
      });
    });

    document.querySelector('.send-email-btn')?.addEventListener('click', function () {
      const category = document.querySelector('.support-category')?.value || '';
      const nameInput = document.getElementById('support-name-input');
      const emailInput = document.getElementById('support-email-input');
      const subjectInput = document.getElementById('support-subject-input');
      const messageInput = document.getElementById('support-message-input');

      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const subject = subjectInput ? subjectInput.value.trim() : '';
      const message = messageInput ? messageInput.value.trim() : '';

      if (!category || category === 'Select your inquiry type') {
        window.showToast('Please select an inquiry type', 'warning');
        return;
      }
      if (!name || !CT.isValidEmail(email)) {
        window.showToast('Please enter your name and a valid email address', 'warning');
        return;
      }
      if (!subject || !message) {
        window.showToast('Please enter both a subject and message', 'warning');
        return;
      }

      window.showToast('Support ticket submitted! We will reply within 24 hours.', 'success');
      nameInput.value = '';
      emailInput.value = '';
      subjectInput.value = '';
      messageInput.value = '';
      const modal = document.getElementById('email-modal');
      if (modal) modal.style.display = 'none';
    });

    const chatDialog = document.getElementById('chat-dialog');
    if (chatDialog) {
      chatDialog.querySelector('.close-chat')?.addEventListener('click', function () {
        chatDialog.style.display = 'none';
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