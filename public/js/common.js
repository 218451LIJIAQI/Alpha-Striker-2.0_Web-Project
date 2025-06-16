/**
 * Common JavaScript functions
 */

// Global JavaScript functionality for all pages

// Load dark mode injector immediately
(function() {
  const script = document.createElement('script');
  script.src = (window.location.pathname.includes('/pages/') || window.location.pathname.includes('/admin/')) 
    ? '../js/dark-mode-injector.js' 
    : 'js/dark-mode-injector.js';
  script.async = false;
  document.head.appendChild(script);
})();

// Get current page path
function getCurrentPath() {
  // Get current path
  const path = window.location.pathname;
  
  // Check if in pages directory
  if (path.includes('/pages/')) {
    return './';  // If in pages directory, use current directory
  } else {
    return './pages/';  // Otherwise, use pages directory
  }
}

// Verify user login status
function checkLoginStatus() {
    // Check if userToken exists in localStorage indicating user is logged in
    const userToken = localStorage.getItem("userToken");
    
    if (!userToken) {
        return false;
    } else {
        return true;
    }
}

// Common function for handling click events
function setupEventListeners() {
    // Set up various event listeners
    // For example, navigation menu click events, etc.
}


function clickEmailUs(){
  const popup = document.createElement('div');
  popup.className = 'contact-popup';
  popup.innerHTML = `
      <div class="contact-popup-content">
          <div class="contact-popup-header">
              <h3>Email</h3>
              <button class="close-btn">&times;</button>
          </div>
          <div class="contact-popup-body">
              <p><i class="fas fa-envelope"></i> lijiaqi0807@gmail.com</p>
          </div>
      </div>
  `;
  
  // Add to body
  document.body.appendChild(popup);
  
  // Add close button event
  popup.querySelector('.close-btn').addEventListener('click', function() {
      document.body.removeChild(popup);
  });
  
  // Click outside to close
  popup.addEventListener('click', function(e) {
      if(e.target === popup) {
          document.body.removeChild(popup);
      }
  });
}

function clickCallUs(){
  const popup = document.createElement('div');
  popup.className = 'contact-popup';
  popup.innerHTML = `
      <div class="contact-popup-content">
          <div class="contact-popup-header">
              <h3>Call</h3>
              <button class="close-btn">&times;</button>
          </div>
          <div class="contact-popup-body">
              <p><i class="fas fa-phone"></i> 176073401 (9 AM-6 PM)</p>
          </div>
      </div>
  `;
  
  // Add to body
  document.body.appendChild(popup);
  
  // Add close button event
  popup.querySelector('.close-btn').addEventListener('click', function() {
      document.body.removeChild(popup);
  });
  
  // Click outside to close
  popup.addEventListener('click', function(e) {
      if(e.target === popup) {
          document.body.removeChild(popup);
      }
  });
}

function clickLink() {
  const popup = document.createElement('div');
  popup.className = 'contact-popup';
  popup.innerHTML = `
      <div class="contact-popup-content">
          <div class="contact-popup-header">
              <h3>Contact Us</h3>
              <button class="close-btn">&times;</button>
          </div>
          <div class="contact-popup-body">
              <p><i class="fas fa-envelope"></i> lijiaqi0807@gmail.com</p>
              <p><i class="fas fa-phone"></i> 176073401 (9 AM-6 PM)</p>
          </div>
      </div>
  `;
  
  // Add to body
  document.body.appendChild(popup);
  
  // Add close button event
  popup.querySelector('.close-btn').addEventListener('click', function() {
      document.body.removeChild(popup);
  });
  
  // Click outside to close
  popup.addEventListener('click', function(e) {
      if(e.target === popup) {
          document.body.removeChild(popup);
      }
  });
}

// Initialization function
function initPage() {
    checkLoginStatus();
    setupEventListeners();
    // Other initialization logic
}

// Execute when DOM loading is complete
document.addEventListener("DOMContentLoaded", initPage);

