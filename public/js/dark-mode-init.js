// Dark Mode Initialization Script for standalone pages
(function() {
  // Check if dark mode is saved in localStorage
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
    // Determine the correct path to the CSS file
    let pathPrefix = '';
    if (window.location.pathname.includes('/pages/')) {
      pathPrefix = '../';
    } else if (window.location.pathname.includes('/admin/')) {
      pathPrefix = '../';
    }
    darkModeLink.href = pathPrefix + 'css/common/dark-mode.css';
    document.head.appendChild(darkModeLink);
  }
})();

// Function to toggle dark mode (for pages without common.js)
function toggleDarkModeStandalone() {
  document.body.classList.toggle('dark-mode');
  const isDarkMode = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDarkMode);
} 