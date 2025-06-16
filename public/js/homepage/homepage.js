document.addEventListener('DOMContentLoaded', function() {
    // Initialize loading all movies
    fetchMovies('all');
    
    // Bind category button click events
    document.querySelectorAll('.btn-filter').forEach(button => {
        button.addEventListener('click', function() {
            // Update button active state
            document.querySelectorAll('.btn-filter').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            // Get category and load corresponding movies
            const genre = this.dataset.genre;
            fetchMovies(genre);
        });
    });
    
    // Bind search button click event
    document.querySelector('.search-btn').addEventListener('click', function() {
        const keyword = document.querySelector('.search-input').value.trim();
        if(keyword) {
            searchMovies(keyword);
        }
    });
    
    // Search movies function
    function searchMovies(keyword) {
      document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.classList.remove('active');
      });
        
        // Activate All button
        document.querySelector('.btn-filter[data-genre="all"]').classList.add('active');
        fetch(`/index.php/movie/movies/searchMovies?keyword=${encodeURIComponent(keyword)}`)
            .then(response => response.json())
            .then(data => {
                if(data.success) {
                    renderMovies(data.data);
                } else {
                    console.error('Search failed:', data.message);
                }
            })
            .catch(error => {
                console.error('Request failed:', error);
            });
    }
});

function fetchAllMovies(genre) {
   document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.classList.remove('active');
  });
    
    // Activate All button
    document.querySelector('.btn-filter[data-genre="all"]').classList.add('active');
    fetchMovies('all');
}

// Get movie data
function fetchMovies(genre) {
    fetch(`/index.php/movie/movies/getMovieList?genre=${genre}`)
        .then(response => response.json())
        .then(data => {
            if(data.success) {
                renderMovies(data.data);
            } else {
                console.error('Failed to get movie data:', data.message);
            }
        })
        .catch(error => {
            console.error('Request failed:', error);
        });
}

// Render movie list
function renderMovies(movies) {
    const movieGrid = document.querySelector('.movie-grid');
    movieGrid.innerHTML = '';
    
    movies.forEach(movie => {
        const movieCard = document.createElement('div');
        movieCard.className = 'movie-card';
        movieCard.innerHTML = `
            ${movie.tag ? `<div class="movie-badge">${movie.tag}</div>` : ''}
            <img src="${movie.img}" alt="${movie.movie_name}" class="movie-poster">
            <div class="movie-info">
                <div class="movie-title">${movie.movie_name}</div>
                <div class="rating">
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star-half-alt"></i>
                    <span>4.5</span>
                </div>
                <div class="movie-meta">
                    <span><i class="fas fa-film"></i> ${movie.movie_type}</span>
                    <span><i class="fas fa-clock"></i> ${movie.times}</span>
                </div>
                <button class="btn btn-primary btn-book" data-movie-code="${movie.movie_code}">
                    <i class="fas fa-ticket-alt"></i>
                    Book Now
                </button>
            </div>
        `;
        
        // Add click event
        movieCard.querySelector('.btn-book').addEventListener('click', function() {
            const movieCode = this.getAttribute('data-movie-code');
            window.location.href = `booking3.html?movie_code=${encodeURIComponent(movieCode)}`;
        });
        movieGrid.appendChild(movieCard);
    });
}