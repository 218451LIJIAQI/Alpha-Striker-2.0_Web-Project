function showPage(pageId){
  if (pageId === 'login-page') {
    document.getElementById('login-page').style.display = 'block';
    document.getElementById('register-page').style.display = 'none';
  } else if (pageId === 'register-page') {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('register-page').style.display = 'block';
  } else {
    // Navigate to homepage when no specific page is specified
    window.location.href = "pages/homepage.html";
  }
}

/**
 * Handle user login
 * @param {Event} event - Form submission event
 */
function loginUser(event) {
  event.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  localStorage.setItem('email', email);
      // Security: Never store passwords in localStorage
    // localStorage.setItem('pwd', password);
  if (email && password) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/index.php/user/user/login', true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          if (response.success) {
            localStorage.setItem('userToken', 'user_authenticated');
            localStorage.setItem('userId', response.data.user_id); 
            localStorage.setItem('userName', response.data.user_name);
            localStorage.setItem('userEmail', response.data.email);
            window.location.href = 'pages/homepage.html';
          } else {
            alert(response.message || 'Login failed');
          }
        } else {
          alert('Request failed, please try again later');
        }
      }
    };

    xhr.send(JSON.stringify({
      email: email,
      password: password
    }));
  } else {
    alert('Please enter valid email and password');
  }
}

/**
 * Handle user registration
 * @param {Event} event - Form submission event
 */
function registerUser(event) {
  event.preventDefault();
  
  // Get registration form data
  const name = document.getElementById('name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  
  // Verify password match
  if (password !== confirmPassword) {
    alert('The two passwords entered do not match');
    return;
  }
  
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/index.php/user/user/reg', true);
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4 && xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      if (response.success) {
        // Registration successful, store user info and redirect
        localStorage.setItem('userToken', 'user_registered');
        localStorage.setItem('userId', response.data.user_id); 
        localStorage.setItem('userName', name);
        localStorage.setItem('userEmail', email);
        window.location.href = 'pages/homepage.html';
      } else {
        // Registration failed, show error message
        alert(response.message || 'Registration failed, please try again later');
      }
    }
  };

  // Send request data
  const data = JSON.stringify({
    name: name,
    email: email,
    password: password
  });
  xhr.send(data);
  
  // // Create user account (simulation)
  // localStorage.setItem('userToken', 'user_registered');
  // localStorage.setItem('userName', name);
  // localStorage.setItem('userEmail', email);
  
  // // Redirect to homepage
  // window.location.href = 'pages/homepage.html';
}