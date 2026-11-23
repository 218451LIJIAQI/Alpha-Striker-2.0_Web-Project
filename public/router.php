<?php
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($requestPath === '/') {
    readfile(__DIR__ . '/index.html');
    return true;
}

$publicRoot = realpath(__DIR__);
$candidate  = $publicRoot !== false ? realpath(__DIR__ . $requestPath) : false;

if (
    $requestPath !== '/index.php' &&
    $requestPath !== '/router.php' &&
    strpos($requestPath, '/index.php/') !== 0 &&
    $candidate !== false &&
    strpos($candidate, $publicRoot . DIRECTORY_SEPARATOR) === 0 &&
    is_file($candidate)
) {
    return false;
}

require __DIR__ . '/index.php';
