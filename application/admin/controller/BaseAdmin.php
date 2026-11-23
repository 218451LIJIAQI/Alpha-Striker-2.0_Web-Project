<?php
namespace app\admin\controller;

use app\common\controller\ApiController;
use think\exception\HttpResponseException;
use think\facade\Request;
use think\facade\Session;

/**
 * Base controller for authenticated admin endpoints.
 * Enforces both active admin session AND non-empty constant-time X-Admin-Token / Bearer verification.
 */
abstract class BaseAdmin extends ApiController
{
    public function __construct()
    {
        if (!self::hasAdminSession()) {
            throw new HttpResponseException(
                $this->fail('Unauthorized: admin login required', 401)
            );
        }

        if (!self::checkSession()) {
            throw new HttpResponseException(
                $this->fail('Forbidden: valid X-Admin-Token header is required', 403)
            );
        }
    }

    public static function hasAdminSession()
    {
        $sessionToken = (string) Session::get('admin_token', '');
        return Session::get('admin_auth') === true && $sessionToken !== '';
    }

    public static function checkSession()
    {
        $sessionToken = (string) Session::get('admin_token', '');
        if (Session::get('admin_auth') !== true || $sessionToken === '') {
            return false;
        }

        $clientToken = self::extractToken();
        if ($clientToken === '') {
            return false;
        }

        return hash_equals($sessionToken, $clientToken);
    }

    private static function extractToken()
    {
        $headerToken = Request::header('x-admin-token');
        if (is_string($headerToken) && trim($headerToken) !== '') {
            return trim($headerToken);
        }

        $authHeader = Request::header('authorization');
        if (is_string($authHeader) && stripos($authHeader, 'Bearer ') === 0) {
            return trim(substr($authHeader, 7));
        }

        return '';
    }
}
