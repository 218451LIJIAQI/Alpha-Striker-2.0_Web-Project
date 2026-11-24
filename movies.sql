/*
 * CineTicket (Alpha Striker 2.0) — MySQL Database Schema & Seed Data
 * Encoding: UTF-8 (utf8mb4)
 */

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `movies` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `movies`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `movie_offer`;
DROP TABLE IF EXISTS `theater_movie`;
DROP TABLE IF EXISTS `t_seat`;
DROP TABLE IF EXISTS `t_offer`;
DROP TABLE IF EXISTS `t_movies`;
DROP TABLE IF EXISTS `t_theater`;
DROP TABLE IF EXISTS `t_user`;

/* Movies catalog */
CREATE TABLE `t_movies` (
  `movie_code`  bigint(20) NOT NULL AUTO_INCREMENT COMMENT 'Movie ID',
  `movie_name`  varchar(200) NOT NULL COMMENT 'Movie title',
  `tag`         varchar(50)  DEFAULT NULL COMMENT 'Highlight badge (e.g. FEATURED, NEW)',
  `star`        decimal(3,1) NOT NULL DEFAULT 5.0 COMMENT 'Rating (0.0 - 5.0)',
  `movie_type`  varchar(50)  NOT NULL COMMENT 'Primary genre',
  `img`         varchar(500) NOT NULL COMMENT 'Poster path or URL',
  `money`       decimal(10,2) NOT NULL DEFAULT 39.00 COMMENT 'Base ticket price',
  `times`       varchar(50)  NOT NULL COMMENT 'Formatted runtime (e.g. 2h 10m)',
  `create_code` bigint(20)   DEFAULT NULL,
  `create_time` datetime     DEFAULT CURRENT_TIMESTAMP,
  `update_code` bigint(20)   DEFAULT NULL,
  `update_time` datetime     DEFAULT NULL,
  PRIMARY KEY (`movie_code`),
  KEY `idx_movies_type` (`movie_type`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Movies Table';

/* Registered users (passwords stored as bcrypt hashes) */
CREATE TABLE `t_user` (
  `user_code`   bigint(20) NOT NULL AUTO_INCREMENT COMMENT 'User ID',
  `user_name`   varchar(50)  NOT NULL COMMENT 'Display name',
  `email`       varchar(100) NOT NULL COMMENT 'Unique login email',
  `login_pwd`   varchar(255) NOT NULL COMMENT 'Bcrypt password hash',
  `create_code` bigint(20)   DEFAULT NULL,
  `create_time` datetime     DEFAULT CURRENT_TIMESTAMP,
  `update_code` bigint(20)   DEFAULT NULL,
  `update_time` datetime     DEFAULT NULL,
  PRIMARY KEY (`user_code`),
  UNIQUE KEY `uk_user_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Users Table';

/* Partner theaters */
CREATE TABLE `t_theater` (
  `theater_code` bigint(20) NOT NULL AUTO_INCREMENT COMMENT 'Theater ID',
  `theater_name` varchar(200) NOT NULL,
  `address`      varchar(500) NOT NULL,
  `amenity`      varchar(500) DEFAULT NULL COMMENT 'Comma-separated amenities',
  `star`         decimal(3,1) NOT NULL DEFAULT 4.8,
  `img`          varchar(500) NOT NULL,
  `reviews`      varchar(50)  DEFAULT NULL,
  `distance`     varchar(50)  DEFAULT NULL,
  `theater_id`   varchar(100) DEFAULT NULL,
  `create_code`  bigint(20)   DEFAULT NULL,
  `create_time`  datetime     DEFAULT CURRENT_TIMESTAMP,
  `update_code`  bigint(20)   DEFAULT NULL,
  `update_time`  datetime     DEFAULT NULL,
  PRIMARY KEY (`theater_code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Theaters Table';

/* Promotional offers & promo codes */
CREATE TABLE `t_offer` (
  `offer_code`        bigint(20) NOT NULL AUTO_INCREMENT COMMENT 'Offer ID',
  `offer_title`       varchar(200) NOT NULL,
  `offer_type`        varchar(100) NOT NULL,
  `offer_description` varchar(500) NOT NULL,
  `promo_code`        varchar(100) NOT NULL,
  `offer_validity`    varchar(20)  NOT NULL COMMENT 'ISO expiration date YYYY-MM-DD',
  `img`               varchar(500) NOT NULL,
  `badge`             varchar(50)  DEFAULT NULL,
  `money`             decimal(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Flat discount amount',
  `user_code`         bigint(20)   DEFAULT NULL COMMENT 'Optional exclusive user owner',
  `create_code`       bigint(20)   DEFAULT NULL,
  `create_time`       datetime     DEFAULT CURRENT_TIMESTAMP,
  `update_code`       bigint(20)   DEFAULT NULL,
  `update_time`       datetime     DEFAULT NULL,
  PRIMARY KEY (`offer_code`),
  UNIQUE KEY `uk_offer_promo` (`promo_code`),
  KEY `idx_offer_type` (`offer_type`),
  KEY `idx_offer_user` (`user_code`),
  CONSTRAINT `fk_offer_user` FOREIGN KEY (`user_code`) REFERENCES `t_user` (`user_code`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Offers Table';

/* Seat reservations (nullable user_code supports both registered and guest checkouts) */
CREATE TABLE `t_seat` (
  `seat_code`    bigint(20) NOT NULL AUTO_INCREMENT COMMENT 'Booking Seat ID',
  `movie_code`   bigint(20) NOT NULL,
  `user_code`    bigint(20) DEFAULT NULL COMMENT 'Nullable for guest checkout',
  `date`         varchar(20) NOT NULL COMMENT 'Show date (YYYY-MM-DD)',
  `time`         varchar(30) NOT NULL COMMENT 'Showtime label (e.g. 09:30 AM)',
  `seat_num`     varchar(10) NOT NULL COMMENT 'Seat coordinate (e.g. A4)',
  `seat_zone`    bigint(20) NOT NULL DEFAULT 1 COMMENT '1=Standard, 2=VIP',
  `theater_code` bigint(20) NOT NULL DEFAULT 1,
  `create_code`  bigint(20) DEFAULT NULL,
  `create_time`  datetime   DEFAULT CURRENT_TIMESTAMP,
  `update_code`  bigint(20) DEFAULT NULL,
  `update_time`  datetime   DEFAULT NULL,
  PRIMARY KEY (`seat_code`),
  UNIQUE KEY `uk_seat_booking` (`movie_code`, `theater_code`, `date`, `time`, `seat_num`),
  KEY `idx_seat_movie` (`movie_code`),
  KEY `idx_seat_user` (`user_code`),
  KEY `idx_seat_theater` (`theater_code`),
  CONSTRAINT `fk_seat_movie`   FOREIGN KEY (`movie_code`)   REFERENCES `t_movies`  (`movie_code`)   ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `fk_seat_user`    FOREIGN KEY (`user_code`)    REFERENCES `t_user`    (`user_code`)    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_seat_theater` FOREIGN KEY (`theater_code`) REFERENCES `t_theater` (`theater_code`) ON DELETE CASCADE  ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Seats Table';

/* Theater-Movie screening schedule */
CREATE TABLE `theater_movie` (
  `theater_code`    bigint(20) NOT NULL,
  `movie_code`      bigint(20) NOT NULL,
  `start_date`      date       DEFAULT NULL,
  `end_date`        date       DEFAULT NULL,
  `daily_showtimes` int        NOT NULL DEFAULT 4,
  `created_time`    datetime   DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`theater_code`, `movie_code`),
  KEY `idx_theater_movie_movie` (`movie_code`),
  CONSTRAINT `fk_theater_movie_theater` FOREIGN KEY (`theater_code`) REFERENCES `t_theater` (`theater_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_theater_movie_movie`   FOREIGN KEY (`movie_code`)   REFERENCES `t_movies`  (`movie_code`)   ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Theater-Movie Schedule Table';

/* Movie-Offer applicability */
CREATE TABLE `movie_offer` (
  `movie_code`       bigint(20) NOT NULL,
  `offer_code`       bigint(20) NOT NULL,
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `valid_from`       date DEFAULT NULL,
  `valid_to`         date DEFAULT NULL,
  `created_time`     datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`movie_code`, `offer_code`),
  KEY `idx_movie_offer_offer` (`offer_code`),
  CONSTRAINT `fk_movie_offer_movie` FOREIGN KEY (`movie_code`) REFERENCES `t_movies` (`movie_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_movie_offer_offer` FOREIGN KEY (`offer_code`) REFERENCES `t_offer`  (`offer_code`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Movie-Offer Relationship Table';

/* Seed movies */
INSERT INTO `t_movies` (`movie_code`, `movie_name`, `tag`, `star`, `movie_type`, `img`, `money`, `times`, `create_code`, `create_time`, `update_code`, `update_time`) VALUES
(1, 'Frozen 2', 'FEATURED', 5.0, 'Animation', '../img/homepage/frozen_2.jpeg', 39.00, '1h 43m', NULL, '2025-05-19 23:00:28', NULL, NULL),
(2, 'The Avengers', NULL, 5.0, 'Action', '../img/homepage/the_avengers.jpeg', 39.00, '2h 23m', NULL, '2025-05-19 23:00:29', NULL, NULL),
(3, 'Joker', NULL, 5.0, 'Drama', '../img/homepage/joker.jpeg', 39.00, '2h 2m', NULL, '2025-05-19 23:00:29', NULL, NULL),
(4, 'Jumanji: The Next Level', NULL, 5.0, 'Adventure', '../img/homepage/jumanji.jpg', 39.00, '2h 3m', NULL, '2025-05-19 23:00:29', NULL, NULL),
(5, 'Star Wars: The Rise of Skywalker', NULL, 5.0, 'Sci-Fi', '../img/homepage/starwars_.jpg', 39.00, '2h 22m', NULL, '2025-05-19 23:00:29', NULL, NULL),
(6, 'Knives Out', NULL, 5.0, 'Mystery', '../img/homepage/Knives_Out_poster.jpeg', 39.00, '2h 10m', NULL, '2025-05-19 23:00:29', NULL, NULL),
(7, 'A Minecraft Movie', 'NEW', 5.0, 'Adventure', '../img/homepage/a_minecraft_movie.jpeg', 39.00, '1h 41m', NULL, '2025-05-19 23:00:29', NULL, NULL);

/* Seed user (demo password '218451' hashed with bcrypt $2y$10$) */
INSERT INTO `t_user` (`user_code`, `user_name`, `email`, `login_pwd`, `create_code`, `create_time`, `update_code`, `update_time`) VALUES
(1, 'LI JIAQI', '218451@student.upm.edu.my', '$2y$10$tvJ.notr1I0hNkyXvzC4T.97VdbCdQxyRx0tPoEsu.DBk0dmdI/02', NULL, '2025-05-19 22:45:19', NULL, '2025-05-20 01:12:49');

/* Seed theaters */
INSERT INTO `t_theater` (`theater_code`, `theater_name`, `address`, `amenity`, `star`, `img`, `reviews`, `distance`, `theater_id`, `create_code`, `create_time`, `update_code`, `update_time`) VALUES
(1, 'Cinemark Premium', '123 Main Street, Downtown', 'IMAX,Dolby Atmos,Recliner Seats,Food Service', 5.0, '../img/theater/cinemark.jpeg', '234 reviews', '1.2 miles', 'TH-001', NULL, '2025-05-19 23:56:47', NULL, NULL),
(2, 'AMC Deluxe 16', '789 Plaza Avenue, Westside Mall', '4DX,RPX,Premium Lounge,Bar', 4.7, '../img/theater/AMC.jpeg', '186 reviews', '2.8 miles', 'TH-002', NULL, '2025-05-19 23:56:47', NULL, NULL),
(3, 'Regal Cityview', '456 Tower Road, Uptown', 'ScreenX,VIP Seating,Full Restaurant,Arcade', 4.5, '../img/theater/regal.jpeg', '210 reviews', '3.4 miles', 'TH-003', NULL, '2025-05-19 23:56:47', NULL, NULL),
(4, 'Landmark Artisan Cinema', '321 Arts District, Old Town', 'Indie Films,Reserved Seating,Wine Bar,Film Club', 4.9, '../img/theater/landmark.jpeg', '178 reviews', '1.9 miles', 'TH-004', NULL, '2025-05-19 23:56:47', NULL, NULL),
(5, 'Galaxy Premium Theater', '987 Skyline Drive, Northside', 'Recliners,IMAX,D-BOX Motion,Dine-In', 4.6, '../img/theater/galaxy.jpeg', '152 reviews', '4.5 miles', 'TH-005', NULL, '2025-05-19 23:56:47', NULL, NULL),
(6, 'Alamo Drafthouse', '654 Entertainment Blvd, Eastside', 'Full Menu,Craft Beer,Zero Talking Policy,Theme Nights', 4.8, '../img/theater/alamo.jpeg', '263 reviews', '2.3 miles', 'TH-006', NULL, '2025-05-19 23:56:47', NULL, NULL);

/* Seed active offers */
INSERT INTO `t_offer` (`offer_code`, `offer_title`, `offer_type`, `offer_description`, `promo_code`, `offer_validity`, `img`, `badge`, `money`, `user_code`, `create_code`, `create_time`, `update_code`, `update_time`) VALUES
(1, 'Student Discount Pass', 'Student Deals', 'Show your valid student ID and enjoy $5.00 off any movie ticket, valid every day of the week.', 'STUDENT30', '2027-12-31', '../img/offer/student_price.png', 'EXCLUSIVE', 5.00, NULL, NULL, '2025-05-20 00:25:28', NULL, NULL),
(2, 'Wednesday Refreshment Deal', 'Weekday Specials', 'Enjoy $5.00 off plus a complimentary medium beverage with any Wednesday ticket purchase.', 'WEDNESDAYSIP', '2027-12-31', '../img/offer/wed_free.png', 'WEEKLY', 5.00, NULL, NULL, '2025-05-20 00:25:28', NULL, NULL),
(3, 'Date Night Special', 'VIP Experiences', 'Couples save $5.00 and receive a complimentary large popcorn when booking two seats.', 'COUPLEPOPCORN520', '2027-05-20', '../img/offer/520.png', 'LIMITED TIME', 5.00, NULL, NULL, '2025-05-20 00:25:28', NULL, NULL),
(4, 'Family Fun Package', 'VIP Experiences', 'Save $5.00 on family bookings and get 20% off our family popcorn combo at concessions.', 'FAMILY4FUN', '2027-12-31', '../img/offer/family.png', 'POPULAR', 5.00, NULL, NULL, '2025-05-20 00:25:28', NULL, NULL),
(5, 'Birthday Celebration Package', 'VIP Experiences', 'Celebrate your birthday with $5.00 off any screening and a special concession treat.', 'BDAYMOVIE', '2027-12-31', '../img/offer/birthday.jpg', 'EXCLUSIVE', 5.00, NULL, NULL, '2025-05-20 00:25:28', NULL, NULL);

/* Seed sample seat bookings (historical completed screenings + upcoming cancelable passes) */
INSERT INTO `t_seat` (`seat_code`, `movie_code`, `user_code`, `date`, `time`, `seat_num`, `seat_zone`, `theater_code`, `create_code`, `create_time`, `update_code`, `update_time`) VALUES
(8,  2, 1, '2026-11-23', '09:30 AM', 'A4', 1, 1, NULL, '2026-11-20 02:30:41', NULL, NULL),
(9,  2, 1, '2026-11-23', '09:30 AM', 'E7', 2, 1, NULL, '2026-11-20 02:30:41', NULL, NULL),
(10, 3, 1, '2026-11-23', '09:30 AM', 'A4', 1, 2, NULL, '2026-11-20 02:39:44', NULL, NULL),
(11, 3, 1, '2026-11-23', '09:30 AM', 'A5', 1, 2, NULL, '2026-11-20 02:39:44', NULL, NULL),
(12, 3, 1, '2026-11-23', '09:30 AM', 'D8', 2, 3, NULL, '2026-11-20 02:48:22', NULL, NULL),
(13, 1, 1, '2026-11-23', '12:00 PM', 'C4', 1, 1, NULL, '2026-11-20 20:11:25', NULL, NULL),
(14, 1, 1, '2026-11-23', '12:00 PM', 'D5', 2, 1, NULL, '2026-11-20 20:11:25', NULL, NULL),
(15, 2, 1, '2027-01-15', '08:00 PM', 'D6', 2, 2, NULL, '2026-11-20 20:26:09', NULL, NULL),
(16, 2, 1, '2027-01-15', '08:00 PM', 'C9', 1, 2, NULL, '2026-11-20 20:26:09', NULL, NULL);

/* Consolidated theater_movie schedule (all 6 theaters x 7 movies) */
INSERT INTO `theater_movie` (`theater_code`, `movie_code`, `start_date`, `end_date`, `daily_showtimes`, `created_time`) VALUES
(1, 1, '2026-01-01', '2027-12-31', 4, NOW()),
(1, 2, '2026-01-01', '2027-12-31', 3, NOW()),
(1, 3, '2026-01-01', '2027-12-31', 5, NOW()),
(1, 4, '2026-01-01', '2027-12-31', 3, NOW()),
(1, 5, '2026-01-01', '2027-12-31', 3, NOW()),
(1, 6, '2026-01-01', '2027-12-31', 3, NOW()),
(1, 7, '2026-01-01', '2027-12-31', 3, NOW()),
(2, 1, '2026-01-01', '2027-12-31', 3, NOW()),
(2, 2, '2026-01-01', '2027-12-31', 3, NOW()),
(2, 3, '2026-01-01', '2027-12-31', 3, NOW()),
(2, 4, '2026-01-01', '2027-12-31', 2, NOW()),
(2, 5, '2026-01-01', '2027-12-31', 4, NOW()),
(2, 6, '2026-01-01', '2027-12-31', 3, NOW()),
(2, 7, '2026-01-01', '2027-12-31', 3, NOW()),
(3, 1, '2026-01-01', '2027-12-31', 3, NOW()),
(3, 2, '2026-01-01', '2027-12-31', 4, NOW()),
(3, 3, '2026-01-01', '2027-12-31', 3, NOW()),
(3, 4, '2026-01-01', '2027-12-31', 3, NOW()),
(3, 5, '2026-01-01', '2027-12-31', 3, NOW()),
(3, 6, '2026-01-01', '2027-12-31', 2, NOW()),
(3, 7, '2026-01-01', '2027-12-31', 3, NOW()),
(4, 1, '2026-01-01', '2027-12-31', 3, NOW()),
(4, 2, '2026-01-01', '2027-12-31', 3, NOW()),
(4, 3, '2026-01-01', '2027-12-31', 3, NOW()),
(4, 4, '2026-01-01', '2027-12-31', 3, NOW()),
(4, 5, '2026-01-01', '2027-12-31', 3, NOW()),
(4, 6, '2026-01-01', '2027-12-31', 3, NOW()),
(4, 7, '2026-01-01', '2027-12-31', 4, NOW()),
(5, 1, '2026-01-01', '2027-12-31', 5, NOW()),
(5, 2, '2026-01-01', '2027-12-31', 3, NOW()),
(5, 3, '2026-01-01', '2027-12-31', 3, NOW()),
(5, 4, '2026-01-01', '2027-12-31', 3, NOW()),
(5, 5, '2026-01-01', '2027-12-31', 3, NOW()),
(5, 6, '2026-01-01', '2027-12-31', 3, NOW()),
(5, 7, '2026-01-01', '2027-12-31', 2, NOW()),
(6, 1, '2026-01-01', '2027-12-31', 3, NOW()),
(6, 2, '2026-01-01', '2027-12-31', 2, NOW()),
(6, 3, '2026-01-01', '2027-12-31', 3, NOW()),
(6, 4, '2026-01-01', '2027-12-31', 3, NOW()),
(6, 5, '2026-01-01', '2027-12-31', 3, NOW()),
(6, 6, '2026-01-01', '2027-12-31', 3, NOW()),
(6, 7, '2026-01-01', '2027-12-31', 3, NOW());

/* Consolidated movie_offer schedule (all 7 movies x 5 offers) */
INSERT INTO `movie_offer` (`movie_code`, `offer_code`, `discount_percent`, `valid_from`, `valid_to`, `created_time`) VALUES
(1, 1, 25.00, '2026-01-01', '2027-12-31', NOW()),
(1, 2, 15.00, '2026-01-01', '2027-12-31', NOW()),
(1, 3,  0.00, '2026-01-01', '2027-12-31', NOW()),
(1, 4, 20.00, '2026-01-01', '2027-12-31', NOW()),
(1, 5, 30.00, '2026-01-01', '2027-12-31', NOW()),
(2, 1, 25.00, '2026-01-01', '2027-12-31', NOW()),
(2, 2, 15.00, '2026-01-01', '2027-12-31', NOW()),
(2, 3,  0.00, '2026-01-01', '2027-12-31', NOW()),
(2, 4, 20.00, '2026-01-01', '2027-12-31', NOW()),
(2, 5, 30.00, '2026-01-01', '2027-12-31', NOW()),
(3, 1, 25.00, '2026-01-01', '2027-12-31', NOW()),
(3, 2, 15.00, '2026-01-01', '2027-12-31', NOW()),
(3, 3,  0.00, '2026-01-01', '2027-12-31', NOW()),
(3, 4, 20.00, '2026-01-01', '2027-12-31', NOW()),
(3, 5, 30.00, '2026-01-01', '2027-12-31', NOW()),
(4, 1, 25.00, '2026-01-01', '2027-12-31', NOW()),
(4, 2, 15.00, '2026-01-01', '2027-12-31', NOW()),
(4, 3,  0.00, '2026-01-01', '2027-12-31', NOW()),
(4, 4, 20.00, '2026-01-01', '2027-12-31', NOW()),
(4, 5, 30.00, '2026-01-01', '2027-12-31', NOW()),
(5, 1, 25.00, '2026-01-01', '2027-12-31', NOW()),
(5, 2, 15.00, '2026-01-01', '2027-12-31', NOW()),
(5, 3,  0.00, '2026-01-01', '2027-12-31', NOW()),
(5, 4, 20.00, '2026-01-01', '2027-12-31', NOW()),
(5, 5, 30.00, '2026-01-01', '2027-12-31', NOW()),
(6, 1, 25.00, '2026-01-01', '2027-12-31', NOW()),
(6, 2, 15.00, '2026-01-01', '2027-12-31', NOW()),
(6, 3,  0.00, '2026-01-01', '2027-12-31', NOW()),
(6, 4, 20.00, '2026-01-01', '2027-12-31', NOW()),
(6, 5, 30.00, '2026-01-01', '2027-12-31', NOW()),
(7, 1, 25.00, '2026-01-01', '2027-12-31', NOW()),
(7, 2, 15.00, '2026-01-01', '2027-12-31', NOW()),
(7, 3,  0.00, '2026-01-01', '2027-12-31', NOW()),
(7, 4, 20.00, '2026-01-01', '2027-12-31', NOW()),
(7, 5, 30.00, '2026-01-01', '2027-12-31', NOW());

SET FOREIGN_KEY_CHECKS = 1;