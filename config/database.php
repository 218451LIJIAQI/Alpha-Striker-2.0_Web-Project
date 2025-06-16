<?php
// +----------------------------------------------------------------------
// | ThinkPHP [ WE CAN DO IT JUST THINK ]
// +----------------------------------------------------------------------
// | Copyright (c) 2006~2018 http://thinkphp.cn All rights reserved.
// +----------------------------------------------------------------------
// | Licensed ( http://www.apache.org/licenses/LICENSE-2.0 )
// +----------------------------------------------------------------------
// | Author: liu21st <liu21st@gmail.com>
// +----------------------------------------------------------------------

return [
    // Database type
    'type'            => 'mysql',
    // Server address
    'hostname'        => 'localhost',
    // Database name
    'database'        => 'movies',
    // Username
    'username'        => 'root',
    // Password
    'password'        => '',
    // Port
    'hostport'        => '3306',
    // Connection DSN
    'dsn'             => '',
    // Database connection parameters
    'params'          => [],
    // Database encoding defaults to utf8
    'charset'         => 'utf8',
    // Database table prefix
    'prefix'          => 't_',
    // Database debug mode
    'debug'           => false,
    // Database deployment: 0 centralized (single server), 1 distributed (master-slave)
    'deploy'          => 0,
    // Whether database read-write separation is enabled (valid for master-slave)
    'rw_separate'     => false,
    // Number of master servers after read-write separation
    'master_num'      => 1,
    // Specify slave server number
    'slave_no'        => '',
    // Automatically read master database data
    'read_master'     => false,
    // Whether to strictly check if fields exist
    'fields_strict'   => true,
    // Dataset return type
    'resultset_type'  => 'array',
    // Auto write timestamp fields
    'auto_timestamp'  => false,
    // Default time format after time field extraction
    'datetime_format' => 'Y-m-d H:i:s',
    // Whether SQL performance analysis is needed
    'sql_explain'     => false,
    // Builder class
    'builder'         => '',
    // Query class
    'query'           => '\\think\\db\\Query',
    // Whether reconnection is needed after disconnection
    'break_reconnect' => false,
    // Disconnection identifier strings
    'break_match_str' => [],
];
