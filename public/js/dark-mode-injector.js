// Dark Mode Injector - Ensures dark mode is applied to all pages
(function() {
  'use strict';
  
  // Check if dark mode should be active
  const isDarkMode = localStorage.getItem('darkMode') === 'true' || 
                     document.body.classList.contains('dark-mode');
  
  // Function to inject dark mode CSS
  function injectDarkModeCSS() {
    // Check if dark mode CSS is already loaded
    if (document.getElementById('dark-mode-css')) {
      return;
    }
    
    // Create and inject the CSS link
    const link = document.createElement('link');
    link.id = 'dark-mode-css';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    
    // Determine the correct path
    const pathname = window.location.pathname;
    let cssPath = '';
    
    if (pathname.includes('/pages/')) {
      cssPath = '../css/common/dark-mode.css';
    } else if (pathname.includes('/admin/')) {
      cssPath = '../css/common/dark-mode.css';
    } else {
      cssPath = 'css/common/dark-mode.css';
    }
    
    link.href = cssPath;
    document.head.appendChild(link);
  }
  
  // Function to apply dark mode class
  function applyDarkMode() {
    if (isDarkMode && !document.body.classList.contains('dark-mode')) {
      document.body.classList.add('dark-mode');
    }
  }
  
  // Function to fix specific elements
  function fixSpecificElements() {
    if (!isDarkMode) return;
    
    // Wait for DOM to be fully loaded
    const fixElements = () => {
      // Fix all elements with inline styles
      const elementsWithStyle = document.querySelectorAll('[style]');
      elementsWithStyle.forEach(el => {
        const style = el.getAttribute('style');
        
        // Skip barcode and QR code elements
        if (el.className && (
          el.className.includes('barcode') || 
          el.className.includes('qr')
        )) {
          return;
        }
        
        // Fix white backgrounds
        if (style && (
          style.includes('background-color: white') ||
          style.includes('background-color:#fff') ||
          style.includes('background-color: #fff') ||
          style.includes('background-color: rgb(255') ||
          style.includes('background: white') ||
          style.includes('background:#fff') ||
          style.includes('background: #fff')
        )) {
          el.style.backgroundColor = '#1a1a1d';
        }
        
        // Fix black text
        if (style && (
          style.includes('color: black') ||
          style.includes('color:#000') ||
          style.includes('color: #000') ||
          style.includes('color: rgb(0')
        )) {
          el.style.color = '#f0f0f0';
        }
        
        // Fix gray colors
        if (style && style.includes('color: #666')) {
          el.style.color = '#b8b8c0';
        }
        
        if (style && style.includes('color: #333')) {
          el.style.color = '#d0d0d0';
        }
      });
      
      // Fix specific problematic classes
      const problematicClasses = [
        'bg-white', 'bg-light', 'text-dark', 'text-black',
        'background-white', 'white-background'
      ];
      
      problematicClasses.forEach(className => {
        const elements = document.getElementsByClassName(className);
        Array.from(elements).forEach(el => {
          if (className.includes('bg-white') || className.includes('background-white')) {
            el.style.backgroundColor = '#1a1a1d';
          }
          if (className.includes('bg-light')) {
            el.style.backgroundColor = '#252529';
          }
          if (className.includes('text-dark') || className.includes('text-black')) {
            el.style.color = '#f0f0f0';
          }
        });
      });
      
      // Ensure all inputs are properly styled
      const inputs = document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), select, textarea');
      inputs.forEach(input => {
        if (!input.style.backgroundColor || 
            input.style.backgroundColor === 'white' || 
            input.style.backgroundColor === 'rgb(255, 255, 255)') {
          input.style.backgroundColor = '#252529';
          input.style.color = '#f0f0f0';
          input.style.borderColor = '#35353d';
        }
      });
      
      // Fix tables
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        table.style.backgroundColor = '#1a1a1d';
        table.style.color = '#f0f0f0';
      });
      
      const ths = document.querySelectorAll('th');
      ths.forEach(th => {
        th.style.backgroundColor = '#252529';
        th.style.color = '#f0f0f0';
      });
      
      const tds = document.querySelectorAll('td');
      tds.forEach(td => {
        td.style.color = '#b8b8c0';
        td.style.borderColor = '#35353d';
      });
    };
    
    // Run immediately and after a delay
    fixElements();
    setTimeout(fixElements, 100);
    setTimeout(fixElements, 500);
  }
  
  // Initialize dark mode
  function initDarkMode() {
    injectDarkModeCSS();
    applyDarkMode();
    fixSpecificElements();
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDarkMode);
  } else {
    initDarkMode();
  }
  
  // Also run when the page is fully loaded
  window.addEventListener('load', () => {
    initDarkMode();
    fixSpecificElements();
  });
  
  // Monitor for dynamic changes
  const observer = new MutationObserver((mutations) => {
    if (isDarkMode) {
      fixSpecificElements();
    }
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
  
  // Export function for manual trigger
  window.forceDarkMode = function() {
    localStorage.setItem('darkMode', 'true');
    document.body.classList.add('dark-mode');
    initDarkMode();
  };
})(); 