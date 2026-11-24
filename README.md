# 🍿 CineTix

Invite one more friend. At the demo price of **$39 a seat**, four tickets come to **$158.50** with the service fee. Five come to **$139.00**. The fifth seat switches on a group discount. Send that receipt to the friend who always answers “maybe.” 🎟️

CineTix is the **SSE3308-1 group project by Alpha Striker 2.0** (Desktop Web Application). A moviegoer can browse films, inspect a theater’s 3D sightlines offline or online, pick seats by mouse or 2D keyboard navigation, redeem movie- and member-scoped promos, and print a digital ticket. Behind the counter, cinema staff manage films, partner theaters, promotions, customers, and seat reservations with non-destructive schedule syncing and formula-safe CSV exports. The seeded programme gives you seven movies, six theaters, and five offers to explore. [Demo programme and schema](movies.sql)

## 🎬 Plan a night at the movies

| Stop | What to try |
| --- | --- |
| 🎞️ **Pick the film** | Search the catalogue by title or select a genre. Open a film to start planning a screening. |
| 📍 **Choose the theater** | Compare locations and amenities, inspect a theater’s showtimes, and launch its interactive **CSS-3D auditorium preview** (works 100% offline across all 96 seats A1–H12, with optional Sketchfab mesh when online). |
| 💺 **Find a seat** | The seating chart runs from **A1 to H12** (max 10 seats per transaction). Rows **D and E** are marked Prime VIP. Changing the screening refreshes occupied seats safely, and returning from checkout restores your selection. |
| 🏷️ **Try an offer** | Enter a promo code at checkout. The server verifies expiry, movie applicability (`movie_offer`), and optional member exclusivity (`user_code`) before computing the authoritative receipt total. |
| 🎫 **Take the ticket home** | Signed-in customers can revisit their session-verified ticket wallet, cancel their own booked seats atomically, or print an individual ticket via the browser’s **Save as PDF** layout. |

The public site includes account registration, session-rotated sign-in with open-redirect sanitization, dynamic 6-digit password reset codes (plus current-password updates for signed-in members), gift card customization, premiere reminders, searchable FAQs, and reversible WCAG AA light/dark themes. [Theater details](public/js/theater/theaterdetail.js) · [3D auditorium](public/pages/3d-model.html) · [Ticket wallet](public/js/ticket/ticket.js)

## 🧾 The five-friend receipt

Here’s what checkout computes for five $39 seats with a valid $5 offer. The 30% group discount starts at five seats and applies to the ticket subtotal. The service fee is a flat $2.50 per checkout.

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

Both the browser and `ApiController` run the same cent-rounded pricing formula (`ROUND_HALF_UP`), while `Seat::saveSeats` performs the authoritative calculation inside the booking transaction and issues the receipt reference. [Shared API controller](application/common/controller/ApiController.php) · [Checkout controller](public/js/pay/pay.js) · [Offer validation](application/offer/controller/Offer.php)

## 🪑 Two browsers, one A4

Two friends can see A4 available a moment apart. Clicking the square updates the browser. **The reservation becomes final when the database transaction commits.**

1. The PHP controller normalizes requested coordinates (`A1`–`H12`, max 10), sorts them naturally, removes duplicates, and verifies the `theater_movie` schedule.
2. It locks and checks conflicts within the same **film, theater, date, and showtime**, and validates any submitted promo code inside the transaction.
3. It writes the group’s seats atomically. Both row-level locks and the composite unique key `uk_seat_booking` guard against concurrent races, rolling back conflicting transactions and returning `409 Conflict` with `conflict_seats`.

[Seat controller](application/movie/controller/Seat.php) · [Database constraint](movies.sql) · [Static and relational checks](tests/static_audit.py)

## 🔦 A peek into the projection booth

| Part | What it does |
| --- | --- |
| **Public website** | Plain HTML, CSS, and JavaScript serve the catalogue, showtime pages, offline 3D sightline viewer, checkout, and tickets. Shared JavaScript handles paths, session sync, themes, escaping, roving keyboard tabs, and cent-exact pricing. |
| **Booking API** | ThinkPHP 5.1 controllers expose movie, theater, offer, user, and seat operations with `ext-mbstring`-free UTF-8 helpers, `SameSite=Lax` cookies, same-origin CSRF checks, 6–72 byte bcrypt bounds, and session rotation. |
| **Cinema database** | MySQL (`Asia/Kuala_Lumpur`) stores the film catalogue, customers, theaters, offers, and seats. `theater_movie` and `movie_offer` connect schedules and promotions with foreign-key integrity and non-destructive metadata retention. |
| **Staff console** | Session + Same-Origin + strict non-empty `X-Admin-Token` protection guards partial-update CRUD operations and OWASP formula-safe CSV exports (`AdminApp.downloadCsv` & `/index.php/admin/seat/exportCsv`). |

Start reading at the [seat picker](public/js/booking3/booking3.js), [shared API controller](application/common/controller/ApiController.php), or [staff dashboard](public/admin/dashboard.html).

## 🎥 Run a local screening

Use **PHP 7.4+ with PDO MySQL**, a local MySQL database, and Composer. Database credentials and optional environment flags (`DATABASE_*`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `CINETIX_EXPOSE_RESET_CODE`) are read via `Env`. [Dependency lock](composer.lock) · [Database settings](config/database.php)

```sh
composer install
mysql -u root -p < movies.sql
php -S 127.0.0.1:8000 -t public public/router.php
```

Open `http://127.0.0.1:8000` for the box office or `http://127.0.0.1:8000/admin/login.html` for the staff entrance.

<details>
<summary>🧪 Give the box office a dress rehearsal</summary>

From the repository root, run `PYTHONDONTWRITEBYTECODE=1 python3 tests/static_audit.py` for schema, 3-way PHP/API route contracts, security invariants, JavaScript syntax, clean CSS tokens, and case-sensitive asset checks. Run `node --test tests/frontend_unit.test.mjs` for 10 frontend unit suites. Run `PYTHONDONTWRITEBYTECODE=1 python3 tests/e2e_browser_test.py` for 12 headless Chromium E2E, desktop viewport/zoom, WCAG AA contrast, and 12-thread seat-race verification suites against the 1:1 SQLite-backed contract server (bound inside isolated ports `4300–4399`). [Browser suite](tests/e2e_browser_test.py) · [Contract server](tests/mock_thinkphp_server.py)

</details>