function addBottom(){
  const bottomContainer = document.getElementById('bottom-container');
  
  // Check if current page should not have footer
  const currentPath = window.location.pathname;
  const currentFile = currentPath.split('/').pop();
  
  // Pages that should not have footer: booking, payment, payment success
  const noFooterPages = [
    'booking3.html',
    'pay.html', 
    'paysuccess.html'
  ];
  
  // Skip footer insertion for specified pages
  if (noFooterPages.includes(currentFile)) {
    bottomContainer.innerHTML = '';
    return;
  }
  
  const bottomHTML=`
  <footer class="homepage-footer">
    <div class="container" style="max-width:1200px; margin: 0 auto; padding: 0 20px;">
      <div class="footer-grid">
        <div class="footer-column">
          <h3>CineTix</h3>
          <p>The ultimate destination for movie enthusiasts to book tickets and enjoy premium cinema experiences.</p>
        </div>
        
        <div class="footer-column">
          <h3>Quick Links</h3>
          <ul class="footer-links-list">
            <li><a href="homepage.html">Movies</a></li>
            <li><a href="theater.html">Theaters</a></li>
            <li><a href="upcoming.html">Upcoming Releases</a></li>
            <li><a href="giftcards.html">Gift Cards</a></li>
            <li><a href="offer.html">Offers & Discounts</a></li>
          </ul>
        </div>
        
        <div class="footer-column">
          <h3>Support</h3>
          <ul class="footer-links-list">
            <li><a href="faqs.html">FAQs</a></li>
            <li><a href="javascript:clickLink()">Contact Us</a></li>
            <li><a href="team.html">Terms of Service</a></li>
            <li><a href="privacy.html">Privacy Policy</a></li>
            <li><a href="help.html">Help Center</a></li>
          </ul>
        </div>
        
        <div class="footer-column">
          <h3>Download Our App</h3>
          <p>Get the best movie booking experience on your mobile device.</p>
          <a href="#" class="app-store-link">
            <img src="../img/app-store.png" alt="App Store">
          </a>
        </div>
      </div>
      
      <div class="footer-bottom">
        <p>&copy; 2025 Alpha Striker 2.0. All rights reserved.</p>
      </div>
    </div>
  </footer>
  `;
  bottomContainer.innerHTML = bottomHTML;
  
  // Ensure footer appears at bottom for payment pages
  const footer = bottomContainer.querySelector('.homepage-footer');
  if (footer && (window.location.pathname.includes('pay'))) {
    footer.style.marginTop = 'auto';
  }
}

