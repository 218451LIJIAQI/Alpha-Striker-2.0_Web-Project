document.addEventListener('DOMContentLoaded', function() {
    // Initialize loading all theaters
    fetchTheaters();
    
    // Bind search button event
    document.querySelector('.search-location button').addEventListener('click', function() {
        const address = document.querySelector('.search-location input').value.trim();
        fetchTheaters(address);
    });
    
    // Bind facility filter button event
    document.querySelectorAll('.filter-options button').forEach(button => {
        button.addEventListener('click', function() {
            // Update button active state
            document.querySelectorAll('.filter-options button').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            // Get amenity and load theaters
            const amenity = this.textContent === 'All Theaters' ? '' : this.textContent;
            fetchTheaters('', amenity);
        });
    });
});

// Get theater data
function fetchTheaters(address = '', amenity = '') {
    let url = '/index.php/theater/theater/getTheaterList';
    const params = new URLSearchParams();
    
    if(address) params.append('address', address);
    if(amenity) params.append('amenity', amenity);
    
    if(params.toString()) url += `?${params.toString()}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if(data.success) {
                renderTheaters(data.data);
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
}

// Render theater list
function renderTheaters(theaters) {
    const theaterList = document.querySelector('.theater-list');
    theaterList.innerHTML = '';
    
    theaters.forEach(theater => {
        const amenities = theater.amenity.split(',').map(a => a.trim());
        
        const theaterCard = document.createElement('div');
        theaterCard.className = 'theater-card';
        theaterCard.innerHTML = `
            <div class="theater-image">
                <img src="${theater.img}" alt="${theater.theater_name}">
            </div>
            <div class="theater-details">
                <h3>${theater.theater_name}</h3>
                <div class="theater-location">
                    <span>📍</span>
                    <span>${theater.address}</span>
                </div>
                <div class="amenities">
                    ${amenities.map(a => `<span class="amenity">${a}</span>`).join('')}
                </div>
                <div class="theater-rating">
                    <span>${getStarRating(theater.star)}</span>
                    <span>${theater.star} (${theater.reviews})</span>
                </div>
                <a href="theater-details.html?theater_code=${theater.theater_code}" class="view-details">View Theater Details</a>
            </div>
        `;
        theaterList.appendChild(theaterCard);
    });
}

// Generate star rating based on score
function getStarRating(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= fullStars) {
            stars += '<span class="star full">★</span>'; // Full star
        } else if (i === fullStars + 1 && hasHalfStar) {
            stars += '<span class="star half">★</span>'; // Half star
        } else {
            stars += '<span class="star empty">☆</span>'; // Empty star
        }
    }
    return stars;
}