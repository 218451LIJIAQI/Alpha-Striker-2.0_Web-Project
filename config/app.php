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
// | Application Settings
// +----------------------------------------------------------------------

return [
    // Application name
    'app_name'               => '',
    // Application address
    'app_host'               => '',
    // Application debug mode
    'app_debug'              => false,
    // Application trace
    'app_trace'              => false,
    // Whether to support multi-module
    'app_multi_module'       => true,
    // Entry auto-bind module
    'auto_bind_module'       => false,
    // Registered root namespace
    'root_namespace'         => [],
    // Default output type
    'default_return_type'    => 'html',
    // Default AJAX data return format, optional json xml ...
    'default_ajax_return'    => 'json',
    // Default JSONP format return processing method
    'default_jsonp_handler'  => 'jsonpReturn',
    // Default JSONP processing method
    'var_jsonp_handler'      => 'callback',
    // Default timezone
    'default_timezone'       => 'UTC',
    // Whether to enable multi-language
    'lang_switch_on'         => true,
    // Default global filter method, separated by commas
    'default_filter'         => '',
    // Default language
    'default_lang'           => 'en',
    // Application class library suffix
    'class_suffix'           => false,
    // Controller class suffix
    'controller_suffix'      => false,

    // +----------------------------------------------------------------------
    // | Module Settings
    // +----------------------------------------------------------------------

    // Default module name
    'default_module'         => 'index',
    // Forbidden access modules
    'deny_module_list'       => ['common'],
    // Default controller name
    'default_controller'     => 'Index',
    // Default action name
    'default_action'         => 'index',
    // Default validator
    'default_validate'       => '',
    // Default empty module name
    'empty_module'           => '',
    // Default empty controller name
    'empty_controller'       => 'Error',
    // Action method prefix
    'use_action_prefix'      => false,
    // Action method suffix
    'action_suffix'          => '',
    // Auto search controller
    'controller_auto_search' => false,

    // +----------------------------------------------------------------------
    // | URL Settings
    // +----------------------------------------------------------------------

    // PATHINFO variable name for compatibility mode
    'var_pathinfo'           => 's',
    // Compatible PATH_INFO retrieval
    'pathinfo_fetch'         => ['ORIG_PATH_INFO', 'REDIRECT_PATH_INFO', 'REDIRECT_URL'],
    // Pathinfo separator
    'pathinfo_depr'          => '/',
    // HTTPS proxy identifier
    'https_agent_name'       => '',
    // IP proxy retrieval identifier
    'http_agent_ip'          => 'X-REAL-IP',
    // URL pseudo-static suffix
    'url_html_suffix'        => 'html',
    // URL common parameters for automatic generation
    'url_common_param'       => false,
    // URL parameter method 0: parse by name in pairs 1: parse by order
    'url_param_type'         => 0,
    // Whether to enable route lazy parsing
    'url_lazy_route'         => false,
    // Whether to force route usage
    'url_route_must'         => false,
    // Merge route rules
    'route_rule_merge'       => false,
    // Whether route is completely matched
    'route_complete_match'   => false,
    // Use annotation routing
    'route_annotation'       => false,
    // Domain root, e.g. thinkphp.cn
    'url_domain_root'        => '',
    // Whether to automatically convert controller and action names in URL
    'url_convert'            => true,
    // Default access controller layer
    'url_controller_layer'   => 'controller',
    // Form request type masquerading variable
    'var_method'             => '_method',
    // Form ajax masquerading variable
    'var_ajax'               => '_ajax',
    // Form pjax masquerading variable
    'var_pjax'               => '_pjax',
    // Whether to enable request caching, true for auto caching, supports setting request cache rules
    'request_cache'          => false,
    // Request cache expiration time
    'request_cache_expire'   => null,
    // Global request cache exclusion rules
    'request_cache_except'   => [],
    // Whether to enable route caching
    'route_check_cache'      => false,
    // Route cache key custom setting (closure), default is md5 of current URL and request type
    'route_check_cache_key'  => '',
    // Route cache type and parameters
    'route_cache_option'     => [],

    // Default template file for redirect page
    'dispatch_success_tmpl'  => Env::get('think_path') . 'tpl/dispatch_jump.tpl',
    'dispatch_error_tmpl'    => Env::get('think_path') . 'tpl/dispatch_jump.tpl',

    // Template file for exception page
    'exception_tmpl'         => Env::get('think_path') . 'tpl/think_exception.tpl',

    // Error display message, valid in non-debug mode
    'error_message'          => 'Page error! Please try again later~',
    // Show error message
    'show_error_msg'         => false,
    // Exception handling class, leave empty to use \think\exception\Handle
    'exception_handle'       => '',

];
