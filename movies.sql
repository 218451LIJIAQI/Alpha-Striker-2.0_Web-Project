/*
 Navicat Premium Data Transfer

 Source Server         : docker57
 Source Server Type    : MySQL
 Source Server Version : 50739
 Source Host           : localhost:3307
 Source Schema         : movies

 Target Server Type    : MySQL
 Target Server Version : 50739
 File Encoding         : 65001

 Date: 29/05/2025 03:29:03
*/

SET NAMES utf8mb4;

/*
 Create database if it doesn't exist
*/
CREATE DATABASE IF NOT EXISTS movies CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
USE movies;

/*
 Disable foreign key checks during setup
*/
SET FOREIGN_KEY_CHECKS = 0;

/*
 Drop existing tables in correct order
*/
DROP TABLE IF EXISTS `movie_offer`;
DROP TABLE IF EXISTS `theater_movie`;
DROP TABLE IF EXISTS `t_seat`;
DROP TABLE IF EXISTS `t_offer`;
DROP TABLE IF EXISTS `t_movies`;
DROP TABLE IF EXISTS `t_theater`;
DROP TABLE IF EXISTS `t_user`;

/*
 Create tables without foreign keys first
*/

/* Table structure for t_movies */
CREATE TABLE `t_movies` (
  `movie_code`   bigint(20) NOT NULL AUTO_INCREMENT COMMENT 'Movie ID',
  `movie_name`   varchar(200) COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Name',
  `tag`          varchar(50)  COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Tag',
  `star`         decimal(10,1) DEFAULT NULL,
  `movie_type`   varchar(50)  COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Movie Category',
  `img`          varchar(500) COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Image URL',
  `money`        decimal(10,2) DEFAULT NULL,
  `times`        varchar(50)  COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Duration',
  `create_code`  bigint(20) DEFAULT NULL COMMENT 'Creator',
  `create_time`  datetime  DEFAULT NULL COMMENT 'Creation Time',
  `update_code`  bigint(20) DEFAULT NULL COMMENT 'Modifier',
  `update_time`  datetime  DEFAULT NULL COMMENT 'Update Time',
  PRIMARY KEY (`movie_code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Movie Information Table';

/* Table structure for t_user */
CREATE TABLE `t_user` (
  `user_code`   bigint(20) NOT NULL AUTO_INCREMENT,
  `user_name`   varchar(50)  COLLATE utf8mb4_bin DEFAULT NULL,
  `email`       varchar(100) COLLATE utf8mb4_bin DEFAULT NULL,
  `login_pwd`   varchar(50)  COLLATE utf8mb4_bin DEFAULT NULL,
  `create_code` bigint(20) DEFAULT NULL,
  `create_time` datetime    DEFAULT NULL,
  `update_code` bigint(20) DEFAULT NULL,
  `update_time` datetime    DEFAULT NULL,
  PRIMARY KEY (`user_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Users Table';

/* Table structure for t_theater */
CREATE TABLE `t_theater` (
  `theater_code` bigint(20) NOT NULL AUTO_INCREMENT,
  `theater_name` varchar(200) COLLATE utf8mb4_bin DEFAULT NULL,
  `address`      varchar(500) COLLATE utf8mb4_bin DEFAULT NULL,
  `amenity`      varchar(500) COLLATE utf8mb4_bin DEFAULT NULL,
  `star`         decimal(10,1) DEFAULT NULL,
  `img`          varchar(500) COLLATE utf8mb4_bin DEFAULT NULL,
  `reviews`      varchar(50)  COLLATE utf8mb4_bin DEFAULT NULL,
  `distance`     varchar(50)  COLLATE utf8mb4_bin DEFAULT NULL,
  `theater_id`   varchar(500) COLLATE utf8mb4_bin DEFAULT NULL,
  `create_code`  bigint(20) DEFAULT NULL,
  `create_time`  datetime    DEFAULT NULL,
  `update_code`  bigint(20) DEFAULT NULL,
  `update_time`  datetime    DEFAULT NULL,
  PRIMARY KEY (`theater_code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Theaters Table';

/* Table structure for t_seat */
CREATE TABLE `t_seat` (
  `seat_code`    bigint(20) NOT NULL AUTO_INCREMENT,
  `movie_code`   bigint(20) DEFAULT NULL,
  `user_code`    bigint(20) DEFAULT NULL,
  `date`         varchar(20) COLLATE utf8mb4_bin DEFAULT NULL,
  `time`         varchar(70) COLLATE utf8mb4_bin DEFAULT NULL,
  `seat_num`     varchar(10) COLLATE utf8mb4_bin DEFAULT NULL,
  `seat_zone`    bigint(20) DEFAULT NULL,
  `theater_code` bigint(20) DEFAULT 1 COMMENT 'Theater reference',
  `create_code`  bigint(20) DEFAULT NULL,
  `create_time`  datetime    DEFAULT NULL,
  `update_code`  bigint(20) DEFAULT NULL,
  `update_time`  datetime    DEFAULT NULL,
  PRIMARY KEY (`seat_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Seats Table';

/* Table structure for t_offer */
CREATE TABLE `t_offer` (
  `offer_code`      bigint(20) NOT NULL AUTO_INCREMENT COMMENT 'Offer ID',
  `offer_title`     varchar(200) COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Name',
  `offer_type`      varchar(255) COLLATE utf8mb4_bin DEFAULT NULL,
  `offer_description` varchar(500) COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Description',
  `promo_code`      varchar(500) COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Promo Code',
  `offer_validity`  varchar(20)  COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Validity Date',
  `img`             varchar(500) COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Image URL',
  `badge`           varchar(50)  COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Badge',
  `money`           decimal(10,2) DEFAULT NULL,
  `user_code`       bigint(20) DEFAULT NULL COMMENT 'User ID for exclusive offers',
  `create_code`     bigint(20) DEFAULT NULL COMMENT 'Creator',
  `create_time`     datetime    DEFAULT NULL COMMENT 'Creation Time',
  `update_code`     bigint(20) DEFAULT NULL COMMENT 'Modifier',
  `update_time`     datetime    DEFAULT NULL COMMENT 'Update Time',
  PRIMARY KEY (`offer_code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Offers Table';

/* Junction table: theater_movie */
CREATE TABLE `theater_movie` (
  `theater_code` bigint(20) NOT NULL COMMENT 'Theater ID',
  `movie_code`   bigint(20) NOT NULL COMMENT 'Movie ID',
  `start_date`   date       DEFAULT NULL COMMENT 'Movie Start Date in Theater',
  `end_date`     date       DEFAULT NULL COMMENT 'Movie End Date in Theater',
  `daily_showtimes` int DEFAULT 3 COMMENT 'Number of daily showtimes',
  `created_time` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`theater_code`, `movie_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Theater-Movie Many-to-Many Relationship Table';

/* Junction table: movie_offer */
CREATE TABLE `movie_offer` (
  `movie_code`      bigint(20) NOT NULL COMMENT 'Movie ID',
  `offer_code`      bigint(20) NOT NULL COMMENT 'Offer ID',
  `discount_percent` decimal(5,2) DEFAULT 0.00 COMMENT 'Discount Percentage',
  `valid_from`      date DEFAULT NULL COMMENT 'Offer Valid From Date',
  `valid_to`        date DEFAULT NULL COMMENT 'Offer Valid To Date',
  `created_time`    datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`movie_code`, `offer_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Movie-Offer Many-to-Many Relationship Table';

/*
 Insert sample data
*/

/* Movies data */
INSERT INTO `t_movies` VALUES
(1,'Frozen 2','FEATURED',5.0,'Animation','../img/homepage/frozen_2.jpeg',39.00,'1h 43m',NULL,'2025-05-19 23:00:28',NULL,NULL),
(2,'The Avengers',NULL,5.0,'Action','../img/homepage/the_avengers.jpeg',39.00,'2h 23m',NULL,'2025-05-19 23:00:29',NULL,NULL),
(3,'Joker',NULL,5.0,'Drama','../img/homepage/joker.jpeg',39.00,'2h 2m',NULL,'2025-05-19 23:00:29',NULL,NULL),
(4,'Jumanji: The Next Level',NULL,5.0,'Adventure','../img/homepage/jumanji.jpg',39.00,'2h 3m',NULL,'2025-05-19 23:00:29',NULL,NULL),
(5,'Star Wars: The Rise of Skywalker',NULL,5.0,'Sci-Fi','../img/homepage/starwars_.jpg',39.00,'2h 22m',NULL,'2025-05-19 23:00:29',NULL,NULL),
(6,'Knives Out',NULL,5.0,'Mystery','../img/homepage/Knives_Out_poster.jpeg',39.00,'2h 10m',NULL,'2025-05-19 23:00:29',NULL,NULL),
(7,'A Minecraft Movie',NULL,5.0,'Adventure','../img/homepage/a_minecraft_movie.jpeg',39.00,'1h 41m',NULL,'2025-05-19 23:00:29',NULL,NULL);

/* Users data */
INSERT INTO `t_user` VALUES
(1,'LI JIAQI','218451@student.upm.edu.my','218451',NULL,'2025-05-19 22:45:19',NULL,'2025-05-20 01:12:49');

/* Theaters data */
INSERT INTO `t_theater` VALUES
(1,'Cinemark Premium','123 Main Street, Downtown','IMAX,Dolby Atmos,Recliner Seats,Food Service',5.0,'../img/theater/cinemark.jpeg','234 reviews',NULL,NULL,NULL,'2025-05-19 23:56:47',NULL,NULL),
(2,'AMC Deluxe 16','789 Plaza Avenue, Westside Mall','4DX,RPX,Premium Lounge,Bar',4.7,'../img/theater/AMC.jpeg','186 reviews',NULL,NULL,NULL,'2025-05-19 23:56:47',NULL,NULL),
(3,'Regal Cityview','456 Tower Road, Uptown','ScreenX,VIP Seating,Full Restaurant,Arcade',4.5,'../img/theater/regal.jpeg','210 reviews',NULL,NULL,NULL,'2025-05-19 23:56:47',NULL,NULL),
(4,'Landmark Artisan Cinema','321 Arts District, Old Town','Indie Films,Reserved Seating,Wine Bar,Film Club',4.9,'../img/theater/landmark.jpeg','178 reviews',NULL,NULL,NULL,'2025-05-19 23:56:47',NULL,NULL),
(5,'Galaxy Premium Theater','987 Skyline Drive, Northside','Recliners,IMAX,D-BOX Motion,Dine-In',4.6,'../img/theater/galaxy.jpeg','152 reviews',NULL,NULL,NULL,'2025-05-19 23:56:47',NULL,NULL),
(6,'Alamo Drafthouse','654 Entertainment Blvd, Eastside','Full Menu,Craft Beer,Zero Talking Policy,Theme Nights',4.8,'../img/theater/alamo.jpeg','263 reviews',NULL,NULL,NULL,'2025-05-19 23:56:47',NULL,NULL);

/* Offers data */
INSERT INTO `t_offer` VALUES
(1,'Student Discount Pass','Student Deals','Show your valid student ID and enjoy 30% off any movie ticket. Valid all days of the week!','STUDENT30','2025-12-31','../img/offer/student_price.png','EXCLUSIVE',5.00,NULL,NULL,'2025-05-20 00:25:28',NULL,NULL),
(2,'Wednesday Refreshment Deal','Weekday Specials','Get a free medium beverage of your choice with any ticket purchase every Wednesday!','WEDNESDAYSIP','2025-12-31','../img/offer/wed_free.png','WEEKLY',5.00,NULL,NULL,'2025-05-20 00:25:28',NULL,NULL),
(3,'Date Night Special: May 20','VIP Experiences','Couples get a free large popcorn with the purchase of two tickets on May 20, 2025. Perfect for date night!','COUPLEPOPCORN520','2025-05-20','../img/offer/520.png','LIMITED TIME',5.00,NULL,NULL,'2025-05-20 00:25:28',NULL,NULL),
(4,'Family Fun Package','VIP Experiences','Buy 3 tickets, get the 4th ticket free, plus a family popcorn combo at 20% off.','FAMILY4FUN','2025-12-31','../img/offer/family.png','POPULAR',5.00,NULL,NULL,'2025-05-20 00:25:28',NULL,NULL),
(5,'Birthday Celebration Package','VIP Experiences','Get a free movie ticket on your birthday plus a special treat from our concession stand!','BDAYMOVIE','2025-12-31','../img/offer/birthday.jpg','EXCLUSIVE',5.00,NULL,NULL,'2025-05-20 00:25:28',NULL,NULL);

/* Seats data */
INSERT INTO `t_seat` VALUES
(8 ,2,1,'20','09:30 AM','A4',1,1,NULL,'2025-05-20 02:30:41',NULL,NULL),
(9 ,2,1,'20','09:30 AM','E7',1,1,NULL,'2025-05-20 02:30:41',NULL,NULL),
(10,3,1,'20','09:30 AM','A4',1,2,NULL,'2025-05-20 02:39:44',NULL,NULL),
(11,3,1,'20','09:30 AM','A5',1,2,NULL,'2025-05-20 02:39:44',NULL,NULL),
(12,3,1,'20','09:30 AM','B8',2,3,NULL,'2025-05-20 02:48:22',NULL,NULL),
(13,1,1,'20','12:00 PM','C4',1,1,NULL,'2025-05-20 20:11:25',NULL,NULL),
(14,1,1,'20','12:00 PM','D5',1,1,NULL,'2025-05-20 20:11:25',NULL,NULL),
(15,2,1,'20','12:00 PM','D6',1,2,NULL,'2025-05-20 20:26:09',NULL,NULL),
(16,2,1,'20','12:00 PM','C9',2,2,NULL,'2025-05-20 20:26:09',NULL,NULL);

/* theater_movie data (original) */
INSERT INTO `theater_movie` VALUES
(1,1,'2024-12-01','2024-12-31',4,NOW()),
(1,2,'2024-12-01','2024-12-31',3,NOW()),
(1,3,'2024-12-05','2024-12-31',5,NOW()),
(2,1,'2024-12-01','2024-12-31',3,NOW()),
(2,4,'2024-12-03','2024-12-31',2,NOW()),
(2,5,'2024-12-10','2024-12-31',4,NOW()),
(3,2,'2024-12-01','2024-12-31',4,NOW()),
(3,3,'2024-12-01','2024-12-31',3,NOW()),
(3,6,'2024-12-08','2024-12-31',2,NOW()),
(4,4,'2024-12-01','2024-12-31',3,NOW()),
(4,7,'2024-12-12','2024-12-31',4,NOW()),
(5,1,'2024-12-01','2024-12-31',5,NOW()),
(5,5,'2024-12-01','2024-12-31',3,NOW()),
(5,7,'2024-12-01','2024-12-31',2,NOW()),
(6,2,'2024-12-05','2024-12-31',2,NOW()),
(6,6,'2024-12-01','2024-12-31',3,NOW());

/* movie_offer data (original) */
INSERT INTO `movie_offer` VALUES
(1,1,25.00,'2024-12-01','2024-12-31',NOW()),
(1,2,15.00,'2024-12-01','2024-12-31',NOW()),
(1,5,30.00,'2024-12-01','2024-12-31',NOW()),
(2,1,25.00,'2024-12-01','2024-12-31',NOW()),
(2,3, 0.00,'2024-12-01','2024-12-31',NOW()),
(3,2,15.00,'2024-12-01','2024-12-31',NOW()),
(3,4,20.00,'2024-12-01','2024-12-31',NOW()),
(4,1,25.00,'2024-12-01','2024-12-31',NOW()),
(4,3, 0.00,'2024-12-01','2024-12-31',NOW()),
(5,2,15.00,'2024-12-01','2024-12-31',NOW()),
(5,5,30.00,'2024-12-01','2024-12-31',NOW()),
(6,1,25.00,'2024-12-01','2024-12-31',NOW()),
(6,4,20.00,'2024-12-01','2024-12-31',NOW()),
(7,2,15.00,'2024-12-01','2024-12-31',NOW()),
(7,3, 0.00,'2024-12-01','2024-12-31',NOW());

/* =================================================================
   Additional INSERTs to make offers universal and movies universal
   =================================================================*/

/* movie_offer — complete 1-5 offers for every movie */
INSERT INTO `movie_offer` VALUES
(1,3, 0.00,'2024-12-01','2024-12-31',NOW()),
(1,4,20.00,'2024-12-01','2024-12-31',NOW()),
(2,2,15.00,'2024-12-01','2024-12-31',NOW()),
(2,4,20.00,'2024-12-01','2024-12-31',NOW()),
(2,5,30.00,'2024-12-01','2024-12-31',NOW()),
(3,1,25.00,'2024-12-01','2024-12-31',NOW()),
(3,3, 0.00,'2024-12-01','2024-12-31',NOW()),
(3,5,30.00,'2024-12-01','2024-12-31',NOW()),
(4,2,15.00,'2024-12-01','2024-12-31',NOW()),
(4,4,20.00,'2024-12-01','2024-12-31',NOW()),
(4,5,30.00,'2024-12-01','2024-12-31',NOW()),
(5,1,25.00,'2024-12-01','2024-12-31',NOW()),
(5,3, 0.00,'2024-12-01','2024-12-31',NOW()),
(5,4,20.00,'2024-12-01','2024-12-31',NOW()),
(6,2,15.00,'2024-12-01','2024-12-31',NOW()),
(6,3, 0.00,'2024-12-01','2024-12-31',NOW()),
(6,5,30.00,'2024-12-01','2024-12-31',NOW()),
(7,1,25.00,'2024-12-01','2024-12-31',NOW()),
(7,4,20.00,'2024-12-01','2024-12-31',NOW()),
(7,5,30.00,'2024-12-01','2024-12-31',NOW());

/* theater_movie — make every theater screen every movie */
-- theater 1 (missing 4,5,6,7)
INSERT INTO `theater_movie` VALUES
(1,4,'2024-12-01','2024-12-31',3,NOW()),
(1,5,'2024-12-01','2024-12-31',3,NOW()),
(1,6,'2024-12-01','2024-12-31',3,NOW()),
(1,7,'2024-12-01','2024-12-31',3,NOW()),
-- theater 2 (missing 2,3,6,7)
(2,2,'2024-12-01','2024-12-31',3,NOW()),
(2,3,'2024-12-01','2024-12-31',3,NOW()),
(2,6,'2024-12-01','2024-12-31',3,NOW()),
(2,7,'2024-12-01','2024-12-31',3,NOW()),
-- theater 3 (missing 1,4,5,7)
(3,1,'2024-12-01','2024-12-31',3,NOW()),
(3,4,'2024-12-01','2024-12-31',3,NOW()),
(3,5,'2024-12-01','2024-12-31',3,NOW()),
(3,7,'2024-12-01','2024-12-31',3,NOW()),
-- theater 4 (missing 1,2,3,5,6)
(4,1,'2024-12-01','2024-12-31',3,NOW()),
(4,2,'2024-12-01','2024-12-31',3,NOW()),
(4,3,'2024-12-01','2024-12-31',3,NOW()),
(4,5,'2024-12-01','2024-12-31',3,NOW()),
(4,6,'2024-12-01','2024-12-31',3,NOW()),
-- theater 5 (missing 2,3,4,6)
(5,2,'2024-12-01','2024-12-31',3,NOW()),
(5,3,'2024-12-01','2024-12-31',3,NOW()),
(5,4,'2024-12-01','2024-12-31',3,NOW()),
(5,6,'2024-12-01','2024-12-31',3,NOW()),
-- theater 6 (missing 1,3,4,5,7)
(6,1,'2024-12-01','2024-12-31',3,NOW()),
(6,3,'2024-12-01','2024-12-31',3,NOW()),
(6,4,'2024-12-01','2024-12-31',3,NOW()),
(6,5,'2024-12-01','2024-12-31',3,NOW()),
(6,7,'2024-12-01','2024-12-31',3,NOW());

/*
 Add foreign key constraints after data insertion
*/

/* foreign keys for t_seat */
ALTER TABLE `t_seat`
  ADD CONSTRAINT `fk_seat_movie` FOREIGN KEY (`movie_code`) REFERENCES `t_movies` (`movie_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_seat_user`  FOREIGN KEY (`user_code`)  REFERENCES `t_user`   (`user_code`)  ON DELETE SET NULL ON UPDATE CASCADE;

/* foreign keys for t_offer */
ALTER TABLE `t_offer`
  ADD CONSTRAINT `fk_offer_user` FOREIGN KEY (`user_code`) REFERENCES `t_user` (`user_code`) ON DELETE SET NULL ON UPDATE CASCADE;

/* foreign keys for theater_movie */
ALTER TABLE `theater_movie`
  ADD CONSTRAINT `fk_theater_movie_theater` FOREIGN KEY (`theater_code`) REFERENCES `t_theater` (`theater_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_theater_movie_movie`   FOREIGN KEY (`movie_code`)   REFERENCES `t_movies`  (`movie_code`)  ON DELETE CASCADE ON UPDATE CASCADE;

/* foreign keys for movie_offer */
ALTER TABLE `movie_offer`
  ADD CONSTRAINT `fk_movie_offer_movie` FOREIGN KEY (`movie_code`) REFERENCES `t_movies` (`movie_code`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_movie_offer_offer` FOREIGN KEY (`offer_code`) REFERENCES `t_offer` (`offer_code`) ON DELETE CASCADE ON UPDATE CASCADE;

/*
 Create indexes for performance optimization
*/
CREATE INDEX idx_seat_movie             ON `t_seat`        (`movie_code`);
CREATE INDEX idx_seat_user              ON `t_seat`        (`user_code`);
CREATE INDEX idx_offer_user             ON `t_offer`       (`user_code`);
CREATE INDEX idx_theater_movie_theater  ON `theater_movie` (`theater_code`);
CREATE INDEX idx_theater_movie_movie    ON `theater_movie` (`movie_code`);
CREATE INDEX idx_movie_offer_movie      ON `movie_offer`   (`movie_code`);
CREATE INDEX idx_movie_offer_offer      ON `movie_offer`   (`offer_code`);

/*
 Re-enable foreign key checks
*/
SET FOREIGN_KEY_CHECKS = 1;

COMMIT;