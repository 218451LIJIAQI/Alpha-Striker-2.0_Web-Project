<?php
namespace app\user\controller;

use app\common\controller\ApiController;
use think\Db;
use think\facade\Env;
use think\facade\Session;

class User extends ApiController
{
    private const RESET_TTL_SECONDS = 300;
    private const MAX_RESET_ATTEMPTS = 5;

    public function reg()
    {
        try {
            $name     = $this->strParam('name');
            $email    = strtolower($this->strParam('email'));
            $password = $this->rawPasswordParam('password');

            if ($name === '' || $this->textLen($name) > 50) {
                return $this->fail('Please enter a valid name (1-50 characters)');
            }
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
                return $this->fail('Please enter a valid email address');
            }
            if (strlen($password) < 6 || strlen($password) > 128) {
                return $this->fail('Password must be between 6 and 128 characters');
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
            $email    = strtolower($this->strParam('email'));
            $password = $this->rawPasswordParam('password');

            if ($email === '' || $password === '') {
                return $this->fail('Email and password are required');
            }

            $user = Db::name('user')->where('email', $email)->find();
            if (!$user) {
                return $this->fail('Invalid email or password');
            }

            $storedHash    = (string) ($user['login_pwd'] ?? '');
            $authenticated = $this->verifyStoredPassword($password, $storedHash);
            if ($authenticated && !preg_match('/^\$2[ayb]\$/', $storedHash)) {
                Db::name('user')
                    ->where('user_code', $user['user_code'])
                    ->update([
                        'login_pwd'   => password_hash($password, PASSWORD_BCRYPT),
                        'update_time' => date('Y-m-d H:i:s'),
                    ]);
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

    public function session()
    {
        try {
            $userId = (int) Session::get('user_id', 0);
            if ($userId <= 0) {
                return $this->ok(['authenticated' => false]);
            }

            $user = Db::name('user')
                ->field('user_code, user_name, email')
                ->where('user_code', $userId)
                ->find();

            if (!$user) {
                Session::delete('user_id');
                Session::delete('user_email');
                return $this->ok(['authenticated' => false]);
            }

            return $this->ok([
                'authenticated' => true,
                'user_id'       => (int) $user['user_code'],
                'user_name'     => $user['user_name'],
                'email'         => $user['email'],
            ]);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to check session', $e);
        }
    }

    public function logout()
    {
        Session::delete('user_id');
        Session::delete('user_email');
        Session::delete('pwd_reset');
        return $this->ok(null, 'Logout successful');
    }

    public function sendResetCode()
    {
        try {
            $email = strtolower($this->strParam('email'));
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $this->fail('Please enter a valid email address');
            }

            $user = Db::name('user')->where('email', $email)->find();
            if (!$user) {
                return $this->fail('Account not found for this email', 404);
            }

            $configuredCode = trim((string) Env::get('auth.reset_code', ''));
            $otp = $configuredCode !== ''
                ? $configuredCode
                : str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            Session::set('pwd_reset', [
                'email'      => $email,
                'code_hash'  => password_hash($otp, PASSWORD_BCRYPT),
                'expires_at' => time() + self::RESET_TTL_SECONDS,
                'attempts'   => 0,
            ]);

            $exposeDemo = filter_var(Env::get('auth.expose_demo_code', true), FILTER_VALIDATE_BOOLEAN);
            $respData   = ['expires_in' => self::RESET_TTL_SECONDS];
            if ($exposeDemo) {
                $respData['demo_code'] = $otp;
            }

            return $this->ok($respData, 'Verification code issued');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to issue verification code', $e);
        }
    }

    public function changePassword()
    {
        try {
            $newPassword     = $this->rawPasswordParam('pwd');
            $currentPassword = $this->rawPasswordParam('current_password');

            if (strlen($newPassword) < 6 || strlen($newPassword) > 128) {
                return $this->fail('New password must be between 6 and 128 characters');
            }

            $sessionUserId = (int) Session::get('user_id', 0);
            if ($currentPassword !== '' && $sessionUserId > 0) {
                $user = Db::name('user')->where('user_code', $sessionUserId)->find();
                if (!$user) {
                    Session::delete('user_id');
                    Session::delete('user_email');
                    return $this->fail('Session expired, please sign in again', 401);
                }

                $email = strtolower($this->strParam('email'));
                if ($email !== '' && $email !== strtolower((string) $user['email'])) {
                    return $this->fail('Email does not match your signed-in account', 403);
                }

                if (!$this->verifyStoredPassword($currentPassword, (string) ($user['login_pwd'] ?? ''))) {
                    return $this->fail('Current password is incorrect');
                }

                Db::name('user')->where('user_code', $user['user_code'])->update([
                    'login_pwd'   => password_hash($newPassword, PASSWORD_BCRYPT),
                    'update_time' => date('Y-m-d H:i:s'),
                ]);
                Session::regenerate(true);
                return $this->ok(null, 'Password updated successfully');
            }

            $email            = strtolower($this->strParam('email'));
            $verificationCode = $this->strParam('verification_code');

            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return $this->fail('Please enter a valid email address');
            }
            if ($verificationCode === '') {
                return $this->fail('Verification code is required');
            }

            $challenge = Session::get('pwd_reset');
            if (
                !is_array($challenge)
                || empty($challenge['email'])
                || empty($challenge['code_hash'])
                || empty($challenge['expires_at'])
            ) {
                return $this->fail('Please request a verification code first');
            }

            if (time() > (int) $challenge['expires_at']) {
                Session::delete('pwd_reset');
                return $this->fail('Verification code has expired, please request a new one');
            }

            if (strtolower((string) $challenge['email']) !== $email) {
                return $this->fail('Verification code does not match this email address');
            }

            $attempts = (int) ($challenge['attempts'] ?? 0);
            if ($attempts >= self::MAX_RESET_ATTEMPTS) {
                Session::delete('pwd_reset');
                return $this->fail('Too many invalid attempts, please request a new code');
            }

            if (!password_verify($verificationCode, (string) $challenge['code_hash'])) {
                $attempts++;
                if ($attempts >= self::MAX_RESET_ATTEMPTS) {
                    Session::delete('pwd_reset');
                    return $this->fail('Too many invalid attempts, please request a new code');
                }
                $challenge['attempts'] = $attempts;
                Session::set('pwd_reset', $challenge);
                return $this->fail('Verification code is incorrect');
            }

            $user = Db::name('user')->where('email', $email)->find();
            if (!$user) {
                Session::delete('pwd_reset');
                return $this->fail('Account not found for this email', 404);
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

            Session::delete('pwd_reset');
            Session::delete('user_id');
            Session::delete('user_email');

            return $this->ok(null, 'Password changed successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Password change failed', $e);
        }
    }

    private function verifyStoredPassword($plain, $storedHash)
    {
        if ($storedHash === '') {
            return false;
        }
        if (preg_match('/^\$2[ayb]\$/', $storedHash)) {
            return password_verify($plain, $storedHash);
        }
        return hash_equals($storedHash, $plain);
    }

    private function issueUserSession($userId, $name, $email, $message)
    {
        Session::regenerate(true);
        Session::set('user_id', $userId);
        Session::set('user_email', $email);

        return $this->ok([
            'user_id'   => $userId,
            'user_name' => $name,
            'email'     => $email,
        ], $message);
    }
}
