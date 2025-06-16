document.addEventListener('DOMContentLoaded', function() {
    // Get user seat information
    fetch('/index.php/movie/seat/getSeatListByUserCode?user_code=' + getCurrentUserCode())
        .then(response => response.json())
        .then(data => {
            if(data.success && data.data.length > 0) {
                for (let i = 0; i < data.data.length; i++) {
                    renderTicket(data.data[i]); 
                }
                // Display first seat by default
            }
        });
});

function renderTicket(seat) {
    // Render movie information
    var innerHTML = `
    <div class="ticket" id="ticket${seat.seat_code}" style="width: 350px;">
        <div class="movie-banner">
            <h1 class="movie-title">${seat.movie_info.movie_name}</h1>
            <div class="movie-duration">
                <span>${seat.movie_info.times} min</span>
            </div>
            <div class="movie-genre">
                <div class="genre-tags">
                    ${seat.movie_info.movie_type.split(',').map(type => 
                        `<div class="genre-tag">${type.trim()}</div>`
                    ).join('')}
                </div>
                <span class="rating">${getStarRating(seat.movie_info.star)}</span>
            </div>
        </div>
        
        <div class="ticket-details">
            
            <!-- Ticket details -->
            <div class="ticket-details">
                <div class="seat-info">
               
                    <div class="detail-column">
                        <div class="detail-label">ROW</div>
                        <div class="detail-value">${seat.seat_num.charAt(0)}</div>
                    </div>
                    <div class="detail-column">
                        <div class="detail-label">SEAT</div>
                        <div class="detail-value">${seat.seat_num.substring(1)}</div>
                    </div>
                </div>
                
                <div class="datetime-info">
                    <div class="date-time">
                        <div class="icon"><i class="fas fa-calendar-alt"></i></div>
                        <div class="text-info">
                            <div class="detail-label">DATE</div>
                            <div>${seat.date}</div>
                        </div>
                    </div>
                    <div class="date-time">
                        <div class="icon"><i class="fas fa-clock"></i></div>
                        <div class="text-info">
                            <div class="detail-label">TIME</div>
                            <div>${seat.time}</div>
                        </div>
                    </div>
                    
                </div>
                
                <!-- Barcode -->
                <div class="barcode-container">
                    <div class="barcode-inner">
                        <svg class="barcode" viewBox="0 0 250 60">
                            <rect x="5" y="5" width="3" height="50" fill="black"/>
                            <rect x="12" y="5" width="1" height="50" fill="black"/>
                            <rect x="16" y="5" width="2" height="50" fill="black"/>
                            <rect x="22" y="5" width="3" height="50" fill="black"/>
                            <rect x="27" y="5" width="1" height="50" fill="black"/>
                            <rect x="32" y="5" width="3" height="50" fill="black"/>
                            <rect x="38" y="5" width="2" height="50" fill="black"/>
                            <rect x="42" y="5" width="1" height="50" fill="black"/>
                            <rect x="46" y="5" width="4" height="50" fill="black"/>
                            <rect x="52" y="5" width="1" height="50" fill="black"/>
                            <rect x="56" y="5" width="2" height="50" fill="black"/>
                            <rect x="61" y="5" width="3" height="50" fill="black"/>
                            <rect x="66" y="5" width="1" height="50" fill="black"/>
                            <rect x="70" y="5" width="2" height="50" fill="black"/>
                            <rect x="75" y="5" width="4" height="50" fill="black"/>
                            <rect x="82" y="5" width="1" height="50" fill="black"/>
                            <rect x="85" y="5" width="3" height="50" fill="black"/>
                            <rect x="91" y="5" width="2" height="50" fill="black"/>
                            <rect x="95" y="5" width="1" height="50" fill="black"/>
                            <rect x="99" y="5" width="3" height="50" fill="black"/>
                            <rect x="105" y="5" width="1" height="50" fill="black"/>
                            <rect x="110" y="5" width="2" height="50" fill="black"/>
                            <rect x="115" y="5" width="3" height="50" fill="black"/>
                            <rect x="120" y="5" width="1" height="50" fill="black"/>
                            <rect x="125" y="5" width="2" height="50" fill="black"/>
                            <rect x="130" y="5" width="1" height="50" fill="black"/>
                            <rect x="135" y="5" width="3" height="50" fill="black"/>
                            <rect x="140" y="5" width="1" height="50" fill="black"/>
                            <rect x="145" y="5" width="2" height="50" fill="black"/>
                            <rect x="150" y="5" width="3" height="50" fill="black"/>
                            <rect x="155" y="5" width="4" height="50" fill="black"/>
                            <rect x="162" y="5" width="1" height="50" fill="black"/>
                            <rect x="165" y="5" width="2" height="50" fill="black"/>
                            <rect x="170" y="5" width="3" height="50" fill="black"/>
                            <rect x="175" y="5" width="1" height="50" fill="black"/>
                            <rect x="180" y="5" width="2" height="50" fill="black"/>
                            <rect x="185" y="5" width="4" height="50" fill="black"/>
                            <rect x="192" y="5" width="1" height="50" fill="black"/>
                            <rect x="195" y="5" width="2" height="50" fill="black"/>
                            <rect x="200" y="5" width="3" height="50" fill="black"/>
                            <rect x="205" y="5" width="1" height="50" fill="black"/>
                            <rect x="210" y="5" width="2" height="50" fill="black"/>
                            <rect x="215" y="5" width="3" height="50" fill="black"/>
                            <rect x="220" y="5" width="1" height="50" fill="black"/>
                            <rect x="225" y="5" width="4" height="50" fill="black"/>
                            <rect x="232" y="5" width="1" height="50" fill="black"/>
                            <rect x="235" y="5" width="3" height="50" fill="black"/>
                            <rect x="242" y="5" width="2" height="50" fill="black"/>
                        </svg>
                    </div>
                    <div class="ticket-id">TKT-25479631${seat.seat_code}</div>
                </div>
                <a href="javascript:print('${seat.seat_code}')" class="view-details">Print</a>
                <a href="javascript:cacelTicket('${seat.seat_code}')" class="view-details2 cancel-button" data-seat-code="${seat.seat_code}">Cancel</a>
            </div>
        </div>
    `;
    document.getElementById('cons').innerHTML += innerHTML;

}

function print(seatCode) {
    var div=document.getElementById('ticket'+seatCode);
    if (!div) {
        alert('Corresponding seat ticket information not found');
        return;
    }

    // Create jsPDF instance
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Add div content to PDF
    doc.html(div, {
        callback: function (doc) {
            // Save PDF
            doc.save('ticket_' + seatCode + '.pdf');
        },
        margin: [10, 10, 10, 10],
        autoPaging: 'text',
        x: 10,
        y: 10,
        html2canvas: {
            scale: 0.3
        }
    });
}

function cacelTicket(seatCode) {
    // Implement seat cancellation logic
    if (confirm('Are you sure you want to cancel this seat?')) {
        fetch(`/index.php/movie/seat/delete?seat_code=${seatCode}`, {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Seat cancelled successfully!');
                window.location.reload();
            } else {
                alert('Seat cancellation failed: ' + (data.message || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Request error:', error);
            alert('An error occurred, please try again later.');
        });
    }
}

function getCurrentUserCode() {
    // Get current user ID from cookie or localStorage
    return localStorage.getItem('userId') || 0;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB');
}

function getStarRating(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    return '★'.repeat(fullStars) + (hasHalfStar ? '½' : '') + '☆'.repeat(5 - fullStars - (hasHalfStar ? 1 : 0));
}
