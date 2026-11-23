/**
 * Theater Details & Live Screening Schedule Controller
 */
(function () {
  'use strict';

  const AMENITY_META = {
    'IMAX': { icon: 'fas fa-expand-arrows-alt', desc: 'Floor-to-ceiling laser projection with crystal clarity.' },
    'Dolby Atmos': { icon: 'fas fa-volume-up', desc: '360-degree object-based spatial cinema audio.' },
    'Recliner Seats': { icon: 'fas fa-couch', desc: 'Heated zero-gravity power leather recliners.' },
    'Recliners': { icon: 'fas fa-couch', desc: 'Spacious luxury power-reclining auditorium seating.' },
    'Food Service': { icon: 'fas fa-utensils', desc: 'Hot artisan snacks and beverages delivered to your seat.' },
    'Dine-In': { icon: 'fas fa-concierge-bell', desc: 'In-auditorium dining service throughout the feature.' },
    '4DX': { icon: 'fas fa-wind', desc: 'Synchronized motion seats and atmospheric effects.' },
    'RPX': { icon: 'fas fa-tv', desc: 'Regal Premium Experience giant screen & surround sound.' },
    'ScreenX': { icon: 'fas fa-panorama', desc: '270-degree panoramic multi-wall projection.' },
    'VIP Seating': { icon: 'fas fa-crown', desc: 'Reserved lounge pods with priority entry.' },
    'Premium Lounge': { icon: 'fas fa-glass-cheers', desc: 'Pre-show lounge with craft beverages.' },
    'Bar': { icon: 'fas fa-wine-glass-alt', desc: 'Signature cocktails, wine, and local draft selections.' },
    'Wine Bar': { icon: 'fas fa-wine-glass', desc: 'Curated wine pairings before and after screenings.' },
  };

  function formatReviewCount(rawReviews) {
    if (!rawReviews) return '150+ reviews';
    const text = String(rawReviews).trim();
    return /review/i.test(text) ? text : text + ' reviews';
  }

  function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const target = btn.getAttribute('data-tab');
        tabBtns.forEach(function (b) { b.classList.remove('active'); });
        tabContents.forEach(function (c) { c.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById(target + '-tab')?.classList.add('active');
      });
    });
  }

  function renderAmenityCards(items, esc) {
    return items.map(function (item) {
      return (
        '<div class="amenity-card">' +
        (item.icon ? '<div class="amenity-icon"><i class="' + item.icon + '"></i></div>' : '') +
        '<div><h4>' + esc(item.title) + '</h4><p>' + esc(item.desc) + '</p></div>' +
        '</div>'
      );
    }).join('');
  }

  function renderTheaterPage(theater) {
    const CT = window.CineTicket;
    const esc = CT.escapeHtml;
    const theaterId = parseInt(theater.theater_code, 10) || 1;
    const vrHref = '3d-model.html?theater_code=' + encodeURIComponent(theaterId);
    const amenities = (theater.amenity || '')
      .split(',')
      .map(function (a) { return a.trim(); })
      .filter(Boolean);

    const screenCount = 8 + (theaterId % 5) * 2;
    const totalSeats = screenCount * 96;
    const parkingSpots = 180 + theaterId * 35;

    const hero = document.getElementById('theater-hero');
    if (hero) {
      hero.innerHTML =
        '<div class="hero-background">' +
        '<img src="' + esc(CT.resolveAssetUrl(theater.img)) + '" alt="' + esc(theater.theater_name) + '">' +
        '<div class="hero-overlay"></div>' +
        '</div>' +
        '<div class="hero-content">' +
        '<div class="theater-badge">' + (parseFloat(theater.star) >= 4.8 ? 'FLAGSHIP CINEMA' : 'PARTNER THEATER') + '</div>' +
        '<h1 class="theater-name">' + esc(theater.theater_name) + '</h1>' +
        '<div class="theater-subtitle">Immersive sight, sound, and reserved recliner comfort</div>' +
        '<div class="theater-rating-hero">' +
        '<div class="stars">' + CT.renderStarIcons(theater.star) + '</div>' +
        '<span>' + esc(theater.star) + '/5 (' + esc(formatReviewCount(theater.reviews)) + ')</span>' +
        '</div>' +
        '<div class="theater-address-hero">' +
        '<i class="fas fa-map-marker-alt"></i>' +
        '<span>' + esc(theater.address) + (theater.distance ? ' • ' + esc(theater.distance) : '') + '</span>' +
        '</div>' +
        '<div class="hero-actions">' +
        '<a href="#now-showing-section" class="btn-primary"><i class="fas fa-ticket-alt"></i> Browse Showtimes</a>' +
        '<button type="button" class="btn-secondary" id="hero-vr-btn"><i class="fas fa-vr-cardboard"></i> 3D Auditorium Tour</button>' +
        '</div>' +
        '</div>';

      document.getElementById('hero-vr-btn')?.addEventListener('click', function () {
        window.location.href = vrHref;
      });
    }

    const quickGrid = document.getElementById('quick-info-grid');
    if (quickGrid) {
      quickGrid.innerHTML = [
        { icon: 'fas fa-film', label: 'Auditoriums', value: screenCount + ' Digital Screens' },
        { icon: 'fas fa-chair', label: 'Capacity', value: totalSeats + ' Reserved Seats' },
        { icon: 'fas fa-parking', label: 'Parking', value: parkingSpots + ' Validated Spaces' },
        { icon: 'fas fa-clock', label: 'Daily Hours', value: '09:00 AM – 12:00 AM' },
      ].map(function (item) {
        return (
          '<div class="quick-info-card detail-card">' +
          '<div class="info-icon"><i class="' + item.icon + '"></i></div>' +
          '<div class="info-details"><h4>' + esc(item.value) + '</h4><p>' + esc(item.label) + '</p></div>' +
          '</div>'
        );
      }).join('');
    }

    const moviesList = document.getElementById('movies-list');
    if (moviesList) {
      const movies = Array.isArray(theater.movies) ? theater.movies : [];
      if (!movies.length) {
        CT.renderStateBlock(
          moviesList,
          'empty',
          'No active screenings at this location today',
          'Check back soon or browse other partner theaters for showtimes.'
        );
      } else {
        moviesList.innerHTML = movies.map(function (movie) {
          const price = movie.money !== undefined ? '$' + parseFloat(movie.money).toFixed(2) : '$39.00';
          const bookingHref = 'booking3.html?movie_code=' + encodeURIComponent(movie.movie_code) + '&theater_code=' + encodeURIComponent(theaterId);
          return (
            '<div class="movie-card detail-card schedule-card">' +
            '<img src="' + esc(CT.resolveAssetUrl(movie.img)) + '" alt="' + esc(movie.movie_name) + '">' +
            '<div class="schedule-card-body">' +
            '<h3>' + esc(movie.movie_name) + '</h3>' +
            '<div class="schedule-card-meta">' +
            '<span><i class="fas fa-film"></i> ' + esc(movie.movie_type) + '</span>' +
            '<span><i class="fas fa-clock"></i> ' + esc(movie.times) + '</span>' +
            '</div>' +
            '<div class="schedule-card-price">' + esc(String(movie.daily_showtimes || 4)) + ' showtimes daily • ' + esc(price) + '</div>' +
            '<a href="' + esc(bookingHref) + '" class="btn-primary schedule-book-btn">Book Seats</a>' +
            '</div>' +
            '</div>'
          );
        }).join('');
      }
    }

    const amenitiesGrid = document.getElementById('amenities-grid');
    if (amenitiesGrid) {
      amenitiesGrid.innerHTML = renderAmenityCards(amenities.map(function (name) {
        const meta = AMENITY_META[name] || { icon: 'fas fa-check-circle', desc: 'Available across dedicated auditoriums at this location.' };
        return { icon: meta.icon, title: name, desc: meta.desc };
      }), esc);
    }

    const techGrid = document.getElementById('tech-specs-grid');
    if (techGrid) {
      techGrid.innerHTML = renderAmenityCards([
        { title: '4K RGB Laser Projection', desc: 'HDR contrast ratio exceeding 1,000,000:1 on silver screens.' },
        { title: 'Immersive Spatial Audio', desc: '64-channel object-oriented speaker arrays calibrated daily.' },
        { title: 'Acoustic Isolation', desc: 'THX-grade wall baffling eliminates cross-auditorium bleed.' },
      ], esc);
    }

    const diningEl = document.getElementById('dining-info');
    if (diningEl) {
      diningEl.innerHTML = '<div class="amenities-grid">' + renderAmenityCards([
        { icon: 'fas fa-popcorn', title: 'Signature Concessions', desc: 'Freshly popped gourmet kettle corn, artisan nachos, and fountain beverages.' },
        { icon: 'fas fa-hamburger', title: 'Hot Kitchen', desc: 'Handcrafted sliders, flatbread pizzas, and crispy tenders prepared to order.' },
        { icon: 'fas fa-mug-hot', title: 'Espresso & Lounge', desc: 'Specialty coffee, smoothies, and dessert pairings before or after your film.' },
      ], esc) + '</div>';
    }

    const accessEl = document.getElementById('accessibility-info');
    if (accessEl) {
      accessEl.innerHTML = '<div class="amenities-grid">' + renderAmenityCards([
        { icon: 'fas fa-wheelchair', title: 'Step-Free Seating', desc: 'Barrier-free elevator access, companion seating, and wide auditorium aisles.' },
        { icon: 'fas fa-closed-captioning', title: 'Closed Captioning & Audio', desc: 'Personal closed-caption displays and assistive listening headsets at Guest Services.' },
      ], esc) + '</div>';
    }

    const safetyEl = document.getElementById('safety-measures');
    if (safetyEl) {
      safetyEl.innerHTML = '<div class="amenities-grid">' + renderAmenityCards([
        { icon: 'fas fa-wind', title: 'HEPA Air Filtration', desc: 'Continuous MERV-13 fresh air exchange across all auditoriums and lobbies.' },
        { icon: 'fas fa-shield-alt', title: '24/7 On-Site Security', desc: 'Trained guest-safety staff, illuminated aisle guidance, and medical kits on every floor.' },
      ], esc) + '</div>';
    }

    const todayIdx = new Date().getDay();
    const hoursEl = document.getElementById('operating-hours');
    if (hoursEl) {
      hoursEl.innerHTML = [
        { d: 'Monday', h: '10:00 AM - 11:00 PM', idx: 1 },
        { d: 'Tuesday', h: '10:00 AM - 11:00 PM', idx: 2 },
        { d: 'Wednesday', h: '10:00 AM - 11:00 PM', idx: 3 },
        { d: 'Thursday', h: '10:00 AM - 11:00 PM', idx: 4 },
        { d: 'Friday', h: '10:00 AM - 12:00 AM', idx: 5 },
        { d: 'Saturday', h: '09:00 AM - 12:00 AM', idx: 6 },
        { d: 'Sunday', h: '09:00 AM - 11:00 PM', idx: 0 },
      ].map(function (row) {
        return '<div class="detail-list-row' + (row.idx === todayIdx ? ' is-today' : '') + '"><span>' + row.d + '</span><span>' + row.h + '</span></div>';
      }).join('');
    }

    const pricingEl = document.getElementById('ticket-pricing');
    if (pricingEl) {
      pricingEl.innerHTML = [
        { label: 'Standard Reserved', price: '$39.00' },
        { label: 'Student Pass (STUDENT30)', price: '$34.00' },
        { label: 'Group 5+ Tickets (30% Off)', price: '$27.30' },
      ].map(function (tier) {
        return '<div class="detail-list-row bordered"><span>' + esc(tier.label) + '</span><strong>' + esc(tier.price) + '</strong></div>';
      }).join('');
    }

    const contactEl = document.getElementById('contact-info');
    if (contactEl) {
      contactEl.innerHTML =
        '<p class="contact-line"><i class="fas fa-phone"></i> +60 17-607 3401</p>' +
        '<p class="contact-line"><i class="fas fa-envelope"></i> lijiaqi0807@gmail.com</p>' +
        '<p class="contact-line"><i class="fas fa-map-pin"></i> ' + esc(theater.address) + '</p>';
    }

    const locationEl = document.getElementById('location-section');
    if (locationEl) {
      const mapQuery = encodeURIComponent(theater.theater_name + ' ' + theater.address);
      locationEl.innerHTML =
        '<div class="detail-card location-card">' +
        '<div><h3>' + esc(theater.theater_name) + '</h3><p>' + esc(theater.address) + '</p></div>' +
        '<a href="https://www.google.com/maps/search/?api=1&query=' + mapQuery + '" target="_blank" rel="noopener noreferrer" class="btn-primary"><i class="fas fa-directions"></i> Open in Google Maps</a>' +
        '</div>';
    }

    const reviewsEl = document.getElementById('reviews-section');
    if (reviewsEl) {
      reviewsEl.innerHTML =
        '<div class="reviews-grid">' +
        [
          { author: 'Sarah Johnson', stars: 5, text: 'Crystal-clear laser projection and spotless recliner seating. Arrived 10 minutes before showtime and scanned right in.' },
          { author: 'Michael Chen', stars: 5, text: 'Acoustic balance in the main hall is superb, and reserving seats online took less than a minute.' },
        ].map(function (r) {
          return (
            '<div class="review-card detail-card">' +
            '<div class="review-card-top"><strong>' + esc(r.author) + '</strong><span class="review-stars">' + '★'.repeat(r.stars) + '</span></div>' +
            '<p>' + esc(r.text) + '</p>' +
            '</div>'
          );
        }).join('') +
        '</div>';
    }

    const vrSection = document.getElementById('virtual-tour');
    if (vrSection) {
      vrSection.innerHTML =
        '<div class="detail-card vr-tour-card">' +
        '<h3>Interactive 3D Auditorium Preview</h3>' +
        '<p>Inspect sightlines from every row before locking in your seats.</p>' +
        '<a href="' + esc(vrHref) + '" class="btn-primary vr-launch-link"><i class="fas fa-vr-cardboard"></i> Launch 3D Seat Preview</a>' +
        '</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    const CT = window.CineTicket;
    const theaterCode = new URLSearchParams(window.location.search).get('theater_code') || '1';
    const moviesList = document.getElementById('movies-list');

    async function loadDetails() {
      CT.renderStateBlock(moviesList, 'loading', 'Loading theater schedule...', 'Fetching auditorium details and today\'s screenings.');
      try {
        const payload = await CT.fetchJson(
          '/index.php/theater/theater/getTheaterDetails?theater_code=' + encodeURIComponent(theaterCode)
        );
        if (payload.success && payload.data) {
          renderTheaterPage(payload.data);
        } else {
          CT.renderStateBlock(
            moviesList,
            'error',
            'Theater details unavailable',
            payload.message || 'The requested theater could not be found.',
            loadDetails
          );
        }
      } catch (_) {
        CT.renderStateBlock(
          moviesList,
          'error',
          'Failed to load theater details',
          'Could not connect to the cinema schedule service.',
          loadDetails
        );
      }
    }

    loadDetails();
  });
})();
