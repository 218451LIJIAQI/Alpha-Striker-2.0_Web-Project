<?php
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (
    $requestPath !== '/' &&
    $requestPath !== '/index.php' &&
    strpos($requestPath, '/index.php/') !== 0 &&
    is_file(__DIR__ . $requestPath)
) {
    return false;
}

require __DIR__ . '/index.php';
