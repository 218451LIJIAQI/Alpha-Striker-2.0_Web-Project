/**
 * Theater Details & Live Screening Schedule Controller
 * Replaces inline <script> in theater-details.html and populates live theater_movie screenings.
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

  function starIcons(score) {
    const rating = Math.max(0, Math.min(5, parseFloat(score) || 4.8));
    const full = Math.floor(rating);
    const half = rating - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    let html = '';
    for (let i = 0; i < full; i++) html += '<i class="fas fa-star"></i>';
    if (half) html += '<i class="fas fa-star-half-alt"></i>';
    for (let i = 0; i < empty; i++) html += '<i class="far fa-star"></i>';
    return html;
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
        const panel = document.getElementById(target + '-tab');
        if (panel) panel.classList.add('active');
      });
    });
  }

  function renderTheaterPage(theater) {
    const esc = window.CineTicket.escapeHtml;
    const resolveAsset = window.CineTicket.resolveAssetUrl;
    const theaterId = parseInt(theater.theater_code, 10) || 1;
    const amenities = (theater.amenity || '')
      .split(',')
      .map(function (a) { return a.trim(); })
      .filter(Boolean);

    // Deterministic auditorium metrics derived from theater_code (never Math.random())
    const screenCount = 8 + (theaterId % 5) * 2;
    const totalSeats = screenCount * 96;
    const parkingSpots = 180 + theaterId * 35;

    const hero = document.getElementById('theater-hero');
    if (hero) {
      hero.innerHTML =
        '<div class="hero-background">' +
        '<img src="' + esc(resolveAsset(theater.img)) + '" alt="' + esc(theater.theater_name) + '">' +
        '<div class="hero-overlay"></div>' +
        '</div>' +
        '<div class="hero-content">' +
        '<div class="theater-badge">' + (parseFloat(theater.star) >= 4.8 ? 'FLAGSHIP CINEMA' : 'PARTNER THEATER') + '</div>' +
        '<h1 class="theater-name">' + esc(theater.theater_name) + '</h1>' +
        '<div class="theater-subtitle">Immersive sight, sound, and reserved recliner comfort</div>' +
        '<div class="theater-rating-hero">' +
        '<div class="stars">' + starIcons(theater.star) + '</div>' +
        '<span>' + esc(theater.star) + '/5 (' + esc(formatReviewCount(theater.reviews)) + ')</span>' +
        '</div>' +
        '<div class="theater-address-hero">' +
        '<i class="fas fa-map-marker-alt"></i>' +
        '<span>' + esc(theater.address) + (theater.distance ? ' • ' + esc(theater.distance) : '') + '</span>' +
        '</div>' +
        '<div class="hero-actions">' +
        '<a href="#now-showing-section" class="btn-primary" style="text-decoration:none;"><i class="fas fa-ticket-alt"></i> Browse Showtimes</a>' +
        '<button type="button" class="btn-secondary" id="hero-vr-btn"><i class="fas fa-vr-cardboard"></i> 3D Auditorium Tour</button>' +
        '</div>' +
        '</div>';

      const vrBtn = document.getElementById('hero-vr-btn');
      if (vrBtn) {
        vrBtn.addEventListener('click', function () {
          window.location.href = '3d-model.html';
        });
      }
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

    // Live Now Showing Movies from theater_movie join
    const moviesList = document.getElementById('movies-list');
    if (moviesList) {
      const movies = Array.isArray(theater.movies) ? theater.movies : [];
      if (!movies.length) {
        moviesList.innerHTML = '<p>Schedule updating — check back soon for upcoming screenings.</p>';
      } else {
        moviesList.innerHTML = movies.map(function (movie) {
          const price = movie.money !== undefined ? '$' + parseFloat(movie.money).toFixed(2) : '$39.00';
          const bookingHref =
            'booking3.html?movie_code=' + encodeURIComponent(movie.movie_code) +
            '&theater_code=' + encodeURIComponent(theaterId);
          return (
            '<div class="movie-card detail-card" style="display:flex; flex-direction:column; border-radius:14px; overflow:hidden; border:1px solid rgba(148,163,184,0.22);">' +
            '<img src="' + esc(resolveAsset(movie.img)) + '" alt="' + esc(movie.movie_name) + '" style="width:100%; height:240px; object-fit:cover;">' +
            '<div style="padding:16px; display:flex; flex-direction:column; gap:8px; flex:1;">' +
            '<h3 style="font-size:17px; margin:0;">' + esc(movie.movie_name) + '</h3>' +
            '<div style="font-size:13px; opacity:0.8; display:flex; justify-content:space-between;">' +
            '<span><i class="fas fa-film"></i> ' + esc(movie.movie_type) + '</span>' +
            '<span><i class="fas fa-clock"></i> ' + esc(movie.times) + '</span>' +
            '</div>' +
            '<div style="font-size:13px; font-weight:600; color:#4361ee;">' +
            esc(String(movie.daily_showtimes || 4)) + ' showtimes daily • ' + esc(price) +
            '</div>' +
            '<a href="' + esc(bookingHref) + '" class="btn-primary" style="margin-top:auto; text-align:center; text-decoration:none; padding:10px 14px; border-radius:8px; background:#4361ee; color:#fff; font-weight:600;">Book Seats</a>' +
            '</div>' +
            '</div>'
          );
        }).join('');
      }
    }

    // Facilities Tab
    const amenitiesGrid = document.getElementById('amenities-grid');
    if (amenitiesGrid) {
      amenitiesGrid.innerHTML = amenities.map(function (name) {
        const meta = AMENITY_META[name] || {
          icon: 'fas fa-check-circle',
          desc: 'Available across dedicated auditoriums at this location.',
        };
        return (
          '<div class="amenity-card">' +
          '<div class="amenity-icon"><i class="' + meta.icon + '"></i></div>' +
          '<h4>' + esc(name) + '</h4>' +
          '<p>' + esc(meta.desc) + '</p>' +
          '</div>'
        );
      }).join('');
    }

    // Technical Specifications Tab
    const techGrid = document.getElementById('tech-specs-grid');
    if (techGrid) {
      techGrid.innerHTML = [
        { title: '4K RGB Laser Projection', detail: 'HDR contrast ratio exceeding 1,000,000:1 on silver screens.' },
        { title: 'Immersive Spatial Audio', detail: '64-channel object-oriented speaker arrays calibrated daily.' },
        { title: 'Acoustic Isolation', detail: 'THX-grade wall baffling eliminates cross-auditorium bleed.' },
      ].map(function (spec) {
        return '<div class="amenity-card"><h4>' + esc(spec.title) + '</h4><p>' + esc(spec.detail) + '</p></div>';
      }).join('');
    }

    // Dining Tab (uses icon cards rather than non-existent image paths)
    const diningEl = document.getElementById('dining-info');
    if (diningEl) {
      diningEl.innerHTML =
        '<div class="amenities-grid">' +
        '<div class="amenity-card"><div class="amenity-icon"><i class="fas fa-popcorn"></i></div><h4>Signature Concessions</h4><p>Freshly popped gourmet kettle corn, artisan nachos, and fountain beverages.</p></div>' +
        '<div class="amenity-card"><div class="amenity-icon"><i class="fas fa-hamburger"></i></div><h4>Hot Kitchen</h4><p>Handcrafted sliders, flatbread pizzas, and crispy tenders prepared to order.</p></div>' +
        '<div class="amenity-card"><div class="amenity-icon"><i class="fas fa-mug-hot"></i></div><h4>Espresso &amp; Lounge</h4><p>Specialty coffee, smoothies, and dessert pairings before or after your film.</p></div>' +
        '</div>';
    }

    // Accessibility Tab
    const accessEl = document.getElementById('accessibility-info');
    if (accessEl) {
      accessEl.innerHTML =
        '<div class="amenities-grid">' +
        '<div class="amenity-card"><div class="amenity-icon"><i class="fas fa-wheelchair"></i></div><h4>Step-Free Seating</h4><p>Barrier-free elevator access, companion seating, and wide auditorium aisles.</p></div>' +
        '<div class="amenity-card"><div class="amenity-icon"><i class="fas fa-closed-captioning"></i></div><h4>Closed Captioning &amp; Audio</h4><p>Personal closed-caption displays and assistive listening headsets at Guest Services.</p></div>' +
        '</div>';
    }

    // Safety Tab
    const safetyEl = document.getElementById('safety-measures');
    if (safetyEl) {
      safetyEl.innerHTML =
        '<div class="amenities-grid">' +
        '<div class="amenity-card"><div class="amenity-icon"><i class="fas fa-wind"></i></div><h4>HEPA Air Filtration</h4><p>Continuous MERV-13 fresh air exchange across all auditoriums and lobbies.</p></div>' +
        '<div class="amenity-card"><div class="amenity-icon"><i class="fas fa-shield-alt"></i></div><h4>24/7 On-Site Security</h4><p>Trained guest-safety staff, illuminated aisle guidance, and medical kits on every floor.</p></div>' +
        '</div>';
    }

    // Operating Hours, Pricing, Contact
    const todayIdx = new Date().getDay();
    const hoursEl = document.getElementById('operating-hours');
    if (hoursEl) {
      const days = [
        { d: 'Monday', h: '10:00 AM - 11:00 PM', idx: 1 },
        { d: 'Tuesday', h: '10:00 AM - 11:00 PM', idx: 2 },
        { d: 'Wednesday', h: '10:00 AM - 11:00 PM', idx: 3 },
        { d: 'Thursday', h: '10:00 AM - 11:00 PM', idx: 4 },
        { d: 'Friday', h: '10:00 AM - 12:00 AM', idx: 5 },
        { d: 'Saturday', h: '09:00 AM - 12:00 AM', idx: 6 },
        { d: 'Sunday', h: '09:00 AM - 11:00 PM', idx: 0 },
      ];
      hoursEl.innerHTML = days.map(function (row) {
        const bold = row.idx === todayIdx ? ' style="font-weight:700; color:#4361ee;"' : '';
        return '<div style="display:flex; justify-content:space-between; padding:6px 0;"' + bold + '><span>' + row.d + '</span><span>' + row.h + '</span></div>';
      }).join('');
    }

    const pricingEl = document.getElementById('ticket-pricing');
    if (pricingEl) {
      pricingEl.innerHTML = [
        { label: 'Standard Reserved', price: '$39.00' },
        { label: 'Student Pass (STUDENT30)', price: '$34.00' },
        { label: 'Group 5+ Tickets (30% Off)', price: '$27.30' },
      ].map(function (tier) {
        return '<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(148,163,184,0.2);"><span>' + esc(tier.label) + '</span><strong>' + esc(tier.price) + '</strong></div>';
      }).join('');
    }

    const contactEl = document.getElementById('contact-info');
    if (contactEl) {
      contactEl.innerHTML =
        '<p style="margin:8px 0;"><i class="fas fa-phone"></i> +60 17-607 3401</p>' +
        '<p style="margin:8px 0;"><i class="fas fa-envelope"></i> lijiaqi0807@gmail.com</p>' +
        '<p style="margin:8px 0;"><i class="fas fa-map-pin"></i> ' + esc(theater.address) + '</p>';
    }

    const locationEl = document.getElementById('location-section');
    if (locationEl) {
      const mapQuery = encodeURIComponent(theater.theater_name + ' ' + theater.address);
      locationEl.innerHTML =
        '<div class="detail-card" style="padding:24px; border-radius:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">' +
        '<div><h3 style="margin-bottom:6px;">' + esc(theater.theater_name) + '</h3><p>' + esc(theater.address) + '</p></div>' +
        '<a href="https://www.google.com/maps/search/?api=1&query=' + mapQuery + '" target="_blank" rel="noopener noreferrer" class="btn-primary" style="text-decoration:none; padding:10px 18px; border-radius:8px; background:#4361ee; color:#fff; font-weight:600;"><i class="fas fa-directions"></i> Open in Google Maps</a>' +
        '</div>';
    }

    const reviewsEl = document.getElementById('reviews-section');
    if (reviewsEl) {
      const sampleReviews = [
        { author: 'Sarah Johnson', stars: 5, text: 'Crystal-clear laser projection and spotless recliner seating. Arrived 10 minutes before showtime and scanned right in.' },
        { author: 'Michael Chen', stars: 5, text: 'Acoustic balance in the main hall is superb, and reserving seats online took less than a minute.' },
      ];
      reviewsEl.innerHTML =
        '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:18px;">' +
        sampleReviews.map(function (r) {
          return (
            '<div class="review-card detail-card" style="padding:20px; border-radius:14px;">' +
            '<div style="display:flex; justify-content:space-between; margin-bottom:8px;"><strong>' + esc(r.author) + '</strong><span style="color:#f59e0b;">' + '★'.repeat(r.stars) + '</span></div>' +
            '<p style="margin:0;">' + esc(r.text) + '</p>' +
            '</div>'
          );
        }).join('') +
        '</div>';
    }

    const vrSection = document.getElementById('virtual-tour');
    if (vrSection) {
      vrSection.innerHTML =
        '<div class="detail-card" style="padding:28px; border-radius:14px; text-align:center;">' +
        '<h3 style="margin-bottom:8px;">Interactive 3D Auditorium Preview</h3>' +
        '<p style="margin-bottom:18px;">Inspect sightlines from every row before locking in your seats.</p>' +
        '<a href="3d-model.html" class="btn-primary" style="display:inline-flex; align-items:center; gap:8px; text-decoration:none; padding:12px 24px; border-radius:999px; background:#4361ee; color:#fff; font-weight:600;"><i class="fas fa-vr-cardboard"></i> Launch 3D Seat Preview</a>' +
        '</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTabs();

    const params = new URLSearchParams(window.location.search);
    const theaterCode = params.get('theater_code') || '1';

    fetch('/index.php/theater/theater/getTheaterDetails?theater_code=' + encodeURIComponent(theaterCode))
      .then(function (res) { return res.json(); })
      .then(function (payload) {
        if (payload.success && payload.data) {
          renderTheaterPage(payload.data);
        } else {
          window.showToast(payload.message || 'Theater not found', 'error');
        }
      })
      .catch(function () {
        window.showToast('Failed to load theater details', 'error');
      });
  });
})();
