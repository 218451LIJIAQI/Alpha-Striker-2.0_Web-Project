# Alpha Striker 2.0 - Movie Booking System

## Overview

Alpha Striker 2.0 is a comprehensive movie ticket booking system that allows users to browse movies, select theaters, book seats, and manage reservations. The system features a modern web interface built with HTML, CSS, and JavaScript, powered by a PHP backend using the ThinkPHP 5.1 framework.

## Project Structure

```
├── application/              # Backend application modules
│   ├── admin/               # Admin panel functionality
│   ├── index/               # Main application controller
│   ├── movie/               # Movie management (controllers & models)
│   ├── offer/               # Promotional offers management
│   ├── seat/                # Seat booking management
│   ├── theater/             # Theater management
│   └── user/                # User management
├── config/                  # Configuration files
│   ├── app.php              # Application configuration
│   ├── database.php         # Database configuration
│   ├── cache.php            # Cache configuration
│   └── ...                  # Other config files
├── public/                  # Public web files (Document Root)
│   ├── admin/               # Admin panel frontend
│   ├── components/          # Reusable UI components
│   ├── css/                 # Stylesheets
│   ├── img/                 # Images and media files
│   ├── js/                  # JavaScript files
│   ├── pages/               # HTML pages
│   ├── static/              # Static assets
│   ├── index.php            # Main entry point
│   └── ...                  # Other public files
├── route/                   # URL routing configuration
├── runtime/                 # Runtime files and cache
├── thinkphp/                # ThinkPHP framework core
├── vendor/                  # Composer dependencies
├── movies.sql               # Database schema and sample data
├── composer.json            # PHP dependencies
└── think                    # CLI tool for ThinkPHP
```

## System Requirements

- **Operating System**: Windows 10 or later
- **Web Server**: Apache 2.4.46 (included in WAMP64 3.2.3)
- **PHP**: Version 7.3.21 (included in WAMP64)
- **Database**: MySQL 5.7.31 or MariaDB 10.4.13 (included in WAMP64)
- **WAMP64**: Version 3.2.3

## Installation and Deployment

### Step 1: Install WAMP64

1. Download and install **WAMP64 3.2.3** from the official website
2. Install WAMP64 to the default location: `C:\wamp64\`
3. Ensure all services (Apache, MySQL/MariaDB) are running

### Step 2: Download and Extract Project Files

1. Download all contents from this repository
2. Extract the project files to your WAMP64 www directory: `C:\wamp64\www\`
3. Your project structure should be: `C:\wamp64\www\[all project files]`

### Step 3: Database Setup

1. **Start WAMP64 services**:
   - Open WAMP64 (should show green icon in system tray)
   - Ensure Apache and MySQL services are running

2. **Access phpMyAdmin**:
   - Click on WAMP64 icon → phpMyAdmin
   - Or navigate to: `http://localhost/phpmyadmin/`

3. **Import Database**:
   - In phpMyAdmin, click "Import" tab
   - Choose the `movies.sql` file from your project root
   - Click "Go" to import
   - This will create the `movies` database with all required tables and sample data

4. **Database Configuration**:
   - Database Name: `movies`
   - Username: `root`
   - Password: (empty)
   - Host: `localhost`
   - Port: `3306`
   - Table Prefix: `t_`

### Step 4: WAMP64 Configuration

Your WAMP64 should be configured as follows (based on `wampmanager.conf`):

- **Apache**: Version 2.4.46, Port 80
- **PHP**: Version 7.3.21
- **MySQL**: Version 5.7.31, Port 3306
- **MariaDB**: Version 10.4.13, Port 3307 (optional)
- **Installation Directory**: `C:\wamp64\`

### Step 5: Verify Installation

1. **Check WAMP64 Status**:
   - WAMP64 icon should be **green** in system tray
   - If orange or red, check service status

2. **Test Database Connection**:
   - Open `http://localhost/phpmyadmin/`
   - Verify `movies` database exists with tables

3. **Access Application**:
   - Open browser and navigate to: `http://localhost/`
   - You should see the Alpha Striker 2.0 welcome page
   - The system will automatically redirect to the homepage

### Step 6: Directory Permissions

Ensure the following directories have write permissions:
- `runtime/` - For application cache and logs
- `public/uploads/` - For uploaded files (if applicable)

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

## Database Schema

The system uses the following main tables:
- `t_movies` - Movie information
- `t_theater` - Theater details
- `t_user` - User accounts
- `t_seat` - Seat bookings
- `t_offer` - Promotional offers
- `theater_movie` - Theater-Movie relationships
- `movie_offer` - Movie-Offer relationships

## API Endpoints

Key API endpoints include:
- `GET /movie/movies/getMovieList` - Retrieve movie list
- `GET /movie/movies/searchMovies` - Search movies
- `GET /movie/movies/getMovieByCode` - Get movie details
- `POST /movie/seat/bookSeat` - Book seats
- `GET /user/getUserInfo` - Get user information

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