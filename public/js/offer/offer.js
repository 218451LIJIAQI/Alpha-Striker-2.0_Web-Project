document.addEventListener('DOMContentLoaded', function() {
    // Initialize loading all offers
    fetchOffers();
    
    // Bind filter button events
    document.querySelectorAll('.filter-tabs button').forEach(button => {
        button.addEventListener('click', function() {
            // Update button active state
            document.querySelectorAll('.filter-tabs button').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            // Get offer_type and load offers
            const offer_type = this.textContent === 'All Offers' ? '' : this.textContent;
            fetchOffers(offer_type);
        });
    });

    // Initialize newsletter subscription
    initNewsletterSubscription();
});

// Initialize newsletter subscription functionality
function initNewsletterSubscription() {
    const newsletterForm = document.querySelector('.newsletter-form');
    if (!newsletterForm) return;

    newsletterForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const emailInput = this.querySelector('input[type="email"]');
        const submitButton = this.querySelector('button[type="submit"]');
        const email = emailInput.value.trim();
        
        // Validate email
        if (!email) {
            showToast('Please enter your email address', 'warning');
            emailInput.focus();
            return;
        }
        
        if (!isValidEmail(email)) {
            showToast('Please enter a valid email address', 'error');
            emailInput.focus();
            return;
        }
        
        // Show loading state
        const originalButtonText = submitButton.textContent;
        submitButton.textContent = 'Subscribing...';
        submitButton.disabled = true;
        
        // Simulate subscription process (replace with actual API call)
        setTimeout(() => {
            // Reset button state
            submitButton.textContent = originalButtonText;
            submitButton.disabled = false;
            
            // Clear input
            emailInput.value = '';
            
            // Show success message
            showToast(`Successfully subscribed! Welcome to our newsletter, ${email.split('@')[0]}!`, 'success');
            
            // Optional: Add some visual feedback to the form
            const newsletter = document.querySelector('.newsletter');
            newsletter.style.animation = 'pulse 0.6s ease-in-out';
            setTimeout(() => {
                newsletter.style.animation = '';
            }, 600);
            
        }, 1500); // Simulate API call delay
    });
}

