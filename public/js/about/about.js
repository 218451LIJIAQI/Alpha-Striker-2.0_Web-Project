document.addEventListener('DOMContentLoaded', function() {
    // Initialize all contact modals and functionality
    initializeContactModals();
    initializeLiveChat();
    initializeEmailForms();
    initializeCallFunctions();
    initializePartnerLogos();
});

// Initialize Contact Modals
function initializeContactModals() {
    // Close modal functionality
    document.querySelectorAll('.close-modal').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.contact-modal').style.display = 'none';
        });
    });

    // Close modal when clicking outside
    document.querySelectorAll('.contact-modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });
}

// Call Us Functions
function clickCallUs() {
    document.getElementById('call-modal').style.display = 'flex';
}

function makeCall(phoneNumber) {
    // Attempt to make a call (works on mobile devices)
    window.location.href = `tel:${phoneNumber}`;
    
    // Show confirmation message
    showNotification(`Calling ${phoneNumber}...`, 'success');
}

function initializeCallFunctions() {
    // Callback form functionality
    const callbackBtn = document.querySelector('.callback-btn');
    if (callbackBtn) {
        callbackBtn.addEventListener('click', function() {
            const phoneInput = document.querySelector('.callback-input');
            const timeSelect = document.querySelector('.callback-time');
            
            if (phoneInput.value.trim()) {
                showNotification(`Callback scheduled for ${timeSelect.value} at ${phoneInput.value}`, 'success');
                phoneInput.value = '';
                timeSelect.selectedIndex = 0;
            } else {
                showNotification('Please enter your phone number', 'error');
            }
        });
    }
}

// Email Us Functions
function clickEmailUs() {
    document.getElementById('email-modal').style.display = 'flex';
}

function initializeEmailForms() {
    // Email tab switching
    document.querySelectorAll('.email-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // Remove active class from all tabs and contents
            document.querySelectorAll('.email-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.email-tab-content').forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            this.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });

    // Quick contact form submission
    const sendEmailBtn = document.querySelector('.send-email-btn');
    if (sendEmailBtn) {
        sendEmailBtn.addEventListener('click', function() {
            const category = document.querySelector('.support-category').value;
            const name = document.querySelector('input[placeholder="Enter your full name"]').value;
            const email = document.querySelector('input[placeholder="your.email@example.com"]').value;
            const subject = document.querySelector('input[placeholder="Brief description of your inquiry"]').value;
            const message = document.querySelector('textarea').value;
            const priority = document.querySelector('input[name="priority"]:checked').value;

            if (validateEmailForm(category, name, email, subject, message)) {
                submitEmailForm({category, name, email, subject, message, priority});
            }
        });
    }
}

