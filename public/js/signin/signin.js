    function showPage(pageId) {
      const pages = ['register-page', 'login-page', 'home-page'];
      pages.forEach(id => {
        document.getElementById(id).style.display = id === pageId ? 'block' : 'none';
      });
    }