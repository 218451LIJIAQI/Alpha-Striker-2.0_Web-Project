# 🍿 CineTix

Invite one more friend. At the demo price of **$39 a seat**, four tickets come to **$158.50** with the service fee. Five come to **$139.00**. The fifth seat switches on a group discount. Send that receipt to the friend who always answers “maybe.” 🎟️

CineTix is the **SSE3308-1 group project by Alpha Striker 2.0**. A moviegoer can browse films, inspect row sightlines in 3D, pick seats, apply movie-eligible promo codes, and print digital tickets. Behind the counter, cinema staff manage films, theater schedules, promotions, customers, and seat reservations. The seeded programme gives you seven movies, six theaters, and five offers to explore. [Demo programme and schema](movies.sql)

## 🎬 Plan a night at the movies

| Stop | What to try |
| --- | --- |
| 🎞️ **Pick the film** | Search the catalogue by title, genre, or highlight tag, or browse upcoming releases and set reminders. |
| 📍 **Choose the theater** | Compare locations and amenities, inspect each theater’s active screening schedule, and launch the interactive 3D auditorium sightline simulator (with optional Sketchfab cloud mesh when online). |
| 💺 **Find a seat** | The seating chart runs from **A1 to H12** (up to 10 seats per order, keyboard-accessible). Rows **D and E** are marked Prime VIP. Switching theaters, dates, or showtimes dynamically updates available showtime slots and occupied seats. |
| 🏷️ **Try an offer** | Apply a promo code at checkout. Both the promo check and final seat booking verify expiration, member exclusivity, and `movie_offer` film eligibility on the server before computing the authoritative receipt total. |
| 🎫 **Take the ticket home** | Signed-in customers can revisit their ticket wallet, cancel their own booked seats, or print/export individual tickets as PDFs. Guest checkouts can also print their current-session pass immediately. |

The public site includes account registration, session-backed sign-in, one-time OTP password reset (plus current-password updates for signed-in members), reversible light/dark themes, and shared desktop navigation. [Theater details](public/js/theater/theaterdetail.js) · [3D auditorium](public/pages/3d-model.html) · [Ticket wallet](public/js/ticket/ticket.js)

## 🧾 The five-friend receipt

Here’s what the checkout displays for five $39 seats with a valid $5 offer. The 30% group discount starts at five seats and applies to the ticket subtotal. The service fee is a flat $2.50 per checkout.

```text
CineTix  •  Five seats for movie night
──────────────────────────────────────
5 tickets × $39.00             $195.00
Group discount, 30%            −$58.50
Promo offer                     −$5.00
Service fee                     +$2.50
──────────────────────────────────────
Total                          $134.00
```

The seat picker, checkout preview, and backend booking controller share the exact same pricing rules. During `saveSeats`, the server re-verifies movie pricing, group savings, and `movie_offer` promo eligibility, commits the seat reservation transaction, and returns the authoritative receipt reference and total. [Pricing helper](public/js/common.js) · [Checkout controller](public/js/pay/pay.js) · [Server pricing & validation](application/common/controller/ApiController.php)

## 🪑 Two browsers, one A4

Two friends can see A4 available a moment apart. Clicking the square updates the browser. **The reservation becomes final when the database transaction commits.**

1. The PHP controller normalizes seat coordinates (`A1–H12`), enforces the 10-seat per-order cap, and verifies the `theater_movie` schedule and `movie_offer` promo constraints.
2. It locks and checks conflicts within the same **film, theater, date, and showtime** (`SELECT ... FOR UPDATE`), returning HTTP `409 Conflict` if any requested seat is already taken or hits the composite unique key `uk_seat_booking`.
3. On the frontend, each seat-availability fetch carries a monotonically increasing sequence ID so out-of-order responses or errors from an earlier showtime never overwrite the active screening. [Seat map updates](public/js/booking3/booking3.js) · [Seat controller](application/movie/controller/Seat.php)

## 🔦 A peek into the projection booth

| Part | What it does |
| --- | --- |
| **Public website** | Plain HTML, CSS, and JavaScript serve the catalogue, theater pages, 3D sightline stage, checkout, gift card builder, upcoming releases, and ticket wallet with distinct loading, empty, and retryable error states. |
| **Booking API** | ThinkPHP 5.1 controllers expose movie, theater, offer, user, and seat operations. `ApiController` centralizes scalar input sanitization, date/asset validation, promo verification, and pricing. |
| **Cinema database** | MySQL (`movies.sql`) stores `t_movies`, `t_theater`, `t_offer`, `t_user`, `t_seat`, `theater_movie`, and `movie_offer` with foreign keys and composite unique constraints. |
| **Staff console** | Session rotation plus strict `X-Admin-Token` CSRF protection guard all admin CRUD endpoints. Staff manage films (with `theater_movie` schedules), offers (with `movie_offer` film scoping), theaters, customers, and reservations. |

Start reading at the [seat picker](public/js/booking3/booking3.js), [shared API controller](application/common/controller/ApiController.php), or [staff dashboard](public/admin/dashboard.html).

## 🎥 Run a local screening

Use **PHP 7.4+ with PDO MySQL**, a fresh local MySQL database, and a Composer environment compatible with the **1.x plugin API** required by the locked ThinkPHP installer. Database credentials and optional auth settings (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AUTH_EXPOSE_DEMO_CODE`) can be configured via environment variables. [Dependency lock](composer.lock) · [Database settings](config/database.php)

```sh
composer install
mysql -u root -p < movies.sql
php -S 127.0.0.1:8000 -t public public/router.php
```

Open `http://127.0.0.1:8000` for the box office or `http://127.0.0.1:8000/admin/login.html` for the staff entrance.

<details>
<summary>🧪 Give the box office a dress rehearsal</summary>

From the repository root, run `python3 tests/static_audit.py` for the SQL schema, ThinkPHP table-prefix & API contracts, JavaScript syntax, and local page assets. Run `node --test tests/frontend_unit.test.mjs` for shared frontend unit tests. Run `python3 tests/e2e_browser_test.py` for the headless Chromium Selenium suite backed by the 1:1 SQLite contract server. [Browser suite](tests/e2e_browser_test.py) · [Contract server](tests/mock_thinkphp_server.py)

</details>
