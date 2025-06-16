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
// | Log Settings
// +----------------------------------------------------------------------
return [
    // Log recording method, built-in file socket supports extensions
    'type'        => 'File',
    // Log save directory
    'path'        => '',
    // Log recording level
    'level'       => [],
    // Single file log writing
    'single'      => false,
    // Independent log level
    'apart_level' => [],
    // Maximum number of log files
    'max_files'   => 0,
    // Whether to close log writing
    'close'       => false,
];