function validateEmailForm(category, name, email, subject, message) {
    if (category === 'Select your inquiry type') {
        showNotification('Please select an inquiry type', 'error');
        return false;
    }
    if (!name.trim()) {
        showNotification('Please enter your name', 'error');
        return false;
    }
    if (!email.trim() || !isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return false;
    }
    if (!subject.trim()) {
        showNotification('Please enter a subject', 'error');
        return false;
    }
    if (!message.trim()) {
        showNotification('Please enter your message', 'error');
        return false;
    }
    return true;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function submitEmailForm(formData) {
    // Show loading state
    const btn = document.querySelector('.send-email-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    btn.disabled = true;

    // Simulate email sending
    setTimeout(() => {
        showNotification('Your message has been sent successfully! We\'ll respond within 24 hours.', 'success');
        
        // Reset form
        document.querySelector('.support-category').selectedIndex = 0;
        document.querySelector('input[placeholder="Enter your full name"]').value = '';
        document.querySelector('input[placeholder="your.email@example.com"]').value = '';
        document.querySelector('input[placeholder="Brief description of your inquiry"]').value = '';
        document.querySelector('textarea').value = '';
        document.querySelector('input[name="priority"][value="low"]').checked = true;
        
        // Reset button
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        // Close modal after success
        setTimeout(() => {
            document.getElementById('email-modal').style.display = 'none';
        }, 2000);
    }, 2000);
}

function selectCategory(category) {
    // Remove active class from all category cards
    document.querySelectorAll('.category-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // Add active class to selected card
    event.target.closest('.category-card').classList.add('active');
    
    // Show category-specific form
    const categoryForm = document.getElementById('category-form');
    categoryForm.style.display = 'block';
    categoryForm.innerHTML = getCategoryFormContent(category);
}

function getCategoryFormContent(category) {
    const forms = {
        booking: `
            <h4><i class="fas fa-ticket-alt"></i> Booking Support Form</h4>
            <div class="form-group">
                <label>Booking Confirmation Number</label>
                <input type="text" placeholder="Enter your booking reference">
            </div>
            <div class="form-group">
                <label>Issue Type</label>
                <select>
                    <option>Select issue type</option>
                    <option>Cancellation Request</option>
                    <option>Seat Change</option>
                    <option>Show Time Change</option>
                    <option>Payment Issue</option>
                    <option>Missing Tickets</option>
                </select>
            </div>
            <div class="form-group">
                <label>Theater and Show Details</label>
                <textarea placeholder="Please provide theater name, movie title, date and time..." rows="3"></textarea>
            </div>
            <button class="submit-category-form">Submit Booking Support Request</button>
        `,
        technical: `
            <h4><i class="fas fa-bug"></i> Technical Support Form</h4>
            <div class="form-group">
                <label>Platform</label>
                <div class="platform-options">
                    <label><input type="checkbox" value="website"> Website</label>
                    <label><input type="checkbox" value="mobile-app"> Mobile App</label>
                    <label><input type="checkbox" value="payment"> Payment System</label>
                </div>
            </div>
            <div class="form-group">
                <label>Device Information</label>
                <input type="text" placeholder="e.g., iPhone 12, Chrome Browser, Windows 10">
            </div>
            <div class="form-group">
                <label>Error Description</label>
                <textarea placeholder="Please describe the technical issue in detail..." rows="4"></textarea>
            </div>
            <div class="form-group">
                <label>When did this occur?</label>
                <input type="datetime-local">
            </div>
            <button class="submit-category-form">Submit Technical Report</button>
        `,
        account: `
            <h4><i class="fas fa-user-cog"></i> Account Support Form</h4>
            <div class="form-group">
                <label>Account Email</label>
                <input type="email" placeholder="Email associated with your account">
            </div>
            <div class="form-group">
                <label>Issue Type</label>
                <select>
                    <option>Select account issue</option>
                    <option>Can't Login</option>
                    <option>Password Reset</option>
                    <option>Profile Update</option>
                    <option>Membership Questions</option>
                    <option>Account Deletion</option>
                </select>
            </div>
            <div class="form-group">
                <label>Additional Details</label>
                <textarea placeholder="Please provide any additional information..." rows="3"></textarea>
            </div>
            <button class="submit-category-form">Submit Account Support Request</button>
        `,
        feedback: `
            <h4><i class="fas fa-star"></i> Feedback Form</h4>
            <div class="form-group">
                <label>Feedback Type</label>
                <select>
                    <option>Select feedback type</option>
                    <option>Compliment</option>
                    <option>Suggestion</option>
                    <option>Complaint</option>
                    <option>Feature Request</option>
                </select>
            </div>
            <div class="form-group">
                <label>Overall Rating</label>
                <div class="feedback-rating">
                    <span class="rating-star" data-rating="1">⭐</span>
                    <span class="rating-star" data-rating="2">⭐</span>
                    <span class="rating-star" data-rating="3">⭐</span>
                    <span class="rating-star" data-rating="4">⭐</span>
                    <span class="rating-star" data-rating="5">⭐</span>
                </div>
            </div>
            <div class="form-group">
                <label>Your Feedback</label>
                <textarea placeholder="Please share your thoughts and feedback..." rows="4"></textarea>
            </div>
            <button class="submit-category-form">Submit Feedback</button>
        `
    };
    
    return forms[category] || '<p>Form not available</p>';
}

function openEmail(emailAddress) {
    window.location.href = `mailto:${emailAddress}`;
    showNotification(`Opening email client for ${emailAddress}`, 'info');
}

// Live Chat Functions
function clickLiveChat() {
    document.getElementById('chat-dialog').style.display = 'flex';
    
    // Reset chat if needed
    if (!document.querySelector('.chat-messages .user-message')) {
        initializeChatWelcome();
    }
}

function initializeLiveChat() {
    const chatDialog = document.getElementById('chat-dialog');
    const closeChat = document.querySelector('.close-chat');
    const sendBtn = document.querySelector('.send-message');
    const chatInput = document.getElementById('chat-input-field');
    const chatMessages = document.querySelector('.chat-messages');
    
    // Close chat dialog
    closeChat.addEventListener('click', function() {
        chatDialog.style.display = 'none';
        showSatisfactionRating();
    });
    
    // Send message functionality
    sendBtn.addEventListener('click', function() {
        sendChatMessage();
    });
    
    // Press Enter to send message
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    // Attach file functionality
    const attachBtn = document.querySelector('.attach-btn');
    if (attachBtn) {
        attachBtn.addEventListener('click', function() {
            showNotification('File attachment feature coming soon!', 'info');
        });
    }

    // Emoji functionality
    const emojiBtn = document.querySelector('.emoji-btn');
    if (emojiBtn) {
        emojiBtn.addEventListener('click', function() {
            showEmojiPicker();
        });
    }

    // Rating stars functionality
    document.querySelectorAll('.rating-stars i').forEach(star => {
        star.addEventListener('click', function() {
            const rating = this.getAttribute('data-rating');
            submitRating(rating);
        });
    });
}

function initializeChatWelcome() {
    // Add some delay to make it feel more natural
    setTimeout(() => {
        addBotMessage("I'm here to help you with any questions about movie bookings, theater information, or technical issues. What would you like assistance with today?");
    }, 1000);
}

function sendChatMessage() {
    const chatInput = document.getElementById('chat-input-field');
    const message = chatInput.value.trim();
    
    if (message) {
        addUserMessage(message);
        chatInput.value = '';
        
        // Hide quick actions after first user message
        const quickActions = document.querySelector('.quick-actions');
        if (quickActions) {
            quickActions.style.display = 'none';
        }
        
        // Show typing indicator
        showTypingIndicator();
        
        // Generate bot response
        setTimeout(() => {
            hideTypingIndicator();
            const response = generateBotResponse(message);
            addBotMessage(response);
        }, 1500 + Math.random() * 1000); // Random delay between 1.5-2.5 seconds
    }
}

function addUserMessage(message) {
    const chatMessages = document.querySelector('.chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message user-message';
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-text">${message}</div>
            <div class="message-time">${getCurrentTime()}</div>
        </div>
        <div class="message-avatar">
            <i class="fas fa-user"></i>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function addBotMessage(message) {
    const chatMessages = document.querySelector('.chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message bot-message';
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="message-text">${message}</div>
            <div class="message-time">${getCurrentTime()}</div>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function selectQuickAction(action) {
    const actions = {
        booking: "I need help with my booking",
        refund: "I would like to request a refund",
        technical: "I'm experiencing technical difficulties",
        theaters: "Can you help me find theaters near me?"
    };
    
    const message = actions[action];
    if (message) {
        addUserMessage(message);
        
        // Hide quick actions
        document.querySelector('.quick-actions').style.display = 'none';
        
        // Show typing and respond
        showTypingIndicator();
        setTimeout(() => {
            hideTypingIndicator();
            const response = generateBotResponse(message);
            addBotMessage(response);
        }, 1500);
    }
}

function generateBotResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    
    // Booking related responses
    if (lowerMessage.includes('booking') || lowerMessage.includes('reservation')) {
        return "I'd be happy to help with your booking! Could you please provide your booking confirmation number? I can help you with cancellations, changes, or if you're having trouble finding your tickets.";
    }
    
    // Refund related responses
    if (lowerMessage.includes('refund') || lowerMessage.includes('cancel') || lowerMessage.includes('money back')) {
        return "I understand you'd like to request a refund. Our refund policy allows cancellations up to 2 hours before showtime. Please provide your booking confirmation number and I'll process this for you right away.";
    }
    
    // Technical issues
    if (lowerMessage.includes('technical') || lowerMessage.includes('error') || lowerMessage.includes('problem') || lowerMessage.includes('not working')) {
        return "Sorry to hear you're experiencing technical difficulties! Can you tell me which device and browser you're using? Also, what specifically isn't working - is it the website, mobile app, or payment process?";
    }
    
    // Theater information
    if (lowerMessage.includes('theater') || lowerMessage.includes('cinema') || lowerMessage.includes('location')) {
        return "I can help you find theaters! What city or zip code are you looking for? I can show you nearby theaters, showtimes, and available amenities like IMAX or VIP seating.";
    }
    
    // Payment issues
    if (lowerMessage.includes('payment') || lowerMessage.includes('credit card') || lowerMessage.includes('charged')) {
        return "I can help with payment issues. Are you having trouble completing a payment, or do you see an unexpected charge? Please describe the issue and I'll connect you with our payment support team.";
    }
    
    // Account issues
    if (lowerMessage.includes('account') || lowerMessage.includes('login') || lowerMessage.includes('password')) {
        return "For account issues, I can help you reset your password or update your profile information. What specific account issue are you experiencing?";
    }
    
    // General greetings
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
        return "Hello! Welcome to Alpha Striker 2.0 support. I'm here to help you with bookings, technical issues, theater information, and more. What can I assist you with today?";
    }
    
    // Default response
    return "Thank you for your message! I want to make sure I provide you with the most accurate assistance. Could you please provide a bit more detail about what you need help with? I can assist with bookings, refunds, technical issues, theater locations, and more.";
}

function showTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'flex';
        scrollToBottom();
    }
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function scrollToBottom() {
    const chatMessages = document.querySelector('.chat-messages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function showSatisfactionRating() {
    // Only show if user has sent at least one message
    const userMessages = document.querySelectorAll('.user-message');
    if (userMessages.length > 0) {
        const ratingDiv = document.getElementById('satisfaction-rating');
        if (ratingDiv) {
            ratingDiv.style.display = 'flex';
        }
    }
}

function submitRating(rating) {
    showNotification(`Thank you for rating us ${rating} stars! Your feedback helps us improve.`, 'success');
    const ratingDiv = document.getElementById('satisfaction-rating');
    if (ratingDiv) {
        ratingDiv.style.display = 'none';
    }
}

function showEmojiPicker() {
    const emojis = ['😊', '😢', '😡', '😍', '🤔', '👍', '👎', '❤️', '😂', '😭'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    const chatInput = document.getElementById('chat-input-field');
    chatInput.value += randomEmoji;
    chatInput.focus();
}

// Utility function for notifications
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close">&times;</button>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
    
    // Close button functionality
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    });
}

function getNotificationIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Partner Logos Functionality
function initializePartnerLogos() {
    const partnerLogos = document.querySelectorAll('.partner-logo');
    
    partnerLogos.forEach(logo => {
        // Add click tracking
        logo.addEventListener('click', function(e) {
            const partnerName = this.getAttribute('data-partner');
            const partnerUrl = this.querySelector('a').href;
            const partnerTooltip = this.getAttribute('data-tooltip');
            
            // Track the click
            trackPartnerClick(partnerName, partnerUrl);
            
            // Show notification
            showNotification(`Redirecting to ${partnerTooltip.replace('Visit ', '')}...`, 'info');
            
            // Add visual feedback
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 200);
        });
        
        // Add enhanced hover effects
        logo.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px) scale(1.05)';
        });
        
        logo.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
    });
}

function trackPartnerClick(partnerName, partnerUrl) {
    // Log the click for analytics
    
    
    // You can send this data to analytics service
    // Example: Google Analytics, or your own tracking API
    if (typeof gtag !== 'undefined') {
        gtag('event', 'partner_click', {
            'partner_name': partnerName,
            'partner_url': partnerUrl,
            'page_location': window.location.href
        });
    }
    
    // You could also send to your own API
    // fetch('/api/track-partner-click', {
    //     method: 'POST',
    //     body: JSON.stringify({
    //         partner: partnerName,
    //         url: partnerUrl,
    //         timestamp: new Date().toISOString()
    //     })
    // });
}