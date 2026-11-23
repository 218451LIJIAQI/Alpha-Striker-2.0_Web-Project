<?php
namespace app\user\controller;

use app\common\controller\ApiController;
use think\Db;
use think\facade\Env;
use think\facade\Session;

class User extends ApiController
{
    public function reg()
    {
        try {
            $data     = $this->payload();
            $name     = $this->strParam('name');
            $email    = strtolower($this->strParam('email'));
            $password = isset($data['password']) ? (string) $data['password'] : '';

            if ($name === '' || $this->textLen($name) > 50) {
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

            $userId = (int) Db::name('user')->insertGetId([
                'user_name'   => $name,
                'email'       => $email,
                'login_pwd'   => password_hash($password, PASSWORD_BCRYPT),
                'create_time' => date('Y-m-d H:i:s'),
            ]);
            if ($userId <= 0) {
                return $this->fail('Registration failed');
            }

            return $this->issueUserSession($userId, $name, $email, 'Registration successful');
        } catch (\Throwable $e) {
            return $this->serverError('Registration failed', $e);
        }
    }

    public function login()
    {
        try {
            $data     = $this->payload();
            $email    = strtolower($this->strParam('email'));
            $password = isset($data['password']) ? (string) $data['password'] : '';

            if ($email === '' || $password === '') {
                return $this->fail('Email and password are required');
            }

            $user = Db::name('user')->where('email', $email)->find();
            if (!$user) {
                return $this->fail('Invalid email or password');
            }

            $storedHash = (string) ($user['login_pwd'] ?? '');
            if (preg_match('/^\$2[ayb]\$/', $storedHash)) {
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

            return $this->issueUserSession(
                (int) $user['user_code'],
                $user['user_name'],
                $user['email'],
                'Login successful'
            );
        } catch (\Throwable $e) {
            return $this->serverError('Login failed', $e);
        }
    }

    public function logout()
    {
        Session::delete('user_id');
        Session::delete('user_email');
        return $this->ok(null, 'Logout successful');
    }

    public function changePassword()
    {
        try {
            $data             = $this->payload();
            $email            = strtolower($this->strParam('email'));
            $newPassword      = isset($data['pwd']) ? (string) $data['pwd'] : '';
            $verificationCode = $this->strParam('verification_code');

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

    private function issueUserSession($userId, $name, $email, $message)
    {
        Session::set('user_id', $userId);
        Session::set('user_email', $email);

        return $this->ok([
            'user_id'   => $userId,
            'user_name' => $name,
            'email'     => $email,
        ], $message);
    }
}