// Email validation function
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Get offer data
function fetchOffers(offer_type = '') {
    let url = '/index.php/offer/offer/getOfferList';
    if(offer_type) {
        url += `?offer_type=${encodeURIComponent(offer_type)}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if(data.success) {
                renderOffers(data.data);
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Render offer list
function renderOffers(offers) {
    const featuredContainer = document.querySelector('.featured-offers .offers-container');
    const moreContainer = document.querySelector('section:nth-of-type(2) .offers-container');
    
    featuredContainer.innerHTML = '';
    moreContainer.innerHTML = '';
    
    // Divide offers into featured and other categories
    const featuredOffers = offers.slice(0, 3);
    const moreOffers = offers.slice(3);
    
    featuredOffers.forEach(offer => {
        featuredContainer.appendChild(createOfferCard(offer));
    });
    
    moreOffers.forEach(offer => {
        moreContainer.appendChild(createOfferCard(offer));
    });
}

// Generate random validity text for offers
function generateRandomValidityText() {
    const validityOptions = [
        'Expires in 2 days',
        'Expires in 3 days', 
        'Expires in 5 days',
        'Expires in 7 days',
        'Expires in 10 days',
        'Expires in 2 weeks',
        'Valid for 3 days only',
        'Valid for 5 days only',
        'Valid for 1 week only',
        'Limited time - 4 days left',
        'Limited time - 6 days left',
        'Ends in 3 days',
        'Ends in 5 days',
        'Ends in 1 week',
        'Available for 2 more days',
        'Available for 4 more days',
        'Last 3 days to claim',
        'Last 5 days to claim',
        'Hurry! 2 days remaining',
        'Hurry! 4 days remaining'
    ];
    
    const randomIndex = Math.floor(Math.random() * validityOptions.length);
    return validityOptions[randomIndex];
}

// Create offer card
function createOfferCard(offer) {
    const card = document.createElement('div');
    card.className = 'offer-card';
    
    // Add special style classes based on offer_type
    if(offer.offer_type === 'Student Deals') {
        card.classList.add('offer-special-student');
    } else if(offer.offer_type === 'Weekday Specials') {
        card.classList.add('offer-special-wednesday');
    }
    
    card.innerHTML = `
        <span class="offer-badge ${offer.badge.toLowerCase().replace(' ', '-')}">${offer.badge}</span>
        <div class="offer-image">
            <img src="${offer.img}" alt="${offer.offer_title}">
        </div>
        <div class="offer-content">
            <h3 class="offer-title">${offer.offer_title}</h3>
            <p class="offer-description">${offer.offer_description}</p>
            <div class="promo-code">
                ${offer.promo_code}
                <button class="copy-code">COPY</button>
            </div>
            <div class="offer-validity">
                <span>📅</span>
                <span>${generateRandomValidityText()}</span>
            </div>
            <a href="#" class="claim-offer">Claim Offer</a>
            <a href="#" class="terms-link">Terms & Conditions</a>
        </div>
    `;
    
    // Add copy functionality
    const claimOffer = card.querySelector('.claim-offer');
    claimOffer.addEventListener('click', function(e) {
        e.preventDefault(); // Prevent default anchor behavior to avoid scrolling to top
        
        // Store current scroll position
        const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        
        // Show success message with toast instead of alert
        showToast('🎉 Offer claimed successfully! Check your email for details.', 'success');
        
        // Ensure scroll position remains the same
        window.scrollTo(0, currentScrollPosition);
        
        // Optional: Add visual feedback to the button
        const originalText = e.target.textContent;
        e.target.textContent = 'Claimed!';
        e.target.style.background = '#4caf50';
        e.target.style.color = 'white';
        
        // Reset button after 3 seconds
        setTimeout(() => {
            e.target.textContent = originalText;
            e.target.style.background = '';
            e.target.style.color = '';
        }, 3000);
    });

    // Handle Terms & Conditions link
    const termsLink = card.querySelector('.terms-link');
    termsLink.addEventListener('click', function(e) {
        e.preventDefault(); // Prevent default anchor behavior
        
        // Store current scroll position
        const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        
        // Show terms & conditions (you can customize this)
        showToast('📄 Terms & Conditions: This offer is subject to availability and standard cinema policies.', 'info');
        
        // Ensure scroll position remains the same
        window.scrollTo(0, currentScrollPosition);
    });

    const copyBtn = card.querySelector('.copy-code');
    
    copyBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Try modern clipboard API first
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(offer.promo_code)
                .then(() => {
                    showCopySuccess(copyBtn, offer.promo_code);
                })
                .catch(err => {
                    console.error('Failed to copy with clipboard API: ', err);
                    fallbackCopy(offer.promo_code, copyBtn);
                });
        } else {
            // Fallback for older browsers or non-secure contexts
            fallbackCopy(offer.promo_code, copyBtn);
        }
    });
    
    return card;
}

// Show copy success feedback
function showCopySuccess(button, code) {
    const originalText = button.textContent;
    button.textContent = 'COPIED!';
    button.style.background = '#4caf50';
    button.style.color = 'white';
    
    // Show toast notification
    showToast(`Promo code "${code}" copied to clipboard!`, 'success');
    
    // Reset button after 2 seconds
    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '';
        button.style.color = '';
    }, 2000);
}

// Fallback copy method for older browsers
function fallbackCopy(text, button) {
    // Create temporary textarea
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopySuccess(button, text);
        } else {
            showToast('Failed to copy promo code. Please copy manually.', 'error');
        }
    } catch (err) {
        console.error('Fallback copy failed: ', err);
        showToast('Copy not supported. Please copy manually: ' + text, 'warning');
    } finally {
        document.body.removeChild(textArea);
    }
}

// Toast notification system
function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas ${getToastIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    // Add styles if not exists
    if (!document.getElementById('toast-styles')) {
        const styles = document.createElement('style');
        styles.id = 'toast-styles';
        styles.textContent = `
            .toast-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                z-index: 10000;
                animation: slideInRight 0.3s ease-out;
                max-width: 350px;
                border-left: 4px solid #4361ee;
                display: flex;
                align-items: center;
                padding: 16px;
                gap: 12px;
            }
            .toast-notification.toast-success {
                border-left-color: #4caf50;
            }
            .toast-notification.toast-error {
                border-left-color: #f44336;
            }
            .toast-notification.toast-warning {
                border-left-color: #ff9800;
            }
            .toast-content {
                display: flex;
                align-items: center;
                gap: 12px;
                flex: 1;
            }
            .toast-content i {
                width: 20px;
                height: 20px;
            }
            .toast-notification.toast-success i {
                color: #4caf50;
            }
            .toast-notification.toast-error i {
                color: #f44336;
            }
            .toast-notification.toast-warning i {
                color: #ff9800;
            }
            .toast-notification.toast-info i {
                color: #4361ee;
            }
            .toast-close {
                background: none;
                border: none;
                font-size: 18px;
                color: #999;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            @keyframes slideInRight {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(styles);
    }
    
    document.body.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 4000);
}

// Get appropriate icon for toast type
function getToastIcon(type) {
    switch (type) {
        case 'success':
            return 'fa-check-circle';
        case 'error':
            return 'fa-exclamation-circle';
        case 'warning':
            return 'fa-exclamation-triangle';
        default:
            return 'fa-info-circle';
    }
}