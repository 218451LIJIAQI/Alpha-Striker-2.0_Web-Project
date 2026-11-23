<?php
namespace app\admin\controller;

use app\common\controller\ApiController;
use think\facade\Env;
use think\facade\Session;

class Auth extends ApiController
{
    public function login()
    {
        try {
            $data     = $this->payload();
            $username = $this->strParam('username');
            $password = isset($data['password']) ? (string) $data['password'] : '';

            if ($username === '' || $password === '') {
                return $this->fail('Username and password are required');
            }

            $expectedUser = (string) Env::get('admin.username', 'admin');
            $passwordHash = (string) Env::get('admin.password_hash', '');
            $expectedPass = (string) Env::get('admin.password', 'admin');

            $userMatches = hash_equals($expectedUser, $username);
            $passMatches = $passwordHash !== ''
                ? password_verify($password, $passwordHash)
                : hash_equals($expectedPass, $password);

            if (!$userMatches || !$passMatches) {
                return $this->fail('Invalid username or password', 401);
            }

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
            if (BaseAdmin::hasAdminSession() && !BaseAdmin::checkSession()) {
                return $this->fail('Forbidden: valid X-Admin-Token header is required', 403);
            }
            $this->destroySession();
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