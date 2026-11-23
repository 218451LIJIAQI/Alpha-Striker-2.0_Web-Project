# CineTix — Online Movie Ticket Booking System (Alpha Striker 2.0)

CineTix is a desktop web application for browsing movie screenings, exploring partner theaters and 3D auditorium sightlines, redeeming promotional codes, reserving seats with transactional conflict protection, printing or saving digital tickets, and administering catalog operations.

## Architecture Overview

- **Backend**: PHP 7.1+ / ThinkPHP 5.1 (`application/`, `config/`, `route/`)
  - `app\common\controller\ApiController`: Unified JSON/form request parsing, column whitelisting (`fields_strict` safe), wildcard-safe `LIKE` escaping, string/ID input helpers, consistent `{ success, message, data }` responses, and server-side error logging without stack-trace leakage.
  - `app\admin\controller\BaseAdmin`: Enforces session-backed cryptographic token authentication (`X-Admin-Token` / `Bearer` / session) across all administrative CRUD endpoints (`Movie`, `Offer`, `Seat`, `Theater`, `User`).
  - Domain controllers: `movie` (`Movies`, `Seat`), `theater` (`Theater`), `offer` (`Offer`), `user` (`User`), `index` (`Index`), and `admin` — accessing MySQL directly through ThinkPHP's query builder (`Db::name` / `Db::table`).
- **Database**: MySQL 5.7+ / 8.0 (`movies.sql`, `utf8mb4_unicode_ci`)
  - Core tables: `t_movies`, `t_theater`, `t_offer`, `t_user` (salted `$2y$10$` bcrypt hashes, unique email constraint), `t_seat` (composite unique key `uk_seat_booking` preventing double-booked seats, nullable `user_code` supporting both member and guest checkouts), plus junction tables `theater_movie` and `movie_offer`.
- **Frontend**: Zero-build semantic HTML5, CSS Custom Properties, and modular Vanilla ES6 (`public/`)
  - `public/js/common.js`: Path resolution across root and subdirectories, XSS-safe HTML escaping, JSON API client (`fetchJson`), `AuthStore` session synchronization, flash-free light/dark theme switching, group-discount & star-rating helpers, shared header/footer rendering, FAQ accordions, and toast notifications.
  - `public/js/admin/admin.js`: Admin authentication guard, `X-Admin-Token` API client, shared console navigation, reusable form submission/delete/preview helpers, and offline-capable HTML5 Canvas charts.
  - `public/js/ticket/ticket.js` & `public/css/generate_ticket/generate_ticket.css`: Digital ticket wallet with native vector `@media print` / browser Save-as-PDF ticket isolation.

## Directory Structure

```text
├── application/
│   ├── admin/controller/     # Auth, BaseAdmin, Movie, Offer, Seat, Theater, User
│   ├── common/controller/    # Shared ApiController
│   ├── index/controller/     # Health check endpoint
│   ├── movie/controller/     # Movies & Seat booking/ticket controllers
│   ├── offer/controller/     # Promotional Offer controller
│   ├── theater/controller/   # Partner Theater & schedule controller
│   └── user/controller/      # Customer auth, registration & password reset controller
├── config/                   # Streamlined ThinkPHP 5.1 configuration (utf8mb4, HttpOnly cookies)
├── public/
│   ├── admin/                # 12 administrative console pages
│   ├── css/                  # Semantic stylesheets + dark-mode.css + admin.css
│   ├── img/                  # Movie posters, theater photos, offer banners, icons
│   ├── js/                   # Modular page controllers + common.js
│   ├── pages/                # Customer-facing pages (movies, theaters, seats, checkout, tickets)
│   ├── index.html            # Entry redirect to pages/homepage.html
│   ├── login.html            # Customer sign-in & account registration
│   ├── pwd.html              # Email verification password reset
│   ├── index.php             # ThinkPHP front controller
│   └── router.php            # Built-in PHP server router
├── movies.sql                # Complete schema, constraints, indexes, and seed data
└── tests/                    # Static contract audit, Node unit tests, and Chromium E2E suite
```

## Quick Start (Apache / WAMP / Built-in PHP Server)

1. **Install Framework Vendor Package** (if `thinkphp/` is not already present):
   ```bash
   composer install
   ```
2. **Initialize MySQL Database**:
   ```bash
   mysql -u root -p < movies.sql
   ```
   Configure custom database credentials if needed via environment variables (`DATABASE_HOSTNAME`, `DATABASE_DATABASE`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `DATABASE_HOSTPORT`) or `config/database.php`.
3. **Run Web Server**:
   - **Apache / WAMP / Nginx**: Point the virtual host `DocumentRoot` to the `public/` directory with URL rewriting enabled (`public/.htaccess` is included).
   - **PHP Built-in Server**:
     ```bash
     php -S 127.0.0.1:8000 -t public public/router.php
     ```
4. **Default Demo Accounts**:
   - **Customer Account**: `218451@student.upm.edu.my` / `218451` (Password reset demo code: `888888`)
   - **Admin Console** (`/admin/login.html`): `admin` / `admin` (overrideable via `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` environment variables)

## Key API Endpoints

| Domain | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| Movies | `/index.php/movie/movies/getMovieList` | GET | List movies (optional `genre`) |
| Movies | `/index.php/movie/movies/searchMovies` | GET | Search movies by `keyword` |
| Movies | `/index.php/movie/movies/getMovieByCode` | GET | Single movie details by `movie_code` |
| Theaters | `/index.php/theater/theater/getTheaterList` | GET | List/filter theaters by `address` or `amenity` |
| Theaters | `/index.php/theater/theater/getTheaterDetails` | GET | Theater details + active `theater_movie` showtimes |
| Offers | `/index.php/offer/offer/getOfferList` | GET | List promotional offers (optional `offer_type`) |
| Offers | `/index.php/offer/offer/getMoneyByBadge` | GET | Validate promo code (`badge`) and return discount |
| Seats | `/index.php/movie/seat/getSeatList` | GET | Occupied seats for `(movie_code, theater_code, date, time)` |
| Seats | `/index.php/movie/seat/saveSeats` | POST | Transactional seat booking with conflict detection |
| Seats | `/index.php/movie/seat/getSeatListByUserCode` | GET | User ticket wallet with movie & theater metadata |
| Seats | `/index.php/movie/seat/delete` | POST | Cancel seat booking (owner or admin verified) |
| Users | `/index.php/user/user/{reg,login,logout,changePassword}` | POST | Customer account lifecycle |
| Admin | `/index.php/admin/auth/{login,logout,checkAuth}` | POST | Admin session & token authentication |
| Admin | `/index.php/admin/{movie,offer,seat,theater,user}/*` | GET/POST | Authenticated catalog, booking, and user management |

## Running Automated Verification

```bash
# 1. Static schema, PHP route/field contract, JS syntax & HTML asset audit
python3 tests/static_audit.py

# 2. Frontend runtime unit tests (Node.js built-in test runner)
node --test tests/frontend_unit.test.mjs

# 3. Full-stack SQLite contract server + Headless Chromium Selenium E2E suite
python3 tests/e2e_browser_test.py
```
