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
// | Template settings
// +----------------------------------------------------------------------

return [
    // Template engine type supports php think supports extensions
    'type'         => 'Think',
    // Default template rendering rule 1 parse to lowercase+underscore 2 convert all to lowercase 3 keep operation method
    'auto_rule'    => 1,
    // Template path
    'view_path'    => '',
    // Template suffix
    'view_suffix'  => 'html',
    // Template filename separator
    'view_depr'    => DIRECTORY_SEPARATOR,
    // Template engine normal tag start mark
    'tpl_begin'    => '{',
    // Template engine normal tag end mark
    'tpl_end'      => '}',
    // Tag library tag start mark
    'taglib_begin' => '{',
    // Tag library tag end mark
    'taglib_end'   => '}',
];
