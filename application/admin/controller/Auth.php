<?php
namespace app\admin\controller;

use app\common\controller\ApiController;
use think\facade\Env;
use think\facade\Session;

class Auth extends ApiController
{
    private const THROTTLE_SCOPE = 'admin_login';

    public function login()
    {
        try {
            if (!$this->verifySameOrigin()) {
                return $this->fail('Forbidden: cross-origin request rejected', 403);
            }

            if (!$this->checkLoginThrottle(self::THROTTLE_SCOPE)) {
                return $this->fail('Too many failed sign-in attempts. Please wait before trying again.', 429);
            }

            $username = $this->strParam('username');
            $password = $this->rawStrParam('password');

            if ($username === '' || $password === '') {
                return $this->fail('Username and password are required');
            }

            $expectedUser = (string) Env::get('admin.username', 'admin');
            $passwordHash = (string) Env::get('admin.password_hash', '');
            $expectedPass = (string) Env::get('admin.password', 'admin');

            $userMatches = hash_equals($expectedUser, $username);
            $withinBytes = strlen($password) <= self::MAX_PASSWORD_BYTES;
            $passMatches = $withinBytes && ($passwordHash !== ''
                ? password_verify($password, $passwordHash)
                : hash_equals($expectedPass, $password));

            if (!$userMatches || !$passMatches) {
                if ($this->recordLoginFailure(self::THROTTLE_SCOPE)) {
                    return $this->fail('Too many failed sign-in attempts. Please wait before trying again.', 429);
                }
                return $this->fail('Invalid username or password', 401);
            }

            $this->clearLoginThrottle(self::THROTTLE_SCOPE);
            $this->rotateSession();
            $token = bin2hex(random_bytes(32));
            Session::set('admin_auth', true);
            Session::set('admin_token', $token);
            Session::set('admin_user', $username);

            return $this->ok([
                'admin_id' => 1,
                'username' => $username,
                'role'     => 'admin',
            ], 'Login successful', [
                'token' => $token,
            ]);
        } catch (\Throwable $e) {
            return $this->serverError('Admin login failed', $e);
        }
    }

    public function logout()
    {
        try {
            if (!$this->verifySameOrigin()) {
                return $this->fail('Forbidden: cross-origin request rejected', 403);
            }
            if (BaseAdmin::hasAdminSession() && !BaseAdmin::checkSession()) {
                return $this->fail('Forbidden: valid X-Admin-Token header is required', 403);
            }

            Session::delete('admin_auth');
            Session::delete('admin_token');
            Session::delete('admin_user');

            if ((int) Session::get('user_id', 0) > 0) {
                $this->rotateSession();
            } else {
                $this->destroySession();
            }

            return $this->ok(null, 'Logout successful');
        } catch (\Throwable $e) {
            return $this->serverError('Admin logout failed', $e);
        }
    }

    public function checkAuth()
    {
        try {
            if (!BaseAdmin::hasAdminSession()) {
                return $this->fail('Authentication required', 401);
            }
            if (!BaseAdmin::checkSession()) {
                return $this->fail('Forbidden: valid X-Admin-Token header is required', 403);
            }

            return $this->ok([
                'admin_id' => 1,
                'username' => (string) Session::get('admin_user', 'admin'),
                'role'     => 'admin',
            ], 'Authentication valid');
        } catch (\Throwable $e) {
            return $this->serverError('Authentication check failed', $e);
        }
    }
}