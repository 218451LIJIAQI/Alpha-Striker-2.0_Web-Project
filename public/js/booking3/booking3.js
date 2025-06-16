document.addEventListener('DOMContentLoaded', function() {
    // Get movie_code parameter from URL
    const urlParams = new URLSearchParams(window.location.search);
    const movieCode = urlParams.get('movie_code');
    
    if (movieCode) {
        // Call API to get movie details
        fetch(`/index.php/movie/movies/getMovieByCode?movie_code=${movieCode}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateMovieInfo(data.data);
                }
            })
            .catch(error => {
                console.error('Failed to get movie information:', error);
            });
    }
    
    function updateMovieInfo(movie) {
        const movieInfo = document.querySelector('.movie-info');
        movieInfo.innerHTML = `
            <img src="${movie.img}" alt="${movie.movie_name}" class="movie-poster">
            <div class="movie-details">
                <h1>${movie.movie_name}</h1>
                <div class="movie-meta">
                    <span class="meta-item"><i class="fas fa-film"></i> ${movie.movie_type}</span>
                    <span class="meta-item"><i class="fas fa-clock"></i> ${movie.times}</span>
                    <span class="meta-item"><i class="fas fa-tag"></i> ${movie.rating || 'PG'}</span>
                </div>
                <div class="movie-rating">
                    <i class="fas fa-star"></i> ${movie.score || '8.5'}/10
                </div>
            </div>
        `;
    }
});
let selectedSeats = [];
let currentMovieCode = '';
let currentDate = '';
let currentTime = '09:30 AM';

function fetchOccupiedSeats() {
    
    if (!currentMovieCode || !currentDate || !currentTime) return;
    clearSelectedSeats();
    fetch(`/index.php/movie/seat/getSeatList?movie_code=${currentMovieCode}&date=${currentDate}&time=${currentTime}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateSeatStatus(data.data);
            }
        })
        .catch(error => {
            console.error('Failed to get seat information:', error);
        });
}

function updateSeatStatus(occupiedSeats) {
    document.querySelectorAll('.seat').forEach(seat => {
        const rowLabel = seat.parentElement.querySelector('.row-label').textContent;
        const seatIndex = Array.from(seat.parentElement.querySelectorAll('.seat')).indexOf(seat);
        const seatNum = `${rowLabel}${seatIndex + 1}`;
        
        // Reset seat status
        seat.className = 'seat';
        seat.onclick = null;
        seat.style.cursor = 'default';
        
        // Check if seat is already sold
        if (occupiedSeats.some(s => s.seat_num === seatNum)) {
            seat.classList.add('reserved');
            seat.style.cursor = 'not-allowed';
        } else {
            seat.onclick = function() { toggleSeat(this); };
            seat.style.cursor = 'pointer';
        }
    });
}

function toggleSeat(seatElement) {
    const rowLabel = seatElement.parentElement.querySelector('.row-label').textContent;
    // Get seat index position in row
    const seatIndex = Array.from(seatElement.parentElement.querySelectorAll('.seat')).indexOf(seatElement);
    const seatNum = `${rowLabel}${seatIndex + 1}`; // Seat numbering starts from 1
    
    if (seatElement.classList.contains('selected')) {
        seatElement.classList.remove('selected');
        selectedSeats = selectedSeats.filter(s => s !== seatNum);
    } else {
        seatElement.classList.add('selected');
        selectedSeats.push(seatNum);
    }
    
    updateSelectedSeatsDisplay();
}

function updateSelectedSeatsDisplay() {
    const container = document.querySelector('.seat-tags');
    container.innerHTML = '';
    
    selectedSeats.forEach(seat => {
        const tag = document.createElement('div');
        tag.className = 'seat-tag';
        tag.textContent = seat;
        container.appendChild(tag);
    });
}

function setupProceedButton() {
    document.querySelector('.proceed-button').addEventListener('click', function() {
        if (selectedSeats.length === 0) {
            alert('Please select at least one seat');
            return;
        }
        
        const bookingData = {
            movie_code: currentMovieCode,
            date: currentDate,
            time: currentTime,
            seats: selectedSeats
        };
        
        localStorage.setItem('bookingData', JSON.stringify(bookingData));
        // Logic to redirect to payment page can be added here
        location.href = `pay.html?movie_code=${currentMovieCode}&date=${currentDate}&time=${currentTime}&seats=${selectedSeats.join(',')}`;
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize movie code, date and time
    const urlParams = new URLSearchParams(window.location.search);
    currentMovieCode = urlParams.get('movie_code');
    
    // Set up date and time change listeners
    document.querySelector('.date-selector').addEventListener('click', function(e) {
        if (e.target.closest('.date-item')) {
            currentDate = e.target.closest('.date-item').querySelector('.date-date').textContent;
            fetchOccupiedSeats();
        }
    });
    
    document.querySelector('.time-slots').addEventListener('click', function(e) {
        if (e.target.closest('.time-slot')) {
            currentTime = e.target.closest('.time-slot').textContent;
            fetchOccupiedSeats();
        }
    });
    
    // Initialize default date and time
    // currentDate = document.querySelector('.date-item.active .date-date').textContent;
    // currentTime = document.querySelector('.time-slot.active').textContent;
    
    // Initialize functions
    fetchOccupiedSeats();
    setupProceedButton();
});

function generateDates() {
    const dateContainer = document.querySelector('.date-selector');
    dateContainer.innerHTML = '';
    
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(today.getDate() + i);
        
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const dateItem = document.createElement('div');
        dateItem.className = 'date-item';
        if (i === 0) {
            dateItem.classList.add('active');
        }
        
        dateItem.innerHTML = `
            <span class="date-day">${dayNames[date.getDay()]}</span>
            <span class="date-date">${date.getDate()}</span>
            <span class="date-month">${monthNames[date.getMonth()]}</span>
        `;
        
        dateItem.addEventListener('click', function() {
            document.querySelectorAll('.date-item').forEach(item => {
                item.classList.remove('active');
            });
            this.classList.add('active');
        });
        
        dateContainer.appendChild(dateItem);
        currentDate = document.querySelector('.date-item.active .date-date').textContent;
        fetchOccupiedSeats();
    }
}

function setupTimeSlots() {
    const timeSlots = document.querySelectorAll('.time-slot');
    
    timeSlots.forEach(slot => {
        slot.addEventListener('click', function() {
            // Remove all active classes
            document.querySelectorAll('.time-slot').forEach(item => {
                item.classList.remove('active');
            });
            // Add active class to current clicked item
            this.classList.add('active');
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    setupTimeSlots();
    generateDates();
});


function clearSelectedSeats() {
    // Clear selected seats array
    selectedSeats = [];
    
    // Remove selected class from all seats
    document.querySelectorAll('.seat.selected').forEach(seat => {
        seat.classList.remove('selected');
    });
    
    // Update selected seats display
    updateSelectedSeatsDisplay();
}

  // Jump to 3D
  function viewSeatsInVR(){
    window.location.href = "3D Model.html";
  }