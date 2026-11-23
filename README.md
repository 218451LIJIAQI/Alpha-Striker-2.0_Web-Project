# 🍿 CineTix

Invite one more friend. At the demo price of **$39 a seat**, four tickets come to **$158.50** with the service fee. Five come to **$139.00**. The fifth seat switches on a group discount. Send that receipt to the friend who always answers “maybe.” 🎟️

CineTix is the **SSE3308-1 group project by Alpha Striker 2.0**. A moviegoer can browse films, check a theater’s sightlines, pick seats, try a promo and print a digital ticket. Behind the counter, cinema staff manage films, promotions, customers and bookings. The seeded programme gives you seven movies, six theaters and five offers to explore. [Demo programme and schema](movies.sql)

## 🎬 Plan a night at the movies

| Stop | What to try |
| --- | --- |
| 🎞️ **Pick the film** | Search the catalogue by title or select a genre. Open a film to start planning a screening. |
| 📍 **Choose the theater** | Compare locations and amenities, inspect a theater’s showtimes and launch its linked 3D auditorium preview. The preview embeds a Sketchfab model you can rotate before choosing a row. |
| 💺 **Find a seat** | The seating chart runs from **A1 to H12**. Rows **D and E** are marked VIP. Changing the screening refreshes the occupied seats and the booking summary follows your selection. |
| 🏷️ **Try an offer** | Enter a promo code at checkout. The offer controller looks it up and checks its expiry before returning the discount amount. Payment is simulated. |
| 🎫 **Take the ticket home** | Signed-in customers can revisit their ticket wallet, cancel a booked seat or print an individual ticket. The print layout also works with the browser’s **Save as PDF** option. |

The public site includes account registration, sign-in, light and dark themes and shared navigation. The auditorium viewer needs a network connection to load its embedded model. [Theater details](public/js/theater/theaterdetail.js) · [3D auditorium](public/pages/3d-model.html) · [Ticket wallet](public/js/ticket/ticket.js)

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

The seat picker and checkout call the same group-pricing helper. Checkout adds the validated promo and fee, rounds to cents and keeps the total at or above zero. Once the booking succeeds, the browser stores the confirmation receipt for the success page. The seat reservations themselves live in MySQL. [Pricing helper](public/js/common.js) · [Checkout calculation](public/js/pay/pay.js) · [Offer validation](application/offer/controller/Offer.php)

## 🪑 Two browsers, one A4

Two friends can see A4 available a moment apart. Clicking the square updates the browser. **The reservation becomes final when the database transaction commits.**

1. The PHP controller normalizes the requested coordinates, removes repeated entries and checks that the movie and theater exist.
2. It looks for conflicts within the same **film, theater, date and showtime**. A4 at the matinee and A4 at the evening screening are separate seats for booking purposes.
3. It writes the group’s seats in one transaction. A composite unique key includes the screening and seat number, so concurrent requests cannot both claim the same A4. A conflicting group booking rolls back as a unit.

The seat picker has its own timing problem. Switch showtimes twice in a row and the first request might finish last. The browser gives each request a sequence number and only paints the newest result, so a slow reply for the matinee cannot repaint the evening show. [Seat map updates](public/js/booking3/booking3.js)

The database rule has a small, readable test. The static audit loads the seed into SQLite and tries to insert an occupied seat again. [Seat controller](application/movie/controller/Seat.php) · [Database constraint](movies.sql) · [Static and relational checks](tests/static_audit.py)

## 🔦 A peek into the projection booth

| Part | What it does |
| --- | --- |
| **Public website** | Plain HTML, CSS and JavaScript serve the catalogue, showtime pages, checkout and tickets. Shared JavaScript handles paths, themes, escaping and pricing. The browser loads these files directly. |
| **Booking API** | ThinkPHP 5.1 controllers expose movie, theater, offer, user and seat operations. A shared API controller reads request data and formats responses for the browser. |
| **Cinema database** | MySQL stores the film catalogue, customers, offers and seats. Link tables connect theaters to films and films to offers. The seat table also supports guest reservations. |
| **Staff console** | A session-backed admin login guards catalogue and booking operations. Staff can edit a film or offer, look up a customer and remove a booking. The dashboard brings those everyday jobs into one place. |

Start reading at the [seat picker](public/js/booking3/booking3.js), [shared API controller](application/common/controller/ApiController.php) or [staff dashboard](public/admin/dashboard.html).

## 🎥 Run a local screening

Use **PHP 7.4 with PDO MySQL**, a fresh local MySQL database and a Composer environment compatible with the **1.x plugin API** required by the locked ThinkPHP installer. The SQL import recreates the demo tables in the `movies` database. Database credentials can be set through the `DATABASE_*` settings. [Dependency lock](composer.lock) · [Database settings](config/database.php)

```sh
composer install
mysql -u root -p < movies.sql
php -S 127.0.0.1:8000 -t public public/router.php
```

Open `http://127.0.0.1:8000` for the box office or `http://127.0.0.1:8000/admin/login.html` for the staff entrance.

<details>
<summary>🧪 Give the box office a dress rehearsal</summary>

From the repository root, run `python tests/static_audit.py` for the schema, API contracts, JavaScript syntax and local page assets. Run `node --test tests/frontend_unit.test.mjs` for the browser helpers. The Selenium suite adds a Chromium trip through the app using the included SQLite-backed test server. Its browser and driver paths are configured for Linux. [Browser suite](tests/e2e_browser_test.py) · [Test server](tests/mock_thinkphp_server.py)

</details>
