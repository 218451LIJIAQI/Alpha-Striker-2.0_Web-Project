document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const movieCode = urlParams.get('movie_code');
    const date = urlParams.get('date');
    const time = urlParams.get('time');
    const seats = urlParams.get('seats').split(',');

    let subtotal = 0;
    let discount = 0;
    const taxAmount = 2.50;

    // Initialize payment method handling
    initPaymentMethods();
    initCardForm();
    initPromoCode();
    
    // Get movie information
    fetch(`/index.php/movie/movies/getMovieByCode?movie_code=${movieCode}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayMovieInfo(data.data);
                subtotal = data.data.money * seats.length;
                updatePriceDisplay();
            }
        })
        .catch(error => {
            console.error('Error fetching movie data:', error);
        });

    // Display booking information
    document.getElementById('booking-date').textContent = date;
    document.getElementById('booking-time').textContent = time;
    document.getElementById('booking-seats').textContent = seats.join(', ');

    // Payment button click event
    document.querySelector('.pay-now-btn').addEventListener('click', function() {
        const selectedPaymentMethod = document.querySelector('input[name="payment"]:checked').value;
        
        if (selectedPaymentMethod === 'card') {
            if (!validateCardForm()) {
                return;
            }
        }
        
        // Show loading state
        const btn = this;
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        btn.disabled = true;
        
        // Save seat information
        fetch('/index.php/movie/seat/saveSeats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                movie_code: movieCode,
                date: date,
                time: time,
                seat_nums: seats,
                user_code: localStorage.getItem('userId') || 0,
                payment_method: selectedPaymentMethod,
                total_amount: calculateTotal()
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Redirect after successful save
                window.location.href = 'paysuccess.html';
            } else {
                alert('Payment failed: ' + (data.message || 'Unknown error'));
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        })
        .catch(error => {
            console.error('Error processing payment:', error);
            alert('Error occurred while processing payment');
            btn.innerHTML = originalContent;
            btn.disabled = false;
        });
    });

    function displayMovieInfo(movieData) {
        document.getElementById('movie-info').innerHTML = `
            <div class="movie-info">
                <img src="${movieData.img}" alt="${movieData.movie_name}" class="movie-poster">
                <div class="movie-details">
                    <h3>${movieData.movie_name}</h3>
                    <div class="movie-meta">
                        <div class="meta-item"><i class="fas fa-film"></i> ${movieData.movie_type}</div>
                        <div class="meta-item"><i class="fas fa-clock"></i> ${movieData.times}</div>
                        <div class="meta-item"><i class="fas fa-star"></i> Rating: ${movieData.rating || 'PG-13'}</div>
                    </div>
                </div>
            </div>
        `;
    }

    function initPaymentMethods() {
        const paymentCards = document.querySelectorAll('.payment-method-card');
        const cardForm = document.getElementById('card-form');
        
        paymentCards.forEach(card => {
            card.addEventListener('click', function() {
                // Remove active class from all cards
                paymentCards.forEach(c => c.classList.remove('active'));
                
                // Add active class to clicked card
                this.classList.add('active');
                
                // Update radio button
                const radio = this.querySelector('input[type="radio"]');
                radio.checked = true;
                
                // Show/hide card form
                if (radio.value === 'card') {
                    cardForm.style.display = 'block';
                    cardForm.style.animation = 'fadeInUp 0.3s ease forwards';
                } else {
                    cardForm.style.display = 'none';
                }
            });
        });
    }

    function initCardForm() {
        const cardNumberInput = document.getElementById('card-number');
        const expiryInput = document.getElementById('expiry');
        const cvvInput = document.getElementById('cvv');

        // Format card number input
        cardNumberInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\s/g, '').replace(/[^0-9]/gi, '');
            let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formattedValue;
        });

        // Format expiry input
        expiryInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.substring(0, 2) + '/' + value.substring(2, 4);
            }
            e.target.value = value;
        });

        // CVV input validation
        cvvInput.addEventListener('input', function(e) {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    }

    function initPromoCode() {
        const promoTags = document.querySelectorAll('.promo-tag');
        const couponInput = document.getElementById('coupon-code');
        const verifyBtn = document.getElementById('verify-coupon');

        // Handle promo tag clicks
        promoTags.forEach(tag => {
            tag.addEventListener('click', function() {
                couponInput.value = this.textContent;
                couponInput.focus();
            });
        });

        // Coupon verification
        verifyBtn.addEventListener('click', function() {
            const couponCode = couponInput.value.trim();
            if (!couponCode) {
                showAlert('Please enter a promo code', 'warning');
                return;
            }

            // Show loading state
            const originalContent = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
            this.disabled = true;

            fetch(`/index.php/offer/offer/getMoneyByBadge?badge=${couponCode}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        discount = parseFloat(data.data.money);
                        document.getElementById('discount-row').style.display = 'flex';
                        document.getElementById('discount-amount').textContent = `-$${discount.toFixed(2)}`;
                        updatePriceDisplay();
                        showAlert('Promo code applied successfully!', 'success');
                        couponInput.style.borderColor = 'var(--success)';
                    } else {
                        discount = 0;
                        document.getElementById('discount-row').style.display = 'none';
                        updatePriceDisplay();
                        showAlert('Invalid promo code: ' + (data.message || ''), 'error');
                        couponInput.style.borderColor = 'var(--error)';
                    }
                })
                .catch(error => {
                    console.error('Error verifying coupon:', error);
                    showAlert('Error occurred while verifying promo code', 'error');
                })
                .finally(() => {
                    this.innerHTML = originalContent;
                    this.disabled = false;
                });
        });
    }

    function validateCardForm() {
        const cardNumber = document.getElementById('card-number').value.replace(/\s/g, '');
        const expiry = document.getElementById('expiry').value;
        const cvv = document.getElementById('cvv').value;
        const cardholderName = document.getElementById('cardholder-name').value.trim();

        if (cardNumber.length < 13 || cardNumber.length > 19) {
            showAlert('Please enter a valid card number', 'error');
            return false;
        }

        if (!expiry.match(/^\d{2}\/\d{2}$/)) {
            showAlert('Please enter a valid expiry date (MM/YY)', 'error');
            return false;
        }

        if (cvv.length < 3 || cvv.length > 4) {
            showAlert('Please enter a valid CVV', 'error');
            return false;
        }

        if (!cardholderName) {
            showAlert('Please enter the cardholder name', 'error');
            return false;
        }

        return true;
    }

    function updatePriceDisplay() {
        const total = calculateTotal();
        
        document.getElementById('total-price').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('amount-due').textContent = `$${total.toFixed(2)}`;
        document.getElementById('final-amount').textContent = `$${total.toFixed(2)}`;
        
        // Update button text with amount
        const payBtn = document.querySelector('.pay-now-btn');
        const lockIcon = payBtn.querySelector('.fas.fa-lock');
        const secureText = payBtn.querySelector('span:first-of-type');
        const amountSpan = payBtn.querySelector('#final-amount');
        
        if (lockIcon && secureText && amountSpan) {
            // Button structure is already correct, just update amount
            amountSpan.textContent = `$${total.toFixed(2)}`;
        }
    }

    function calculateTotal() {
        return Math.max(0, subtotal - discount + taxAmount);
    }

    function showAlert(message, type = 'info') {
        // Create alert element
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.innerHTML = `
            <div class="alert-content">
                <i class="fas ${getAlertIcon(type)}"></i>
                <span>${message}</span>
            </div>
        `;
        
        // Style the alert
        Object.assign(alert.style, {
            position: 'fixed',
            top: '100px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '10px',
            color: 'white',
            fontWeight: '600',
            zIndex: '10000',
            minWidth: '300px',
            opacity: '0',
            transform: 'translateX(100%)',
            transition: 'all 0.3s ease',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)'
        });

        // Set background color based on type
        const colors = {
            success: 'var(--success)',
            error: 'var(--error)',
            warning: 'var(--warning)',
            info: 'var(--primary)'
        };
        alert.style.background = colors[type] || colors.info;

        // Add to DOM and animate in
        document.body.appendChild(alert);
        setTimeout(() => {
            alert.style.opacity = '1';
            alert.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 4 seconds
        setTimeout(() => {
            alert.style.opacity = '0';
            alert.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.parentNode.removeChild(alert);
                }
            }, 300);
        }, 4000);
    }

    function getAlertIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    }
});