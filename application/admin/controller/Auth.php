<?php
namespace app\admin\controller;

use app\common\controller\ApiController;
use think\facade\Env;
use think\facade\Request;
use think\facade\Session;

class Auth extends ApiController
{
    /**
     * Authenticate administrator and issue a session-bound cryptographic token.
     */
    public function login()
    {
        try {
            $data     = $this->payload();
            $username = isset($data['username']) ? trim((string) $data['username']) : '';
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

    /**
     * Destroy administrator session state.
     */
    public function logout()
    {
        Session::delete('admin_auth');
        Session::delete('admin_token');
        Session::delete('admin_user');
        return $this->ok(null, 'Logout successful');
    }

    /**
     * Verify current admin session and token validity.
     */
    public function checkAuth()
    {
        try {
            $payload      = $this->payload();
            $sessionAuth  = Session::get('admin_auth') === true;
            $sessionToken = (string) Session::get('admin_token', '');

            if (!$sessionAuth || $sessionToken === '') {
                return $this->fail('Authentication required', 401);
            }

            $clientToken = Request::header('x-admin-token') ?: '';
            if ($clientToken === '') {
                $authHeader = Request::header('authorization') ?: '';
                if (stripos($authHeader, 'Bearer ') === 0) {
                    $clientToken = substr($authHeader, 7);
                }
            }
            if ($clientToken === '' && !empty($payload['token'])) {
                $clientToken = (string) $payload['token'];
            }
            $clientToken = trim((string) $clientToken);

            if ($clientToken !== '' && !hash_equals($sessionToken, $clientToken)) {
                return $this->fail('Invalid or expired token', 401);
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