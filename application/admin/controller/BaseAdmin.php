<?php
namespace app\admin\controller;

use app\common\controller\ApiController;
use think\exception\HttpResponseException;
use think\facade\Request;
use think\facade\Session;

/**
 * Base controller for authenticated admin endpoints.
 * Validates session state and optional X-Admin-Token / Bearer token header before executing actions.
 */
abstract class BaseAdmin extends ApiController
{
    public function __construct()
    {
        if (!$this->isAdminAuthenticated()) {
            throw new HttpResponseException(
                $this->fail('Unauthorized: admin login required', 401)
            );
        }
    }

    /**
     * Extract client admin token from X-Admin-Token header, Authorization Bearer header, or request params.
     *
     * @param array $payload
     * @return string
     */
    protected function extractAdminToken(array $payload = [])
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

    /**
     * Verify active admin session and constant-time token match.
     *
     * @return bool
     */
    protected function isAdminAuthenticated()
    {
        $sessionAuth  = Session::get('admin_auth') === true;
        $sessionToken = (string) Session::get('admin_token', '');

        if (!$sessionAuth || $sessionToken === '') {
            return false;
        }

        $clientToken = $this->extractAdminToken($this->payload());
        if ($clientToken !== '') {
            return hash_equals($sessionToken, $clientToken);
        }

        return true;
    }
}
