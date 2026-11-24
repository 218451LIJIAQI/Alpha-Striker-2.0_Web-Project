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
    const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
    const tabContents = document.querySelectorAll('.tab-content');
    if (!tabBtns.length) return;

    function activateTab(btn) {
      const target = btn.getAttribute('data-tab');
      tabBtns.forEach(function (b) {
        const isActive = b === btn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', String(isActive));
        b.setAttribute('tabindex', isActive ? '0' : '-1');
      });
      tabContents.forEach(function (c) {
        c.classList.toggle('active', c.id === target + '-tab');
      });
    }

    tabBtns.forEach(function (btn, idx) {
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(btn.classList.contains('active')));
      btn.setAttribute('tabindex', btn.classList.contains('active') ? '0' : '-1');
      btn.addEventListener('click', function () {
        activateTab(btn);
      });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          const next = tabBtns[(idx + dir + tabBtns.length) % tabBtns.length];
          activateTab(next);
          next.focus();
        }
      });
    });
  }

  function renderAmenityCards(items, esc) {
    return items.map(function (item) {
      return (
        '<div class="amenity-card">' +
        (item.icon ? '<div class="amenity-icon"><i class="' + item.icon + '" aria-hidden="true"></i></div>' : '') +
        '<div><h4>' + esc(item.title) + '</h4><p>' + esc(item.desc) + '</p></div>' +
        '</div>'
      );
    }).join('');
  }

  function renderNotFoundState(message) {
    const root = document.querySelector('.theater-detail-container');
    if (!root) return;
    const esc = window.CineTicket.escapeHtml;
    root.innerHTML =
      '<div class="detail-card empty-context-card">' +
      '<h2>Theater Not Found</h2>' +
      '<p>' + esc(message || 'The requested partner cinema could not be located.') + '</p>' +
      '<a href="theater.html" class="btn-primary">Browse All Theaters</a>' +
      '</div>';
  }

  function renderTheaterPage(theater) {
    const CT = window.CineTicket;
    const esc = CT.escapeHtml;
    const theaterId = parseInt(theater.theater_code, 10) || 1;
    const movies = Array.isArray(theater.movies) ? theater.movies : [];
    const defaultMovieCode = movies.length > 0 ? movies[0].movie_code : 1;
    const vrParams = new URLSearchParams({
      movie_code: String(defaultMovieCode),
      theater_code: String(theaterId),
    });
    const vrHref = '3d-model.html?' + vrParams.toString();
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
        '<span class="tabular-nums">' + esc(theater.star) + '/5 (' + esc(formatReviewCount(theater.reviews)) + ')</span>' +
        '</div>' +
        '<div class="theater-address-hero">' +
        '<i class="fas fa-map-marker-alt" aria-hidden="true"></i>' +
        '<span>' + esc(theater.address) + (theater.distance ? ' • ' + esc(theater.distance) : '') + '</span>' +
        '</div>' +
        '<div class="hero-actions">' +
        '<a href="#now-showing-section" class="btn-primary"><i class="fas fa-ticket-alt" aria-hidden="true"></i> Browse Showtimes</a>' +
        '<button type="button" class="btn-secondary" id="hero-vr-btn"><i class="fas fa-vr-cardboard" aria-hidden="true"></i> 3D Auditorium Tour</button>' +
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
          '<div class="info-icon"><i class="' + item.icon + '" aria-hidden="true"></i></div>' +
          '<div class="info-details"><h4 class="tabular-nums">' + esc(item.value) + '</h4><p>' + esc(item.label) + '</p></div>' +
          '</div>'
        );
      }).join('');
    }

    const moviesList = document.getElementById('movies-list');
    if (moviesList) {
      moviesList.innerHTML = !movies.length
        ? '<div class="grid-empty-state"><p>Schedule updating — check back soon for upcoming screenings.</p></div>'
        : movies.map(function (movie) {
            const price = movie.money !== undefined ? '$' + parseFloat(movie.money).toFixed(2) : '$39.00';
            const bookingHref = 'booking3.html?movie_code=' + encodeURIComponent(movie.movie_code) + '&theater_code=' + encodeURIComponent(theaterId);
            return (
              '<article class="movie-card detail-card schedule-card">' +
              '<div class="schedule-poster-wrap">' +
              '<img src="' + esc(CT.resolveAssetUrl(movie.img)) + '" alt="' + esc(movie.movie_name) + '" loading="lazy">' +
              '</div>' +
              '<div class="schedule-card-body">' +
              '<h3>' + esc(movie.movie_name) + '</h3>' +
              '<div class="schedule-card-meta">' +
              '<span><i class="fas fa-film" aria-hidden="true"></i> ' + esc(movie.movie_type) + '</span>' +
              '<span><i class="fas fa-clock" aria-hidden="true"></i> ' + esc(movie.times) + '</span>' +
              '</div>' +
              '<div class="schedule-card-price tabular-nums">' + esc(String(movie.daily_showtimes || 4)) + ' showtimes daily • ' + esc(price) + '</div>' +
              '<a href="' + esc(bookingHref) + '" class="btn-primary schedule-book-btn">Book Seats</a>' +
              '</div>' +
              '</article>'
            );
          }).join('');
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
        { icon: 'fas fa-tv', title: '4K RGB Laser Projection', desc: 'HDR contrast ratio exceeding 1,000,000:1 on silver screens.' },
        { icon: 'fas fa-volume-up', title: 'Immersive Spatial Audio', desc: '64-channel object-oriented speaker arrays calibrated daily.' },
        { icon: 'fas fa-layer-group', title: 'Acoustic Isolation', desc: 'THX-grade wall baffling eliminates cross-auditorium bleed.' },
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
        return '<div class="detail-list-row tabular-nums' + (row.idx === todayIdx ? ' is-today' : '') + '"><span>' + row.d + '</span><span>' + row.h + '</span></div>';
      }).join('');
    }

    const pricingEl = document.getElementById('ticket-pricing');
    if (pricingEl) {
      const validPrices = movies
        .map(function (m) { return parseFloat(m.money); })
        .filter(function (v) { return Number.isFinite(v) && v >= 0; });
      const basePrice = validPrices.length ? Math.min.apply(null, validPrices) : 39.0;
      const studentPrice = Math.max(0, +(basePrice - 5).toFixed(2));
      const groupSeatPrice = +(basePrice * 0.7).toFixed(2);

      pricingEl.innerHTML = [
        { label: 'Standard Reserved', price: '$' + basePrice.toFixed(2) },
        { label: 'Student Pass ($5 Off)', price: '$' + studentPrice.toFixed(2) },
        { label: 'Group 5+ Tickets (30% Off)', price: '$' + groupSeatPrice.toFixed(2) },
      ].map(function (tier) {
        return '<div class="detail-list-row bordered tabular-nums"><span>' + esc(tier.label) + '</span><strong>' + esc(tier.price) + '</strong></div>';
      }).join('');
    }

    const contactEl = document.getElementById('contact-info');
    if (contactEl) {
      contactEl.innerHTML =
        '<p class="contact-line"><i class="fas fa-phone" aria-hidden="true"></i> +60 17-607 3401</p>' +
        '<p class="contact-line"><i class="fas fa-envelope" aria-hidden="true"></i> lijiaqi0807@gmail.com</p>' +
        '<p class="contact-line"><i class="fas fa-map-pin" aria-hidden="true"></i> ' + esc(theater.address) + '</p>';
    }

    const locationEl = document.getElementById('location-section');
    if (locationEl) {
      const mapQuery = encodeURIComponent(theater.theater_name + ' ' + theater.address);
      locationEl.innerHTML =
        '<div class="detail-card location-card">' +
        '<div><h3>' + esc(theater.theater_name) + '</h3><p>' + esc(theater.address) + '</p></div>' +
        '<a href="https://www.google.com/maps/search/?api=1&query=' + mapQuery + '" target="_blank" rel="noopener noreferrer" class="btn-primary"><i class="fas fa-directions" aria-hidden="true"></i> Open in Google Maps</a>' +
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
        '<a href="' + esc(vrHref) + '" class="btn-primary vr-launch-link"><i class="fas fa-vr-cardboard" aria-hidden="true"></i> Launch 3D Seat Preview</a>' +
        '</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    initTabs();
    const rawCode = new URLSearchParams(window.location.search).get('theater_code') || '1';
    if (!/^\d+$/.test(rawCode) || parseInt(rawCode, 10) <= 0) {
      renderNotFoundState('Invalid theater identifier.');
      return;
    }

    try {
      const payload = await window.CineTicket.fetchJson(
        '/index.php/theater/theater/getTheaterDetails?theater_code=' + encodeURIComponent(rawCode)
      );
      if (payload.success && payload.data) {
        renderTheaterPage(payload.data);
      } else {
        window.showToast(payload.message || 'Theater not found', 'error');
        renderNotFoundState(payload.message);
      }
    } catch (_) {
      window.showToast('Failed to load theater details', 'error');
    }
  });
})();