// Dynamically load common components
document.addEventListener('DOMContentLoaded', function() {
  // Load common header
  const headerContainer = document.getElementById('header-container');
  if (headerContainer) {
    // Due to CORS restrictions, insert HTML directly instead of using fetch
    const headerHTML = `
          <!-- Common header component -->
    <header class="header">
      <div class="logo-container">
        <a href="homepage.html" class="logo-link">
          <img src="" alt="Alpha Striker 2.0" id="logo-image">
        </a>
      </div>
      
      <nav class="nav-links">
        <a href="#" class="nav-link" data-page="homepage.html">Movies</a>
        <a href="#" class="nav-link" data-page="theater.html">Theaters</a>
        <a href="#" class="nav-link" data-page="offer.html">Offers</a>
        <a href="#" class="nav-link" data-page="about.html">About</a>
      </nav>
      
      <div class="user-actions">
        <div class="dark-mode-toggle" onclick="toggleDarkMode()" title="Toggle Dark Mode">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="moon-icon">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sun-icon" style="display:none;">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
        </div>
        <div class="user-profile" style="cusor:hand" onclick="location.href='generate_ticket.html'">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
          <span class="user-name" id="header-cart">cart</span>
        </div>
        <div class="user-profile">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          <span class="user-name" id="header-username">544350851</span>
          <div class="dropdown-content" id="userDropdown">
            <!-- User Profile Card -->
            <div class="user-profile-card">
              <div class="user-avatar">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              <div class="user-display-name" id="dropdown-username">${localStorage.getItem('userName') || localStorage.getItem('email')?.split('@')[0] || '544350851'}</div>
              <div class="user-email" id="dropdown-email">${localStorage.getItem('email') || 'Not logged in'}</div>
              <div class="user-membership">Regular User</div>
            </div>

                         <!-- User Information -->
             <div class="user-info-section">
               <div class="info-item">
                 <span class="info-label">Username:</span>
                 <span class="info-value">${localStorage.getItem('userName') || localStorage.getItem('email') || '544350851'}</span>
               </div>
               <div class="info-item">
                 <span class="info-label">Email:</span>
                 <span class="info-value">${localStorage.getItem('email') || 'Not provided'}</span>
               </div>
               <div class="info-item">
                 <span class="info-label">Password:</span>
                 <span class="info-value password-field" id="password-display">Not stored for security</span>
                 <button class="toggle-password-btn" onclick="togglePasswordVisibility(event)" title="Show/Hide Password">
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                     <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                     <circle cx="12" cy="12" r="3"></circle>
                   </svg>
                 </button>
               </div>
               <div class="info-item">
                 <span class="info-label">Status:</span>
                 <span class="info-value">Active</span>
               </div>
             </div>

            <!-- Menu Options -->
            <div class="dropdown-menu">
              <a href="#" class="dropdown-item" onclick="navigateToMovies()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                <div class="dropdown-item-text">
                  <span class="dropdown-item-title">Browse Movies</span>
                  <span class="dropdown-item-desc">Explore current and upcoming movies</span>
                </div>
              </a>

              <a href="#" class="dropdown-item" onclick="navigateToTheaters()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <div class="dropdown-item-text">
                  <span class="dropdown-item-title">Find Theaters</span>
                  <span class="dropdown-item-desc">Locate theaters near you</span>
                </div>
              </a>

              <a href="#" class="dropdown-item" onclick="navigateToOffers()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M16 12l-4-4-4 4"></path>
                  <path d="M12 16V8"></path>
                </svg>
                <div class="dropdown-item-text">
                  <span class="dropdown-item-title">Special Offers</span>
                  <span class="dropdown-item-desc">View current promotions and discounts</span>
                </div>
              </a>

              <a href="#" class="dropdown-item" onclick="navigateToTickets()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
                <div class="dropdown-item-text">
                  <span class="dropdown-item-title">My Tickets</span>
                  <span class="dropdown-item-desc">View generated tickets</span>
                </div>
              </a>

              <div class="dropdown-separator"></div>

              <a href="#" class="dropdown-item" onclick="navigateToAbout()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <div class="dropdown-item-text">
                  <span class="dropdown-item-title">About Us</span>
                  <span class="dropdown-item-desc">Learn more about our cinema</span>
                </div>
              </a>

              <a href="#" class="dropdown-item" onclick="getHelp()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <div class="dropdown-item-text">
                  <span class="dropdown-item-title">Help & Contact</span>
                  <span class="dropdown-item-desc">Get help or contact support</span>
                </div>
              </a>
            </div>
          </div>
        </div>
        <a href="#" class="logout-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          Logout
        </a>
      </div>
    </header>
    `;
    
    // Insert HTML
    headerContainer.innerHTML = headerHTML;

    addBottom();

    // Add click event listener to show dropdown menu
    document.getElementById('header-username').addEventListener('click', function() {
      const dropdown = document.getElementById('userDropdown');
      dropdown.classList.toggle('show');
    });
    
    // Fix path issues
    const inPagesDir = window.location.pathname.includes('/pages/');
    
    // Get logo link and image elements
    const logoLink = document.querySelector('.logo-link');
    const logoImg = document.getElementById('logo-image');
    
    // Get all navigation links and logout button
    const navLinks = document.querySelectorAll('.nav-link');
    const logoutBtn = document.querySelector('.logout-btn');
    
    if (inPagesDir) {
      // If in pages directory, use path relative to pages
      logoLink.setAttribute('href', 'homepage.html');
      logoImg.setAttribute('src', '../img/logo.jpg');
      
      navLinks.forEach(link => {
        const page = link.getAttribute('data-page');
        link.setAttribute('href', page);
      });
      
      logoutBtn.setAttribute('href', '../login.html');
    } else {
      // If in root directory, use path relative to root
      logoLink.setAttribute('href', 'pages/homepage.html');
      logoImg.setAttribute('src', 'img/logo.jpg');
      
      navLinks.forEach(link => {
        const page = link.getAttribute('data-page');
        link.setAttribute('href', 'pages/' + page);
      });
      
      logoutBtn.setAttribute('href', 'login.html');
    }
    
    // Set current page navigation highlight
    highlightCurrentNavItem();
    
    // Load user information
    loadUserInfo();
    
    // Bind logout event
    bindLogoutEvent();
  }
});

