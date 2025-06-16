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

// +----------------------------------------------------------------------
// | Session Settings
// +----------------------------------------------------------------------

return [
    'id'             => '',
    // SESSION_ID submission variable, solves flash upload cross-domain issues
    'var_session_id' => '',
    // SESSION prefix
    'prefix'         => 'think',
    // Driver type, supports redis memcache memcached
    'type'           => '',
    // Whether to automatically start SESSION
    'auto_start'     => true,
];
