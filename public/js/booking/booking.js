   // Toggle seat selection
   function toggleSeat(seat) {
    if (!seat.classList.contains('reserved')) {
        seat.classList.toggle('selected');
        updateSelectedSeats();
    }
}

// Update selected seats display
function updateSelectedSeats() {
    const selectedSeats = document.querySelectorAll('.seat.selected');
    const selectedSeatsInfo = document.getElementById('selectedSeatsInfo');
    const seatTags = document.querySelector('.seat-tags');
    
    // Clear previous seats
    seatTags.innerHTML = '';
    
    // If no seats selected, hide the info box
    if (selectedSeats.length === 0) {
        selectedSeatsInfo.classList.remove('active');
        return;
    }
    
    // Show the info box and add seat tags
    selectedSeatsInfo.classList.add('active');
    
    // Get row and seat index for each selected seat
    selectedSeats.forEach((seat, index) => {
        const row = seat.closest('.seat-row').querySelector('.row-label').textContent;
        const seatIndex = Array.from(seat.parentNode.children)
    });

}

// Jump to 3D
function viewSeatsInVR(){
 window.location.href = "3D Model.html";
}