// Highlight current page navigation item
function highlightCurrentNavItem() {
  // Get current page path
  const path = window.location.pathname;
  let currentPage = path.split('/').pop();
  
  
  
  // If no page name (e.g. / or /pages/), default to homepage.html
  if (!currentPage || currentPage === '' || currentPage === 'index.html') {
    currentPage = 'homepage.html';
  }
  
  document.querySelectorAll('.nav-link').forEach(link => {
    // Remove all active classes
    link.classList.remove('active');
    
    // Match current page based on data-page attribute
    const linkPage = link.getAttribute('data-page');
    if (linkPage === currentPage) {
      link.classList.add('active');
      
    }
  });
}

// Load user information
function loadUserInfo() {
  const userNameElement = document.getElementById('header-username');
  if (userNameElement) {
    const userName = localStorage.getItem('userName');
    const userEmail = localStorage.getItem('userEmail');
    
    if (userName) {
      userNameElement.textContent = userName;
    } else if (userEmail) {
      const emailName = userEmail.split('@')[0];
      userNameElement.textContent = emailName;
    }
  }
}

// Bind logout event
function bindLogoutEvent() {
  const logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault(); // Prevent default behavior
      if (confirm("Are you sure you want to logout?")) {
        // Check if currently in pages directory
        const inPagesDir = window.location.pathname.includes('/pages/');
        if (inPagesDir) {
          window.location.href = "../login.html";
        } else {
          window.location.href = "login.html";
        }
      }
    });
  }
}



// Click elsewhere on page to close dropdown menu
window.onclick = function(event) {
  if (!event.target.matches('#header-username') && 
      !event.target.closest('.user-profile') && 
      !event.target.closest('.dropdown-content')) {
    const dropdowns = document.getElementsByClassName("dropdown-content");
    for (let i = 0; i < dropdowns.length; i++) {
      const openDropdown = dropdowns[i];
      if (openDropdown.classList.contains('show')) {
        openDropdown.classList.remove('show');
      }
    }
  }
}

// User menu functions
function navigateToMovies() {
  closeUserDropdown();
  showNotification('Movies', 'Browsing available movies...', 'success');
  // Redirect to movies page
  setTimeout(() => {
    const inPagesDir = window.location.pathname.includes('/pages/');
    if (inPagesDir) {
      window.location.href = 'homepage.html';
    } else {
      window.location.href = 'pages/homepage.html';
    }
  }, 1000);
}

function navigateToTheaters() {
  closeUserDropdown();
  showNotification('Theaters', 'Finding theaters near you...', 'success');
  // Redirect to theaters page
  setTimeout(() => {
    const inPagesDir = window.location.pathname.includes('/pages/');
    if (inPagesDir) {
      window.location.href = 'theater.html';
    } else {
      window.location.href = 'pages/theater.html';
    }
  }, 1000);
}

function navigateToOffers() {
  closeUserDropdown();
  showNotification('Offers', 'Loading current promotions...', 'success');
  // Redirect to offers page
  setTimeout(() => {
    const inPagesDir = window.location.pathname.includes('/pages/');
    if (inPagesDir) {
      window.location.href = 'offer.html';
    } else {
      window.location.href = 'pages/offer.html';
    }
  }, 1000);
}

function navigateToTickets() {
  closeUserDropdown();
  showNotification('Tickets', 'Loading your tickets...', 'info');
  // Redirect to ticket generation page (same as cart)
  setTimeout(() => {
    location.href = 'generate_ticket.html';
  }, 1000);
}

function navigateToAbout() {
  closeUserDropdown();
  showNotification('About', 'Loading about page...', 'info');
  // Redirect to about page
  setTimeout(() => {
    const inPagesDir = window.location.pathname.includes('/pages/');
    if (inPagesDir) {
      window.location.href = 'about.html';
    } else {
      window.location.href = 'pages/about.html';
    }
  }, 1000);
}

