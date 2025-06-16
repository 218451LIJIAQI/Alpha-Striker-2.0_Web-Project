function createAdminNav() {
    const nav = document.createElement('div');
    nav.className = 'admin-nav';
    nav.innerHTML = `
        <a href="dashboard.html">Dashboard</a>
        <a href="movies.html">Movies</a>
        <a href="offers.html">Offers</a>
        <a href="login.html" id="logout">Logout</a>
    `;
    return nav;
}

// Insert navigation when page loads
document.addEventListener('DOMContentLoaded', function() {
    const body = document.querySelector('body');
    if (body) {
        body.insertBefore(createAdminNav(), body.firstChild);
    }
});