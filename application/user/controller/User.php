<?php
namespace app\user\controller;

use app\common\controller\ApiController;
use app\user\model\User as UserModel;
use think\Db;
use think\facade\Env;
use think\facade\Session;

class User extends ApiController
{
    /**
     * Register a new user account with bcrypt password hashing and immediate session login.
     */
    public function reg()
    {
        try {
            $data     = $this->payload();
            $name     = isset($data['name']) ? trim((string) $data['name']) : '';
            $email    = isset($data['email']) ? strtolower(trim((string) $data['email'])) : '';
            $password = isset($data['password']) ? (string) $data['password'] : '';

            if ($name === '' || mb_strlen($name) > 50) {
                return $this->fail('Please enter a valid name (1-50 characters)');
            }
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
                return $this->fail('Please enter a valid email address');
            }
            if (strlen($password) < 6) {
                return $this->fail('Password must be at least 6 characters');
            }

            if (Db::name('user')->where('email', $email)->find()) {
                return $this->fail('This email has already been registered');
            }

            $userModel              = new UserModel();
            $userModel->user_name   = $name;
            $userModel->email       = $email;
            $userModel->login_pwd   = password_hash($password, PASSWORD_BCRYPT);
            $userModel->create_time = date('Y-m-d H:i:s');

            if (!$userModel->save()) {
                return $this->fail('Registration failed');
            }

            $userId = (int) $userModel->user_code;
            Session::set('user_id', $userId);
            Session::set('user_email', $email);

            return $this->ok([
                'user_id'   => $userId,
                'user_name' => $name,
                'email'     => $email,
            ], 'Registration successful');
        } catch (\Throwable $e) {
            return $this->serverError('Registration failed', $e);
        }
    }

    /**
     * Authenticate user credentials using bcrypt verification (with transparent upgrade for legacy rows).
     */
    public function login()
    {
        try {
            $data     = $this->payload();
            $email    = isset($data['email']) ? strtolower(trim((string) $data['email'])) : '';
            $password = isset($data['password']) ? (string) $data['password'] : '';

            if ($email === '' || $password === '') {
                return $this->fail('Email and password are required');
            }

            $user = Db::name('user')->where('email', $email)->find();
            if (!$user) {
                return $this->fail('Invalid email or password');
            }

            $storedHash = (string) ($user['login_pwd'] ?? '');
            $isBcrypt   = strpos($storedHash, '$2y$') === 0 || strpos($storedHash, '$2b$') === 0 || strpos($storedHash, '$2a$') === 0;

            if ($isBcrypt) {
                $authenticated = password_verify($password, $storedHash);
            } else {
                $authenticated = $storedHash !== '' && hash_equals($storedHash, $password);
                if ($authenticated) {
                    Db::name('user')
                        ->where('user_code', $user['user_code'])
                        ->update([
                            'login_pwd'   => password_hash($password, PASSWORD_BCRYPT),
                            'update_time' => date('Y-m-d H:i:s'),
                        ]);
                }
            }

            if (!$authenticated) {
                return $this->fail('Invalid email or password');
            }

            $userId = (int) $user['user_code'];
            Session::set('user_id', $userId);
            Session::set('user_email', $user['email']);

            return $this->ok([
                'user_id'   => $userId,
                'user_name' => $user['user_name'],
                'email'     => $user['email'],
            ], 'Login successful');
        } catch (\Throwable $e) {
            return $this->serverError('Login failed', $e);
        }
    }

    /**
     * Clear current user session.
     */
    public function logout()
    {
        Session::delete('user_id');
        Session::delete('user_email');
        return $this->ok(null, 'Logout successful');
    }

    /**
     * Reset user password after verifying email and reset verification code.
     */
    public function changePassword()
    {
        try {
            $data             = $this->payload();
            $email            = isset($data['email']) ? strtolower(trim((string) $data['email'])) : '';
            $newPassword      = isset($data['pwd']) ? (string) $data['pwd'] : '';
            $verificationCode = isset($data['verification_code']) ? trim((string) $data['verification_code']) : '';

            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $this->fail('Please enter a valid email address');
            }
            if (strlen($newPassword) < 6) {
                return $this->fail('New password must be at least 6 characters');
            }

            $expectedCode = (string) Env::get('auth.reset_code', '888888');
            if ($verificationCode === '' || !hash_equals($expectedCode, $verificationCode)) {
                return $this->fail('Verification code is incorrect');
            }

            $user = Db::name('user')->where('email', $email)->find();
            if (!$user) {
                return $this->fail('Account not found for this email');
            }

            $updated = Db::name('user')
                ->where('user_code', $user['user_code'])
                ->update([
                    'login_pwd'   => password_hash($newPassword, PASSWORD_BCRYPT),
                    'update_time' => date('Y-m-d H:i:s'),
                ]);

            if ($updated === false) {
                return $this->fail('Password update failed');
            }

            return $this->ok(null, 'Password changed successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Password change failed', $e);
        }
    }
}