function getHelp() {
  closeUserDropdown();
  showNotification('Help', 'Loading help section...', 'info');
  // Redirect to about page which contains contact information
  setTimeout(() => {
    const inPagesDir = window.location.pathname.includes('/pages/');
    if (inPagesDir) {
      window.location.href = 'about.html';
    } else {
      window.location.href = 'pages/about.html';
    }
  }, 1000);
}

function closeUserDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) {
    dropdown.classList.remove('show');
  }
}

// Toggle password visibility
let isPasswordVisible = false;

function togglePasswordVisibility(event) {
  // Prevent event from bubbling up to close the dropdown
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  
  const passwordDisplay = document.getElementById('password-display');
  const toggleBtn = document.querySelector('.toggle-password-btn');
  const actualPassword = 'Not stored for security';
  
  if (isPasswordVisible) {
    // Hide password
    passwordDisplay.textContent = actualPassword !== 'Not set' ? '********' : 'Not set';
    toggleBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    toggleBtn.title = "Show Password";
    isPasswordVisible = false;
  } else {
    // Show password
    passwordDisplay.textContent = actualPassword;
    toggleBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
    toggleBtn.title = "Hide Password";
    isPasswordVisible = true;
  }
}

// Enhanced notification system for user menu actions
function showNotification(title, message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `user-notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <div class="notification-icon">
        ${getNotificationIcon(type)}
      </div>
      <div class="notification-text">
        <div class="notification-title">${title}</div>
        <div class="notification-message">${message}</div>
      </div>
      <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    </div>
  `;
  
  // Add notification styles if not exists
  if (!document.getElementById('notification-styles')) {
    const styles = document.createElement('style');
    styles.id = 'notification-styles';
    styles.textContent = `
      .user-notification {
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
      }
      .user-notification.success {
        border-left-color: #28a745;
      }
      .user-notification.info {
        border-left-color: #17a2b8;
      }
      .notification-content {
        display: flex;
        align-items: flex-start;
        padding: 16px;
        gap: 12px;
      }
      .notification-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }
      .notification-icon svg {
        width: 100%;
        height: 100%;
      }
      .notification-text {
        flex: 1;
      }
      .notification-title {
        font-weight: 600;
        color: #333;
        margin-bottom: 4px;
      }
      .notification-message {
        font-size: 14px;
        color: #666;
      }
      .notification-close {
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
  
  document.body.appendChild(notification);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 3000);
}

function getNotificationIcon(type) {
  switch (type) {
    case 'success':
      return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#28a745" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    case 'info':
      return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#17a2b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    default:
      return '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4361ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }
}

// Dark Mode Toggle Function
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDarkMode = document.body.classList.contains('dark-mode');
  
  // Save preference to localStorage
  localStorage.setItem('darkMode', isDarkMode);
  
  // Apply dark mode to all iframes if any
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    try {
      if (iframe.contentDocument) {
        iframe.contentDocument.body.classList.toggle('dark-mode', isDarkMode);
      }
    } catch (e) {
      // Cross-origin iframe, can't access
    }
  });
}

// Initialize dark mode on page load
function initializeDarkMode() {
  const savedDarkMode = localStorage.getItem('darkMode') === 'true';
  if (savedDarkMode) {
    document.body.classList.add('dark-mode');
  }
  
  // Add dark mode CSS link if not already present
  if (!document.getElementById('dark-mode-css')) {
    const darkModeLink = document.createElement('link');
    darkModeLink.id = 'dark-mode-css';
    darkModeLink.rel = 'stylesheet';
    darkModeLink.type = 'text/css';
    // Check if currently in pages directory
    const inPagesDir = window.location.pathname.includes('/pages/');
    darkModeLink.href = inPagesDir ? '../css/common/dark-mode.css' : 'css/common/dark-mode.css';
    document.head.appendChild(darkModeLink);
  }
  
  // Add dark mode helper script if not already present
  if (!document.getElementById('dark-mode-helper')) {
    const darkModeHelper = document.createElement('script');
    darkModeHelper.id = 'dark-mode-helper';
    darkModeHelper.type = 'text/javascript';
    // Check if currently in pages directory
    const inPagesDir = window.location.pathname.includes('/pages/');
    darkModeHelper.src = inPagesDir ? '../js/dark-mode-helper.js' : 'js/dark-mode-helper.js';
    document.head.appendChild(darkModeHelper);
  }
  
  // Add dark mode styles if not already present
  if (!document.getElementById('dark-mode-styles')) {
    const darkModeStyles = document.createElement('style');
    darkModeStyles.id = 'dark-mode-styles';
    darkModeStyles.textContent = `
      /* Global Dark Mode Styles */
      body.dark-mode {
        background-color: #1a1a1a;
        color: #e0e0e0;
      }
      
      body.dark-mode * {
        border-color: #333 !important;
      }
      
      /* Header Dark Mode */
      body.dark-mode .header {
        background: linear-gradient(135deg, #2a2a2a, #1a1a1a);
        border-bottom: 1px solid #333;
      }
      
      body.dark-mode .logo-container img {
        background-color: #2a2a2a;
        border: 1px solid #444;
      }
      
      body.dark-mode .nav-link {
        color: #e0e0e0;
      }
      
      body.dark-mode .nav-link:hover {
        color: #fff;
      }
      
      body.dark-mode .nav-link.active::after {
        background-color: #ff6b6b;
      }
      
      body.dark-mode .logout-btn {
        background-color: rgba(255, 255, 255, 0.1);
        color: #e0e0e0;
      }
      
      body.dark-mode .logout-btn:hover {
        background-color: rgba(255, 255, 255, 0.2);
      }
      
      body.dark-mode .dark-mode-toggle {
        background-color: rgba(255, 255, 255, 0.1);
      }
      
      body.dark-mode .dark-mode-toggle:hover {
        background-color: rgba(255, 255, 255, 0.2);
      }
      
      /* Dropdown Dark Mode */
      body.dark-mode .dropdown-content {
        background: #2a2a2a;
        border-color: #444;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      }
      
      body.dark-mode .user-profile-card {
        background: linear-gradient(135deg, #3a3a3a, #2a2a2a);
      }
      
      body.dark-mode .dropdown-item {
        color: #e0e0e0;
      }
      
      body.dark-mode .dropdown-item:hover {
        background-color: #333;
        color: #fff;
      }
      
      body.dark-mode .dropdown-item svg {
        color: #999;
      }
      
      body.dark-mode .dropdown-item:hover svg {
        color: #fff;
      }
      
      body.dark-mode .dropdown-item-desc {
        color: #999;
      }
      
      body.dark-mode .dropdown-separator {
        background-color: #444;
      }
      
      body.dark-mode .user-info-section {
        background: #333;
        border-top-color: #444;
      }
      
      body.dark-mode .info-item {
        border-bottom-color: #444;
      }
      
      body.dark-mode .info-label {
        color: #999;
      }
      
      body.dark-mode .info-value {
        color: #e0e0e0;
      }
      
      body.dark-mode .toggle-password-btn {
        color: #999;
      }
      
      body.dark-mode .toggle-password-btn:hover {
        background-color: #444;
        color: #fff;
      }
      
      /* Footer Dark Mode */
      body.dark-mode .dark-footer {
        background-color: #0a0a0a;
        border-top: 1px solid #333;
      }
      
      body.dark-mode .footer-brand h3,
      body.dark-mode .footer-links h3,
      body.dark-mode .footer-download h3 {
        color: #e0e0e0;
      }
      
      body.dark-mode .footer-brand p,
      body.dark-mode .footer-links a,
      body.dark-mode .footer-download p {
        color: #999;
      }
      
      body.dark-mode .footer-links a:hover {
        color: #ff6b6b;
      }
      
      body.dark-mode .social-icon {
        background-color: rgba(255, 255, 255, 0.05);
        color: #e0e0e0;
      }
      
      body.dark-mode .social-icon:hover {
        background-color: #ff6b6b;
      }
      
      body.dark-mode .footer-bottom {
        border-top-color: #333;
        color: #666;
      }
      
      /* General Content Dark Mode */
      body.dark-mode .container,
      body.dark-mode .content,
      body.dark-mode .card,
      body.dark-mode .panel,
      body.dark-mode .box {
        background-color: #2a2a2a;
        color: #e0e0e0;
      }
      
      body.dark-mode input,
      body.dark-mode textarea,
      body.dark-mode select {
        background-color: #333;
        color: #e0e0e0;
        border-color: #444;
      }
      
      body.dark-mode input:focus,
      body.dark-mode textarea:focus,
      body.dark-mode select:focus {
        border-color: #4361ee;
        background-color: #3a3a3a;
      }
      
      body.dark-mode button:not(.proceed-button):not(.vr-button):not(.time-slot):not(.date-item) {
        background-color: #333;
        color: #e0e0e0;
        border-color: #444;
      }
      
      body.dark-mode button:not(.proceed-button):not(.vr-button):not(.time-slot):not(.date-item):hover {
        background-color: #444;
      }
      
      body.dark-mode a {
        color: #66a3ff;
      }
      
      body.dark-mode a:hover {
        color: #99c2ff;
      }
      
      body.dark-mode table {
        background-color: #2a2a2a;
        color: #e0e0e0;
      }
      
      body.dark-mode th {
        background-color: #333;
        color: #e0e0e0;
      }
      
      body.dark-mode td {
        border-color: #444;
      }
      
      body.dark-mode tr:hover {
        background-color: #333;
      }
      
      /* Modal/Popup Dark Mode */
      body.dark-mode .modal,
      body.dark-mode .popup,
      body.dark-mode .dialog {
        background-color: #2a2a2a;
        color: #e0e0e0;
      }
      
      body.dark-mode .modal-content,
      body.dark-mode .popup-content {
        background-color: #2a2a2a;
        color: #e0e0e0;
      }
      
      /* Notification Dark Mode */
      body.dark-mode .user-notification {
        background: #2a2a2a;
        border-left-color: #4361ee;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }
      
      body.dark-mode .notification-title {
        color: #e0e0e0;
      }
      
      body.dark-mode .notification-message {
        color: #999;
      }
      
      body.dark-mode .notification-close {
        color: #666;
      }
      
      body.dark-mode .notification-close:hover {
        color: #999;
      }
      
      /* Contact Popup Dark Mode */
      body.dark-mode .contact-popup-content {
        background: #2a2a2a;
        color: #e0e0e0;
      }
      
      body.dark-mode .contact-popup-header {
        border-bottom-color: #444;
      }
      
      body.dark-mode .close-btn {
        color: #999;
      }
      
      body.dark-mode .close-btn:hover {
        color: #e0e0e0;
      }
      
      /* Additional Elements */
      body.dark-mode .badge {
        background-color: #333;
        color: #e0e0e0;
      }
      
      body.dark-mode .alert {
        background-color: #333;
        color: #e0e0e0;
        border-color: #444;
      }
      
      body.dark-mode .progress {
        background-color: #333;
      }
      
      body.dark-mode .progress-bar {
        background-color: #4361ee;
      }
      
      body.dark-mode code {
        background-color: #333;
        color: #ff6b6b;
      }
      
      body.dark-mode pre {
        background-color: #1a1a1a;
        color: #e0e0e0;
        border-color: #444;
      }
      
      body.dark-mode blockquote {
        border-left-color: #4361ee;
        color: #999;
      }
      
      body.dark-mode hr {
        border-color: #444;
      }
      
      /* Scrollbar Dark Mode */
      body.dark-mode::-webkit-scrollbar {
        background-color: #1a1a1a;
      }
      
      body.dark-mode::-webkit-scrollbar-track {
        background-color: #1a1a1a;
      }
      
      body.dark-mode::-webkit-scrollbar-thumb {
        background-color: #444;
        border-radius: 4px;
      }
      
      body.dark-mode::-webkit-scrollbar-thumb:hover {
        background-color: #555;
      }
    `;
    document.head.appendChild(darkModeStyles);
  }
}

// Call initializeDarkMode when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeDarkMode);

// Enable transitions after page load to prevent flash
window.addEventListener('load', function() {
  setTimeout(function() {
    document.body.classList.add('dark-mode-transition');
  }, 100);
});