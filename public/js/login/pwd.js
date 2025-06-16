document.addEventListener('DOMContentLoaded', function() {
  const sendBtn = document.getElementById('send-code');
  let countdown = 0;
  
  sendBtn.addEventListener('click', function() {
    if(countdown > 0) return;
    
    // Send verification code logic
    const email = document.getElementById('email').value;
    if(!email) {
      alert('Please enter your email first');
      return;
    }
    
    // Start 60-second countdown
    countdown = 60;
    sendBtn.disabled = true;
    sendBtn.textContent = `${countdown}s`;
    
    const timer = setInterval(() => {
      countdown--;
      sendBtn.textContent = `${countdown}s`;
      
      if(countdown <= 0) {
        clearInterval(timer);
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Code';
      }
    }, 1000);
    
    // Add actual verification code sending API call here
    // fetch('/api/send-verification', { method: 'POST', body: JSON.stringify({ email }) })
    //   .then(response => response.json())

  });
});


function resetPwd(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const verificationCode = document.getElementById('Verification').value;
    const password = document.getElementById('password').value;
    
    // Parameter validation
    if (!email || !verificationCode || !password) {
        alert('Please fill in all required fields');
        return;
    }
    
    // Send request
    fetch('/index.php/user/user/changePassword', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: email,
            pwd: password,
            verification_code: verificationCode
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Password reset successful');
            window.location.href = 'login.html';
        } else {
            alert('Password reset failed: ' + (data.message || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Request failed, please try again later');
    });
}