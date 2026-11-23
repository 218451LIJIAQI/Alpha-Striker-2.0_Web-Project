<?php
use think\facade\Env;

return [
    'type'            => Env::get('database.type', 'mysql'),
    'hostname'        => Env::get('database.hostname', '127.0.0.1'),
    'database'        => Env::get('database.database', 'movies'),
    'username'        => Env::get('database.username', 'root'),
    'password'        => Env::get('database.password', ''),
    'hostport'        => Env::get('database.hostport', '3306'),
    'dsn'             => '',
    'params'          => [],
    'charset'         => Env::get('database.charset', 'utf8mb4'),
    'prefix'          => Env::get('database.prefix', 't_'),
    'debug'           => Env::get('database.debug', false),
    'fields_strict'   => true,
    'resultset_type'  => 'array',
    'auto_timestamp'  => false,
    'datetime_format' => 'Y-m-d H:i:s',
];
