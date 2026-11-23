/**
 * About Page, Support Modals & Live Chat Assistant Controller
 */
document.addEventListener('DOMContentLoaded', function () {
  initContactModals();
  initCallbackScheduler();
  initEmailSupportForms();
  initLiveChat();
});

function initContactModals() {
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
}

function makeCall(phoneNumber) {
  window.location.href = 'tel:' + encodeURIComponent(phoneNumber);
  window.showToast('Dialing ' + phoneNumber + '...', 'info');
}

function openEmail(emailAddress) {
  window.location.href = 'mailto:' + encodeURIComponent(emailAddress);
  window.showToast('Opening mail client for ' + emailAddress, 'info');
}

function initCallbackScheduler() {
  const callbackBtn = document.querySelector('.callback-btn');
  if (!callbackBtn) return;

  callbackBtn.addEventListener('click', function () {
    const phoneInput = document.querySelector('.callback-input');
    const timeSelect = document.querySelector('.callback-time');
    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!phone) {
      window.showToast('Please enter your phone number', 'warning');
      return;
    }

    const slot = timeSelect ? timeSelect.value : 'next available window';
    window.showToast('Callback scheduled (' + slot + ') for ' + phone, 'success');
    if (phoneInput) phoneInput.value = '';
    if (timeSelect) timeSelect.selectedIndex = 0;
  });
}

function initEmailSupportForms() {
  document.querySelectorAll('.email-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      const targetId = tab.getAttribute('data-tab');
      document.querySelectorAll('.email-tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.email-tab-content').forEach(function (c) { c.classList.remove('active'); });
      tab.classList.add('active');
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');
    });
  });

  const sendBtn = document.querySelector('.send-email-btn');
  if (!sendBtn) return;

  sendBtn.addEventListener('click', function () {
    const category = document.querySelector('.support-category')?.value || '';
    const nameInput = document.querySelector('input[placeholder="Enter your full name"]');
    const emailInput = document.querySelector('input[placeholder="your.email@example.com"]');
    const subjectInput = document.querySelector('input[placeholder="Brief description of your inquiry"]');
    const messageInput = document.querySelector('#quick-form textarea') || document.querySelector('textarea');

    const name = nameInput ? nameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const subject = subjectInput ? subjectInput.value.trim() : '';
    const message = messageInput ? messageInput.value.trim() : '';

    if (!category || category === 'Select your inquiry type') {
      window.showToast('Please select an inquiry type', 'warning');
      return;
    }
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.showToast('Please enter your name and a valid email address', 'warning');
      return;
    }
    if (!subject || !message) {
      window.showToast('Please enter both a subject and message', 'warning');
      return;
    }

    window.showToast('Support ticket submitted! We will reply within 24 hours.', 'success');
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (subjectInput) subjectInput.value = '';
    if (messageInput) messageInput.value = '';
    const modal = document.getElementById('email-modal');
    if (modal) modal.style.display = 'none';
  });
}

function selectCategory(category, triggerEl) {
  document.querySelectorAll('.category-card').forEach(function (card) {
    card.classList.remove('active');
  });
  const activeTarget = triggerEl || (typeof event !== 'undefined' ? event.currentTarget || event.target : null);
  const card = activeTarget && activeTarget.closest ? activeTarget.closest('.category-card') : null;
  if (card) card.classList.add('active');

  const container = document.getElementById('category-form');
  if (!container) return;

  const titles = {
    booking: 'Booking & Refund Support',
    technical: 'Technical Issue Report',
    account: 'Account Assistance',
    feedback: 'Guest Experience Feedback',
  };
  const heading = titles[category] || 'Support Inquiry';

  container.style.display = 'block';
  container.innerHTML =
    '<h4>' + window.CineTicket.escapeHtml(heading) + '</h4>' +
    '<div class="form-group"><label>Contact Email</label><input type="email" class="cat-email" placeholder="your.email@example.com"></div>' +
    '<div class="form-group"><label>Details</label><textarea class="cat-details" rows="3" placeholder="Share relevant booking ID or details..."></textarea></div>' +
    '<button type="button" class="submit-category-form">Submit Request</button>';

  container.querySelector('.submit-category-form').addEventListener('click', function () {
    const email = container.querySelector('.cat-email').value.trim();
    const details = container.querySelector('.cat-details').value.trim();
    if (!email || !details) {
      window.showToast('Please provide your email and inquiry details', 'warning');
      return;
    }
    window.showToast('Request received! Our team will follow up shortly.', 'success');
    container.style.display = 'none';
  });
}

function clickLiveChat() {
  const dialog = document.getElementById('chat-dialog');
  if (dialog) dialog.style.display = 'flex';
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

function initLiveChat() {
  const chatDialog = document.getElementById('chat-dialog');
  if (!chatDialog) return;

  const closeBtn = chatDialog.querySelector('.close-chat');
  const sendBtn = chatDialog.querySelector('.send-message');
  const input = document.getElementById('chat-input-field');

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      chatDialog.style.display = 'none';
    });
  }
  if (sendBtn) {
    sendBtn.addEventListener('click', sendChatMessage);
  }
  if (input) {
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage();
      }
    });
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
    appendChatBubble(messagesBox, buildSupportReply(text), 'agent');
  }, 450);
}

function appendChatBubble(container, message, role) {
  const esc = window.CineTicket.escapeHtml;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = role === 'user' ? 'message user-message' : 'message agent-message';
  div.innerHTML =
    '<div class="message-content">' + esc(message) + '</div>' +
    '<div class="message-time">' + esc(now) + '</div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function buildSupportReply(query) {
  const q = query.toLowerCase();
  if (q.includes('cancel') || q.includes('refund')) {
    return 'You can cancel any reserved seat directly from the Tickets page in the top navigation bar.';
  }
  if (q.includes('promo') || q.includes('discount') || q.includes('offer')) {
    return 'Try STUDENT30, WEDNESDAYSIP, or FAMILY4FUN at checkout for $5.00 off, or book 5+ seats for 30% group savings!';
  }
  if (q.includes('theater') || q.includes('showtime')) {
    return 'Visit the Theaters tab to explore all 6 partner locations, amenities, and daily screening schedules.';
  }
  if (q.includes('booking') || q.includes('ticket')) {
    return 'Open the Tickets tab in the header to view your digital tickets, row/seat details, and PDF export.';
  }
  return 'Thanks for reaching out! For urgent booking inquiries, email lijiaqi0807@gmail.com or visit our Help Center.';
}