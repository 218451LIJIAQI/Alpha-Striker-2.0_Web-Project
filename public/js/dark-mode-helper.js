// Dark Mode Helper - Handles edge cases and dynamic content
(function() {
  // Function to apply dark mode to dynamically added elements
  function applyDarkModeToElement(element) {
    if (!document.body.classList.contains('dark-mode')) return;
    
    // Skip if element is barcode or QR code related
    if (element.className && (
      element.className.includes('barcode') || 
      element.className.includes('qr-code') ||
      element.className.includes('qr')
    )) {
      return;
    }
    
    // Check if element has inline styles that need to be overridden
    if (element.style) {
      // Override white backgrounds
      if (element.style.backgroundColor && (
        element.style.backgroundColor.includes('255') ||
        element.style.backgroundColor.includes('white') ||
        element.style.backgroundColor.includes('#fff') ||
        element.style.backgroundColor.includes('#FFF')
      )) {
        element.style.backgroundColor = '#1a1a1d';
      }
      
      // Override black text
      if (element.style.color && (
        element.style.color.includes('0, 0, 0') ||
        element.style.color.includes('black') ||
        element.style.color.includes('#000')
      )) {
        element.style.color = '#f0f0f0';
      }
      
      // Override light gray backgrounds
      if (element.style.backgroundColor && (
        element.style.backgroundColor.includes('245') ||
        element.style.backgroundColor.includes('240') ||
        element.style.backgroundColor.includes('#f5f5f5') ||
        element.style.backgroundColor.includes('#f0f0f0')
      )) {
        element.style.backgroundColor = '#252529';
      }
    }
    
    // Apply to all children
    const children = element.children;
    for (let i = 0; i < children.length; i++) {
      applyDarkModeToElement(children[i]);
    }
  }
  
  // Mutation Observer to handle dynamically added content
  const observer = new MutationObserver(function(mutations) {
    if (!document.body.classList.contains('dark-mode')) return;
    
    mutations.forEach(function(mutation) {
      // Handle added nodes
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) { // Element node
          applyDarkModeToElement(node);
        }
      });
      
      // Handle attribute changes
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        applyDarkModeToElement(mutation.target);
      }
    });
  });
  
  // Start observing when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    // Initial application to all elements
    if (document.body.classList.contains('dark-mode')) {
      applyDarkModeToElement(document.body);
    }
    
    // Start observing for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    });
  });
  
  // Re-apply dark mode when toggled
  const originalToggle = window.toggleDarkMode;
  if (originalToggle) {
    window.toggleDarkMode = function() {
      originalToggle();
      if (document.body.classList.contains('dark-mode')) {
        setTimeout(() => {
          applyDarkModeToElement(document.body);
        }, 100);
      }
    };
  }
  
  // Handle AJAX content
  if (window.jQuery) {
    $(document).ajaxComplete(function() {
      if (document.body.classList.contains('dark-mode')) {
        setTimeout(() => {
          applyDarkModeToElement(document.body);
        }, 100);
      }
    });
  }
  
  // Handle fetch API
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    return originalFetch.apply(this, args).then(response => {
      if (document.body.classList.contains('dark-mode')) {
        setTimeout(() => {
          applyDarkModeToElement(document.body);
        }, 100);
      }
      return response;
    });
  };
})(); 