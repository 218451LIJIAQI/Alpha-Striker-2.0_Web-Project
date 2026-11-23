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
            $username = $this->strParam('username');
            $password = $this->rawPasswordParam('password');

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

            Session::regenerate(true);
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
        Session::delete('admin_auth');
        Session::delete('admin_token');
        Session::delete('admin_user');
        return $this->ok(null, 'Logout successful');
    }

    public function checkAuth()
    {
        try {
            if (!BaseAdmin::checkSession($this->payload())) {
                return $this->fail('Authentication required', 401);
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