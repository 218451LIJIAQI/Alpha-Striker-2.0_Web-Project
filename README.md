# CineTix

Two people open the same screening. Both see **A4** available. Both pick it. Who gets the ticket?

CineTix, the SSE3308-1 web project by **Alpha Striker 2.0**, takes a moviegoer from choosing a film to printing a ticket. That little race for A4 is where the seat map, the PHP booking controller and the database all have to agree.

## Before the lights go down

- **Choose the view.** Browse films and partner theaters, pick a showtime, then open the embedded 3D auditorium to inspect the sightlines before choosing a row. [Auditorium viewer](public/pages/3d-model.html)
- **Bring four friends.** Five seats qualify for the built-in 30% group discount. The checkout also accepts promo codes and shows the discount before the simulated payment step. [Pricing helper](public/js/common.js) · [Checkout](public/js/pay/pay.js)
- **Take the ticket with you.** Signed-in customers can revisit bookings in their ticket wallet, cancel a seat or print a ticket. The print stylesheet isolates the ticket, so the browser’s Save as PDF option works too. [Ticket wallet](public/js/ticket/ticket.js)

The admin console gives the cinema team a second view of the same operation. Staff can maintain the movie catalogue and offers, look up bookings and manage customer accounts. [Admin console](public/admin/)

## The rule that protects A4

A seat number can repeat across films, theaters and showtimes. In MySQL, the unique key covers the whole screening identity.

```sql
UNIQUE KEY `uk_seat_booking` (`movie_code`, `theater_code`, `date`, `time`, `seat_num`)
```

A4 goes to the first booking that commits successfully. If a group asks for A4 and A5 after A4 is taken, the **ThinkPHP 5.1** controller rolls the whole booking back. The unique key also protects against requests that arrive together. A regression check loads the demo seed into SQLite and tries to insert A4 a second time. [Booking controller](application/movie/controller/Seat.php) · [Schema](movies.sql) · [Regression check](tests/static_audit.py)

## Run a local screening

The frontend is plain HTML, CSS and JavaScript. For the full app, use PHP 7.4 with PDO MySQL, a fresh local MySQL instance and a Composer installation compatible with the **1.x plugin API** required by the locked ThinkPHP installer. The SQL import recreates the demo tables in the `movies` database. [Dependency lock](composer.lock) · [Database settings](config/database.php)

```sh
composer install
mysql -u root -p < movies.sql
php -S 127.0.0.1:8000 -t public public/router.php
```

Open `http://127.0.0.1:8000` for the box office or `/admin/login.html` for the staff console.
