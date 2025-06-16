document.addEventListener('DOMContentLoaded', function() {
    // Display loading animation
    const loading = document.querySelector('.payment-loading');
    const success = document.querySelector('.payment-success');
    
    // Switch display after 5 seconds
    setTimeout(function() {
        loading.style.display = 'none';
        success.style.display = 'block';
    }, 5000);
});