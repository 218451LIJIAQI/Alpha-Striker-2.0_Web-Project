<?php
namespace app\admin\controller;

use app\common\controller\ApiController;
use think\exception\HttpResponseException;
use think\facade\Request;
use think\facade\Session;

/**
 * Base controller for authenticated admin endpoints.
 * Centralizes session + X-Admin-Token / Bearer verification across Auth and CRUD controllers.
 */
abstract class BaseAdmin extends ApiController
{
    public function __construct()
    {
        if (!self::checkSession($this->payload())) {
            throw new HttpResponseException(
                $this->fail('Unauthorized: admin login required', 401)
            );
        }
    }

    public static function checkSession(array $payload = [])
    {
        $sessionToken = (string) Session::get('admin_token', '');
        if (Session::get('admin_auth') !== true || $sessionToken === '') {
            return false;
        }

        $clientToken = self::extractToken($payload);
        return $clientToken === '' || hash_equals($sessionToken, $clientToken);
    }

    private static function extractToken(array $payload)
    {
        $headerToken = Request::header('x-admin-token');
        if (is_string($headerToken) && trim($headerToken) !== '') {
            return trim($headerToken);
        }

        $authHeader = Request::header('authorization');
        if (is_string($authHeader) && stripos($authHeader, 'Bearer ') === 0) {
            return trim(substr($authHeader, 7));
        }

        if (!empty($payload['token']) && is_string($payload['token'])) {
            return trim($payload['token']);
        }

        return '';
    }
}
