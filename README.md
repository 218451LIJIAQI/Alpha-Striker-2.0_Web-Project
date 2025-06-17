# Alpha Striker 2.0 - Advanced Movie Booking System

## 📋 Table of Contents
- [Project Overview](#project-overview)
- [System Architecture](#system-architecture)
- [Detailed Project Structure](#detailed-project-structure)
- [Technical Specifications](#technical-specifications)
- [Installation Guide](#installation-guide)
- [Database Schema](#database-schema)
- [API Documentation](#api-documentation)
- [Frontend Features](#frontend-features)
- [Backend Architecture](#backend-architecture)
- [Configuration Details](#configuration-details)
- [User Guide](#user-guide)
- [Admin Panel](#admin-panel)
- [Development Tools](#development-tools)
- [Troubleshooting](#troubleshooting)
- [Performance Optimization](#performance-optimization)
- [Security Features](#security-features)
- [Maintenance Guide](#maintenance-guide)

## 🎬 Project Overview

**Alpha Striker 2.0** is a comprehensive, enterprise-grade movie ticket booking system designed for modern cinema chains. The application provides a seamless user experience for movie browsing, theater selection, seat booking, and payment processing, while offering robust administrative tools for theater management.

### Key Highlights
- **Full-Stack Web Application**: Complete frontend and backend implementation
- **Modern UI/UX**: Responsive design with dark mode support
- **Real-time Seat Selection**: Interactive seat mapping system
- **Multi-theater Support**: Comprehensive theater management
- **Promotional System**: Advanced discount and offer management
- **Admin Dashboard**: Complete administrative control panel
- **RESTful API**: Well-structured backend API
- **Database Optimization**: Efficient relational database design

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                       │
├─────────────────┬─────────────────┬─────────────────────────┤
│   User Interface │   Admin Panel   │    RESTful API         │
│   (HTML/CSS/JS)  │   (Dashboard)   │   (JSON Responses)     │
└─────────────────┴─────────────────┴─────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                        │
├─────────────────────────────────────────────────────────────┤
│              ThinkPHP 5.1 Framework                        │
│  ┌─────────────┬──────────────┬─────────────┬─────────────┐ │
│  │   Movies    │   Theaters   │    Users    │   Bookings  │ │
│  │ Controller  │  Controller  │ Controller  │ Controller  │ │
│  └─────────────┴──────────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     DATA LAYER                              │
├─────────────────────────────────────────────────────────────┤
│                   MySQL Database                           │
│  ┌─────────────┬──────────────┬─────────────┬─────────────┐ │
│  │   Movies    │   Theaters   │    Users    │    Seats    │ │
│  │    Table    │    Table     │   Table     │   Table     │ │
│  └─────────────┴──────────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Detailed Project Structure

```
Alpha-Striker-2.0/
├── 📂 application/                    # Backend Application Logic
│   ├── 📂 admin/                     # Administrative Module
│   │   └── 📂 controller/
│   │       ├── 📄 Auth.php           # Admin authentication
│   │       ├── 📄 Movie.php          # Movie management
│   │       ├── 📄 Offer.php          # Offer management
│   │       ├── 📄 Seat.php           # Seat management
│   │       ├── 📄 Theater.php        # Theater management
│   │       └── 📄 User.php           # User management
│   ├── 📂 index/                     # Main Application Module
│   │   └── 📂 controller/
│   │       └── 📄 Index.php          # Main entry controller
│   ├── 📂 movie/                     # Movie Management Module
│   │   ├── 📂 controller/
│   │   │   ├── 📄 Movies.php         # Movie API controller
│   │   │   └── 📄 Seat.php           # Seat booking controller
│   │   └── 📂 model/
│   │       ├── 📄 Movies.php         # Movie data model
│   │       └── 📄 Seat.php           # Seat data model
│   ├── 📂 offer/                     # Promotional Offers Module
│   │   ├── 📂 controller/
│   │   │   └── 📄 Offer.php          # Offer controller
│   │   └── 📂 model/
│   │       └── 📄 Offer.php          # Offer data model
│   ├── 📂 seat/                      # Seat Management Module
│   │   └── 📂 model/
│   │       └── 📄 Seat.php           # Seat model
│   ├── 📂 theater/                   # Theater Management Module
│   │   ├── 📂 controller/
│   │   │   └── 📄 Theater.php        # Theater controller
│   │   └── 📂 model/
│   │       └── 📄 Theater.php        # Theater data model
│   ├── 📂 user/                      # User Management Module
│   │   ├── 📂 controller/
│   │   │   └── 📄 User.php           # User controller (auth, profile)
│   │   └── 📂 model/
│   │       └── 📄 User.php           # User data model
│   └── 📄 .htaccess                  # Application URL rewriting
├── 📂 config/                        # Configuration Files
│   ├── 📄 app.php                    # Main application settings
│   ├── 📄 database.php               # Database connection config
│   ├── 📄 cache.php                  # Cache configuration
│   ├── 📄 cookie.php                 # Cookie settings
│   ├── 📄 log.php                    # Logging configuration
│   ├── 📄 middleware.php             # Middleware settings
│   ├── 📄 session.php                # Session configuration
│   └── 📄 template.php               # Template engine config
├── 📂 public/                        # Web Document Root
│   ├── 📂 admin/                     # Admin Panel Frontend
│   │   ├── 📄 dashboard.html         # Admin dashboard
│   │   ├── 📄 login.html             # Admin login
│   │   ├── 📄 movies.html            # Movie management
│   │   ├── 📄 offers.html            # Offer management
│   │   ├── 📄 seat.html              # Seat management
│   │   ├── 📄 user.html              # User management
│   │   └── 📄 add-*.html / edit-*.html # CRUD operations
│   ├── 📂 components/                # Reusable UI Components
│   │   ├── 📄 header.html            # Navigation header
│   │   └── 📄 footer.html            # Page footer
│   ├── 📂 css/                       # Stylesheets
│   │   ├── 📂 common/                # Shared styles
│   │   │   ├── 📄 header.css         # Header styling
│   │   │   ├── 📄 footer.css         # Footer styling
│   │   │   └── 📄 dark-mode.css      # Dark mode theme
│   │   ├── 📂 homepage/              # Homepage specific
│   │   ├── 📂 booking/               # Booking process styles
│   │   ├── 📂 theater/               # Theater pages
│   │   ├── 📂 login/                 # Authentication pages
│   │   └── 📂 about/                 # About page styles
│   ├── 📂 img/                       # Media Assets
│   │   ├── 📂 homepage/              # Movie posters
│   │   │   ├── 📄 frozen_2.jpeg      # Sample movie images
│   │   │   ├── 📄 the_avengers.jpeg
│   │   │   ├── 📄 joker.jpeg
│   │   │   └── 📄 ...                # More movie posters
│   │   ├── 📂 theater/               # Theater images
│   │   │   ├── 📄 cinemark.jpeg      # Theater photos
│   │   │   ├── 📄 AMC.jpeg
│   │   │   └── 📄 ...                # More theater images
│   │   ├── 📂 offer/                 # Promotional banners
│   │   │   ├── 📄 student_price.png  # Discount images
│   │   │   ├── 📄 family.png
│   │   │   └── 📄 ...                # More offer banners
│   │   └── 📂 about/                 # About page assets
│   ├── 📂 js/                        # JavaScript Files
│   │   ├── 📂 common/                # Shared functionality
│   │   │   ├── 📄 common.js          # Common utilities
│   │   │   ├── 📄 dark-mode-*.js     # Dark mode functionality
│   │   ├── 📂 homepage/              # Homepage logic
│   │   │   └── 📄 homepage.js        # Movie browsing, search
│   │   ├── 📂 booking/               # Booking process
│   │   ├── 📂 theater/               # Theater selection
│   │   ├── 📂 login/                 # Authentication
│   │   ├── 📂 admin/                 # Admin panel logic
│   │   └── 📂 ticket/                # Ticket generation
│   ├── 📂 pages/                     # HTML Pages
│   │   ├── 📄 homepage.html          # Main landing page
│   │   ├── 📄 about.html             # About us page
│   │   ├── 📄 booking2.html          # Theater selection
│   │   ├── 📄 booking3.html          # Seat selection
│   │   ├── 📄 theater-details.html   # Theater information
│   │   ├── 📄 pay.html               # Payment page
│   │   ├── 📄 paysuccess.html        # Payment confirmation
│   │   ├── 📄 generate_ticket.html   # Ticket generation
│   │   ├── 📄 signin.html            # User registration
│   │   ├── 📄 help.html              # Help documentation
│   │   ├── 📄 faqs.html              # Frequently asked questions
│   │   ├── 📄 privacy.html           # Privacy policy
│   │   ├── 📄 team.html              # Team information
│   │   ├── 📄 giftcards.html         # Gift cards
│   │   └── 📄 upcoming.html          # Upcoming movies
│   ├── 📂 static/                    # Static Assets
│   ├── 📄 index.html                 # Entry point redirect
│   ├── 📄 index.php                  # PHP application entry
│   ├── 📄 login.html                 # User login
│   ├── 📄 pwd.html                   # Password recovery
│   ├── 📄 router.php                 # Development router
│   ├── 📄 .htaccess                  # URL rewriting rules
│   └── 📄 favicon.ico                # Site icon
├── 📂 route/                         # URL Routing
│   └── 📄 route.php                  # Route definitions
├── 📂 runtime/                       # Runtime Data
│   └── 📄 .gitignore                 # Cache and logs
├── 📂 thinkphp/                      # Framework Core
├── 📂 vendor/                        # Composer Dependencies
├── 📄 movies.sql                     # Complete Database Schema
├── 📄 composer.json                  # PHP Dependencies
├── 📄 composer.lock                  # Dependency Lock File
├── 📄 think                          # CLI Command Tool
├── 📄 .gitignore                     # Git Ignore Rules
└── 📄 README.md                      # Project Documentation
```

## 💻 Technical Specifications

### Core Technologies Stack
- **Frontend Framework**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend Framework**: ThinkPHP 5.1.x (PHP MVC Framework)
- **Database Engine**: MySQL 5.7.31 with utf8mb4 charset
- **Web Server**: Apache 2.4.46 with mod_rewrite enabled
- **Development Environment**: WAMP64 3.2.3 (Windows, Apache, MySQL, PHP)

### System Requirements (Exact Match)
- **Operating System**: Windows 10 Build 26100 or later
- **Web Server**: Apache 2.4.46 (Port 80)
- **PHP Runtime**: Version 7.3.21 with extensions:
  - `mysql` - Database connectivity
  - `json` - JSON processing
  - `mbstring` - Multi-byte string handling
  - `curl` - HTTP requests
  - `gd` - Image processing (optional)
- **Database**: MySQL 5.7.31 (Port 3306) or MariaDB 10.4.13 (Port 3307)
- **Memory Requirements**: Minimum 512MB RAM allocated to PHP
- **Storage Space**: At least 200MB free disk space for installation

### WAMP64 Configuration Profile
Based on your exact `wampmanager.conf` settings:
```ini
[main]
language = "english"
wampserverVersion = "3.2.3"
installDir = "c:/wamp64"
installVersion = "3.2.3"
navigator = "C:/Program Files (x86)/Internet Explorer/iexplore.exe"
editor = "C:/Windows/System32/notepad.exe"
wampserverMode = "64bit"
installDate = "2025-05-22"

[php]
phpVersion = "7.3.21"
phpIniDir = "."
phpConfFile = "php.ini"
mysqlDefaultPort = "3306"

[apache]
apacheVersion = "2.4.46"
apacheExeDir = "bin"
apacheConfFile = "httpd.conf"
apachePortUsed = "80"

[mysql]
mysqlVersion = "5.7.31"
mysqlConfFile = "my.ini"
mysqlPortUsed = "3306"

[mariadb]
mariadbVersion = "10.4.13"
mariaPortUsed = "3307"
mariaUseOtherPort = "on"
```

### Project Metrics
- **Total Files**: 152 files across all modules
- **Lines of Code**: 31,039+ lines (production-ready)
- **Database Tables**: 7 main tables + 2 junction tables
- **API Endpoints**: 12+ RESTful endpoints
- **Movie Collection**: 7 featured movies (Animation, Action, Drama, Adventure, Sci-Fi, Mystery)
- **Theater Network**: 6 cinema locations with different amenities
- **Promotional Offers**: 5 active discount programs
- **Seating Zones**: 4 different pricing categories

## 🚀 Installation Guide

### Prerequisites Checklist
- [ ] Windows 10 Build 26100 or later
- [ ] Administrative privileges for software installation
- [ ] At least 2GB free disk space
- [ ] Internet connection for downloading components

### Step 1: WAMP64 Installation (Exact Version Match)

1. **Download WAMP64 3.2.3**:
   - Visit official WampServer website
   - Download **WAMP64 3.2.3** (64-bit version)
   - File size: ~400MB

2. **Install WAMP64**:
   - Run installer as Administrator
   - Install to default location: `C:\wamp64\`
   - Choose default browser: Internet Explorer (can be changed later)
   - Choose default text editor: Notepad (can be changed later)
   - Complete installation and restart if prompted

3. **Verify WAMP64 Installation**:
   - Check system tray for WAMP64 icon
   - Icon should be **green** (all services running)
   - If red/orange, troubleshoot service conflicts

### Step 2: Project Deployment

1. **Download Repository**:
   ```bash
   git clone https://github.com/218451LIJIAQI/Alpha-Striker-2.0_Web-Project.git
   ```
   OR download ZIP file and extract

2. **Deploy to WAMP64**:
   - Copy ALL files from downloaded repository
   - Paste to: `C:\wamp64\www\`
   - Final structure: `C:\wamp64\www\[all project files]`
   - **IMPORTANT**: Do NOT create a subfolder - files should be directly in www/

3. **Verify File Structure**:
   ```
   C:\wamp64\www\
   ├── application/
   ├── config/
   ├── public/
   ├── movies.sql
   ├── composer.json
   └── README.md
   ```

### Step 3: Database Setup (Critical Step)

1. **Access phpMyAdmin**:
   - Click WAMP64 icon in system tray
   - Select "phpMyAdmin"
   - OR navigate to: `http://localhost/phpmyadmin/`
   - Default login: username `root`, password (empty)

2. **Import Database Schema**:
   - In phpMyAdmin, click **"Import"** tab
   - Click **"Choose File"** and select `movies.sql` from `C:\wamp64\www\`
   - Ensure format is set to **"SQL"**
   - Click **"Go"** to execute import
   - Wait for completion message

3. **Verify Database Import**:
   - Check left sidebar for **"movies"** database
   - Expand "movies" to see tables:
     - `t_movies` (7 records)
     - `t_theater` (6 records)
     - `t_user` (1 record: LI JIAQI)
     - `t_seat` (booking records)
     - `t_offer` (5 promotional offers)
     - `theater_movie` (junction table)
     - `movie_offer` (junction table)

4. **Database Configuration Verification**:
   - Check `config/database.php` for correct settings:
   ```php
   'hostname' => 'localhost',
   'database' => 'movies',
   'username' => 'root',
   'password' => '',
   'hostport' => '3306',
   'prefix' => 't_',
   'charset' => 'utf8',
   ```

### Step 4: Apache Configuration

1. **Verify mod_rewrite**:
   - Check that `public/.htaccess` exists
   - Ensure Apache mod_rewrite is enabled (default in WAMP64)

2. **URL Rewriting Rules** (in `public/.htaccess`):
   ```apache
   <IfModule mod_rewrite.c>
     Options +FollowSymlinks -Multiviews
     RewriteEngine On
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteRule ^(.*)$ index.php/$1 [QSA,PT,L]
   </IfModule>
   ```

### Step 5: System Testing

1. **Service Status Check**:
   - WAMP64 icon should be **GREEN**
   - Apache: Running on port 80
   - MySQL: Running on port 3306

2. **Database Connectivity**:
   - Access: `http://localhost/phpmyadmin/`
   - Verify "movies" database is accessible

3. **Application Access**:
   - Open browser: `http://localhost/`
   - Should display: "Welcome to Alpha Striker 2.0"
   - Auto-redirect to: `http://localhost/pages/homepage.html`

4. **Test Key Features**:
   - Movie browsing: Should display 7 movies
   - Search functionality: Try searching "Frozen"
   - User login: Test with email `218451@student.upm.edu.my`, password `218451`
   - Theater selection: Should show 6 theaters

### Step 6: Directory Permissions

Ensure write permissions for:
- `runtime/` - Application cache and temporary files
- `runtime/log/` - Error and access logs
- `public/uploads/` - File uploads (if applicable)

### Step 7: Security Configuration

1. **Change Default Passwords**:
   - MySQL root password (currently empty)
   - Admin panel access credentials

2. **File Permissions**:
   - Restrict access to `config/` directory
   - Protect sensitive configuration files

### Common Installation Issues

1. **WAMP64 Icon Not Green**:
   - Port 80 conflict: Check Skype, IIS, other web servers
   - Port 3306 conflict: Check existing MySQL installations
   - Run `wampmanager.exe` as Administrator

2. **Database Import Fails**:
   - Check file encoding (should be UTF-8)
   - Verify MySQL service is running
   - Check for existing "movies" database

3. **Page Not Found (404)**:
   - Verify files are in `C:\wamp64\www\` directly
   - Check Apache service status
   - Ensure mod_rewrite is enabled

4. **API Errors**:
   - Check PHP error logs in `runtime/log/`
   - Verify database connection settings
   - Ensure proper file permissions

## Application Features

### Frontend Features
- **Movie Browsing**: Browse movies by genre, search functionality
- **Theater Selection**: Choose from multiple theaters with different amenities
- **Seat Selection**: Interactive seat selection with real-time availability
- **Booking Management**: Complete booking process with ticket generation
- **User Authentication**: Login and registration system
- **Promotional Offers**: Special deals and discounts
- **Responsive Design**: Mobile-friendly interface

### Backend Features
- **RESTful API**: JSON-based API for frontend-backend communication
- **Database Management**: MySQL/MariaDB with proper table relationships
- **User Management**: Secure user authentication and session management
- **Booking System**: Complete seat reservation and booking management
- **Admin Panel**: Administrative interface for managing content

## 🗄️ Database Schema

### Database Overview
- **Database Name**: `movies`
- **Character Set**: `utf8mb4`
- **Collation**: `utf8mb4_bin`
- **Engine**: InnoDB
- **Total Tables**: 9 (7 main + 2 junction tables)

### Core Tables Structure

#### 1. Movies Table (`t_movies`)
```sql
CREATE TABLE `t_movies` (
  `movie_code`   bigint(20) NOT NULL AUTO_INCREMENT COMMENT 'Movie ID',
  `movie_name`   varchar(200) DEFAULT NULL COMMENT 'Name',
  `tag`          varchar(50) DEFAULT NULL COMMENT 'Tag (FEATURED)',
  `star`         decimal(10,1) DEFAULT NULL COMMENT 'Rating',
  `movie_type`   varchar(50) DEFAULT NULL COMMENT 'Genre',
  `img`          varchar(500) DEFAULT NULL COMMENT 'Poster Image URL',
  `money`        decimal(10,2) DEFAULT NULL COMMENT 'Ticket Price',
  `times`        varchar(50) DEFAULT NULL COMMENT 'Duration',
  `create_time`  datetime DEFAULT NULL,
  `update_time`  datetime DEFAULT NULL,
  PRIMARY KEY (`movie_code`)
) ENGINE=InnoDB AUTO_INCREMENT=8;
```

**Sample Data (7 Movies)**:
- Frozen 2 (Animation) - $39.00, 1h 43m, FEATURED
- The Avengers (Action) - $39.00, 2h 23m
- Joker (Drama) - $39.00, 2h 2m
- Jumanji: The Next Level (Adventure) - $39.00, 2h 3m
- Star Wars: The Rise of Skywalker (Sci-Fi) - $39.00, 2h 22m
- Knives Out (Mystery) - $39.00, 2h 10m
- A Minecraft Movie (Adventure) - $39.00, 1h 41m

#### 2. Theater Table (`t_theater`)
```sql
CREATE TABLE `t_theater` (
  `theater_code` bigint(20) NOT NULL AUTO_INCREMENT,
  `theater_name` varchar(200) DEFAULT NULL,
  `address`      varchar(500) DEFAULT NULL,
  `amenity`      varchar(500) DEFAULT NULL,
  `star`         decimal(10,1) DEFAULT NULL,
  `img`          varchar(500) DEFAULT NULL,
  `reviews`      varchar(50) DEFAULT NULL,
  `create_time`  datetime DEFAULT NULL,
  PRIMARY KEY (`theater_code`)
) ENGINE=InnoDB AUTO_INCREMENT=7;
```

**Theater Network (6 Locations)**:
1. **Cinemark Premium** (5.0⭐) - 123 Main Street, Downtown
   - Amenities: IMAX, Dolby Atmos, Recliner Seats, Food Service
2. **AMC Deluxe 16** (4.7⭐) - 789 Plaza Avenue, Westside Mall
   - Amenities: 4DX, RPX, Premium Lounge, Bar
3. **Regal Cityview** (4.5⭐) - 456 Tower Road, Uptown
   - Amenities: ScreenX, VIP Seating, Full Restaurant, Arcade
4. **Landmark Artisan Cinema** (4.9⭐) - 321 Arts District, Old Town
   - Amenities: Indie Films, Reserved Seating, Wine Bar, Film Club
5. **Galaxy Premium Theater** (4.6⭐) - 987 Skyline Drive, Northside
   - Amenities: Recliners, IMAX, D-BOX Motion, Dine-In
6. **Alamo Drafthouse** (4.8⭐) - 654 Entertainment Blvd, Eastside
   - Amenities: Full Menu, Craft Beer, Zero Talking Policy, Theme Nights

#### 3. User Table (`t_user`)
```sql
CREATE TABLE `t_user` (
  `user_code`   bigint(20) NOT NULL AUTO_INCREMENT,
  `user_name`   varchar(50) DEFAULT NULL,
  `email`       varchar(100) DEFAULT NULL,
  `login_pwd`   varchar(50) DEFAULT NULL,
  `create_time` datetime DEFAULT NULL,
  `update_time` datetime DEFAULT NULL,
  PRIMARY KEY (`user_code`)
) ENGINE=InnoDB;
```

**Default User**: LI JIAQI (218451@student.upm.edu.my)

#### 4. Seat Booking Table (`t_seat`)
```sql
CREATE TABLE `t_seat` (
  `seat_code`    bigint(20) NOT NULL AUTO_INCREMENT,
  `movie_code`   bigint(20) DEFAULT NULL,
  `user_code`    bigint(20) DEFAULT NULL,
  `date`         varchar(20) DEFAULT NULL,
  `time`         varchar(70) DEFAULT NULL,
  `seat_num`     varchar(10) DEFAULT NULL COMMENT 'Seat (A4, B5, etc.)',
  `seat_zone`    bigint(20) DEFAULT NULL COMMENT 'Pricing Zone',
  `theater_code` bigint(20) DEFAULT 1,
  `create_time`  datetime DEFAULT NULL,
  PRIMARY KEY (`seat_code`),
  FOREIGN KEY (`movie_code`) REFERENCES `t_movies`(`movie_code`),
  FOREIGN KEY (`user_code`) REFERENCES `t_user`(`user_code`)
) ENGINE=InnoDB;
```

**Seating System**:
- Seat format: A1-A10, B1-B10, C1-C10, D1-D10, E1-E10
- Zones: 1 (Premium), 2 (Standard), 3 (Economy), 4 (Balcony)
- Times: 09:30 AM, 12:00 PM, 03:30 PM, 06:00 PM, 09:00 PM

#### 5. Promotional Offers Table (`t_offer`)
```sql
CREATE TABLE `t_offer` (
  `offer_code`      bigint(20) NOT NULL AUTO_INCREMENT,
  `offer_title`     varchar(200) DEFAULT NULL,
  `offer_type`      varchar(255) DEFAULT NULL,
  `offer_description` varchar(500) DEFAULT NULL,
  `promo_code`      varchar(500) DEFAULT NULL,
  `offer_validity`  varchar(20) DEFAULT NULL,
  `img`             varchar(500) DEFAULT NULL,
  `badge`           varchar(50) DEFAULT NULL,
  `money`           decimal(10,2) DEFAULT NULL,
  `create_time`     datetime DEFAULT NULL,
  PRIMARY KEY (`offer_code`)
) ENGINE=InnoDB AUTO_INCREMENT=6;
```

**Active Promotions (5 Offers)**:
1. **Student Discount Pass** (EXCLUSIVE) - 30% off with student ID
   - Code: STUDENT30, Valid: 2025-12-31
2. **Wednesday Refreshment Deal** (WEEKLY) - Free medium beverage
   - Code: WEDNESDAYSIP, Valid: 2025-12-31
3. **Date Night Special: May 20** (LIMITED TIME) - Free large popcorn for couples
   - Code: COUPLEPOPCORN520, Valid: 2025-05-20
4. **Family Fun Package** (POPULAR) - Buy 3 get 1 free + 20% off combo
   - Code: FAMILY4FUN, Valid: 2025-12-31
5. **Birthday Celebration Package** (EXCLUSIVE) - Free ticket + treat
   - Code: BDAYMOVIE, Valid: 2025-12-31

### Junction Tables

#### 6. Theater-Movie Relationships (`theater_movie`)
```sql
CREATE TABLE `theater_movie` (
  `theater_code` bigint(20) NOT NULL,
  `movie_code`   bigint(20) NOT NULL,
  `start_date`   date DEFAULT NULL,
  `end_date`     date DEFAULT NULL,
  `daily_showtimes` int DEFAULT 3,
  PRIMARY KEY (`theater_code`, `movie_code`),
  FOREIGN KEY (`theater_code`) REFERENCES `t_theater`(`theater_code`),
  FOREIGN KEY (`movie_code`) REFERENCES `t_movies`(`movie_code`)
) ENGINE=InnoDB;
```

#### 7. Movie-Offer Relationships (`movie_offer`)
```sql
CREATE TABLE `movie_offer` (
  `movie_code`      bigint(20) NOT NULL,
  `offer_code`      bigint(20) NOT NULL,
  `discount_percent` decimal(5,2) DEFAULT 0.00,
  `valid_from`      date DEFAULT NULL,
  `valid_to`        date DEFAULT NULL,
  PRIMARY KEY (`movie_code`, `offer_code`),
  FOREIGN KEY (`movie_code`) REFERENCES `t_movies`(`movie_code`),
  FOREIGN KEY (`offer_code`) REFERENCES `t_offer`(`offer_code`)
) ENGINE=InnoDB;
```

### Database Indexes (Performance Optimization)

```sql
-- Performance indexes
CREATE INDEX idx_seat_movie ON `t_seat`(`movie_code`);
CREATE INDEX idx_seat_user ON `t_seat`(`user_code`);
CREATE INDEX idx_offer_user ON `t_offer`(`user_code`);
CREATE INDEX idx_theater_movie_theater ON `theater_movie`(`theater_code`);
CREATE INDEX idx_theater_movie_movie ON `theater_movie`(`movie_code`);
CREATE INDEX idx_movie_offer_movie ON `movie_offer`(`movie_code`);
CREATE INDEX idx_movie_offer_offer ON `movie_offer`(`offer_code`);
```

### Data Relationships
- Each theater can show multiple movies (Many-to-Many)
- Each movie can have multiple promotional offers (Many-to-Many)
- Users can book multiple seats across different movies/times
- Seats are linked to specific movies, theaters, dates, and times
- All foreign key constraints ensure data integrity

## 🔌 API Documentation

### Base URL
```
http://localhost/index.php/
```

### Authentication
- **Type**: Session-based authentication
- **Login Required**: For seat booking and user-specific features
- **Admin Access**: Separate admin authentication for management features

### Movie Management API

#### 1. Get Movie List
```http
GET /movie/movies/getMovieList?genre={genre}
```
**Parameters:**
- `genre` (optional): `all`, `Action`, `Comedy`, `Drama`, `Horror`, `Animation`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "movie_code": 1,
      "movie_name": "Frozen 2",
      "star": 5.0,
      "tag": "FEATURED",
      "movie_type": "Animation",
      "img": "../img/homepage/frozen_2.jpeg",
      "times": "1h 43m"
    }
  ]
}
```

#### 2. Search Movies
```http
GET /movie/movies/searchMovies?keyword={keyword}
```
**Parameters:**
- `keyword` (required): Search term for movie names

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "movie_code": 1,
      "movie_name": "Frozen 2",
      "star": 5.0,
      "money": 39.00,
      "movie_type": "Animation",
      "img": "../img/homepage/frozen_2.jpeg",
      "times": "1h 43m"
    }
  ]
}
```

#### 3. Get Movie Details
```http
GET /movie/movies/getMovieByCode?movie_code={movie_code}
```
**Parameters:**
- `movie_code` (required): Movie ID

**Response:**
```json
{
  "success": true,
  "data": {
    "movie_code": 1,
    "movie_name": "Frozen 2",
    "tag": "FEATURED",
    "star": 5.0,
    "movie_type": "Animation",
    "img": "../img/homepage/frozen_2.jpeg",
    "money": 39.00,
    "times": "1h 43m",
    "create_time": "2025-05-19 23:00:28"
  }
}
```

### Theater Management API

#### 4. Get Theater List
```http
GET /theater/theater/getTheaterList?address={address}&amenity={amenity}
```
**Parameters:**
- `address` (optional): Filter by address keyword
- `amenity` (optional): Filter by amenity keyword

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "theater_code": 1,
      "theater_name": "Cinemark Premium",
      "address": "123 Main Street, Downtown",
      "amenity": "IMAX,Dolby Atmos,Recliner Seats,Food Service",
      "star": 5.0,
      "img": "../img/theater/cinemark.jpeg",
      "reviews": "234 reviews"
    }
  ]
}
```

#### 5. Get Theater Details
```http
GET /theater/theater/getTheaterDetails?theater_code={theater_code}
```
**Parameters:**
- `theater_code` (required): Theater ID

### Seat Booking API

#### 6. Get Seat List
```http
GET /movie/seat/getSeatList?movie_code={movie_code}&date={date}&time={time}
```
**Parameters:**
- `movie_code` (required): Movie ID
- `date` (required): Show date (format: "20")
- `time` (required): Show time (format: "09:30 AM")

**Response:**
```json
{
  "success": true,
  "data": [
    {"seat_num": "A4"},
    {"seat_num": "E7"},
    {"seat_num": "C4"}
  ]
}
```

#### 7. Save Seat Booking
```http
POST /movie/seat/saveSeats
Content-Type: application/x-www-form-urlencoded
```
**Parameters:**
- `movie_code` (required): Movie ID
- `date` (required): Show date
- `time` (required): Show time
- `seat_nums` (required): Array or comma-separated seat numbers
- `user_code` (required): User ID

**Response:**
```json
{
  "success": true,
  "data": 2
}
```

#### 8. Get User Bookings
```http
GET /movie/seat/getSeatListByUserCode?user_code={user_code}
```
**Parameters:**
- `user_code` (required): User ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "20",
      "time": "09:30 AM",
      "movie_code": 2,
      "seat_num": "A4",
      "seat_code": 8,
      "movie_info": {
        "movie_name": "The Avengers",
        "movie_type": "Action",
        "img": "../img/homepage/the_avengers.jpeg"
      }
    }
  ]
}
```

### User Authentication API

#### 9. User Registration
```http
POST /user/user/reg
Content-Type: application/x-www-form-urlencoded
```
**Parameters:**
- `name` (required): Username
- `email` (required): Email address
- `password` (required): Password

**Response:**
```json
{
  "success": true,
  "message": "Registration successful"
}
```

#### 10. User Login
```http
POST /user/user/login
Content-Type: application/x-www-form-urlencoded
```
**Parameters:**
- `email` (required): Email address
- `password` (required): Password

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user_id": 1,
    "user_name": "LI JIAQI",
    "email": "218451@student.upm.edu.my"
  }
}
```

#### 11. Password Reset
```http
POST /user/user/changePassword
Content-Type: application/x-www-form-urlencoded
```
**Parameters:**
- `email` (required): Email address
- `pwd` (required): New password
- `verification_code` (required): Verification code (default: "888888")

### Error Handling

#### Standard Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```

#### Common Error Codes
- **400**: Bad Request - Missing required parameters
- **401**: Unauthorized - Invalid login credentials
- **404**: Not Found - Resource doesn't exist
- **500**: Internal Server Error - Database or server issues

### Rate Limiting
- No rate limiting currently implemented
- Recommended: 100 requests per minute per IP

### Testing Tools
**Default Test Account:**
- Email: `218451@student.upm.edu.my`
- Password: `218451`

**API Testing with cURL:**
```bash
# Get movie list
curl "http://localhost/index.php/movie/movies/getMovieList?genre=all"

# Search movies
curl "http://localhost/index.php/movie/movies/searchMovies?keyword=Frozen"

# User login
curl -X POST "http://localhost/index.php/user/user/login" \
  -d "email=218451@student.upm.edu.my&password=218451"
```

## Configuration Files

### Database Configuration (`config/database.php`)
```php
'hostname' => 'localhost',
'database' => 'movies',
'username' => 'root',
'password' => '',
'hostport' => '3306',
'prefix' => 't_',
```

### Application Configuration (`config/app.php`)
- Debug mode: Disabled in production
- Default module: `index`
- Default controller: `Index`
- URL rewriting: Enabled

## Troubleshooting

### Common Issues

1. **WAMP64 Icon Not Green**:
   - Check if ports 80 (Apache) and 3306 (MySQL) are free
   - Restart WAMP64 services
   - Check Windows Firewall settings

2. **Database Connection Failed**:
   - Verify MySQL service is running
   - Check database credentials in `config/database.php`
   - Ensure `movies` database exists

3. **Page Not Found (404)**:
   - Verify Apache service is running
   - Check if project files are in correct directory
   - Verify `.htaccess` files are present

4. **PHP Errors**:
   - Check PHP version compatibility (7.3.21 recommended)
   - Verify all required PHP extensions are enabled
   - Check error logs in `runtime/log/`

### Log Files

- Apache logs: `C:\wamp64\logs\apache_error.log`
- MySQL logs: `C:\wamp64\logs\mysql.log`
- Application logs: `runtime/log/`

## Maintenance

### Regular Tasks
- Monitor log files for errors
- Backup database regularly
- Update WAMP64 components as needed
- Clear application cache in `runtime/` directory

### Performance Optimization
- Enable PHP OPcache
- Optimize database queries
- Implement proper caching strategies
- Compress static assets

## Security Considerations

- Change default MySQL root password
- Implement proper input validation
- Use HTTPS in production
- Regular security updates
- Backup sensitive data

## Support

For technical support or issues:
1. Check the troubleshooting section above
2. Review log files for error details
3. Verify system requirements are met
4. Contact the development team

## License

This project is licensed under the Apache License 2.0. See the LICENSE file for details.

---

**Note**: This deployment guide is specifically designed for the WAMP64 3.2.3 environment on Windows 10. For other environments or versions, configuration may vary. 

Have any questions? Feel free to email: 218451@student.upm.edu.my
