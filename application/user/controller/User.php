<?php
namespace app\user\controller;

use app\admin\controller\BaseAdmin;
use app\common\controller\ApiController;
use think\Db;
use think\facade\Env;
use think\facade\Session;

class User extends ApiController
{
    private const MAX_RESET_ATTEMPTS = 5;

    public function reg()
    {
        try {
            if (!$this->verifySameOrigin()) {
                return $this->fail('Forbidden: cross-origin request rejected', 403);
            }

            $name     = $this->strParam('name');
            $email    = strtolower($this->strParam('email'));
            $password = $this->rawStrParam('password');

            if ($name === '' || $this->textLen($name) > 50) {
                return $this->fail('Please enter a valid name (1-50 characters)');
            }
            if (!$this->isValidEmail($email)) {
                return $this->fail('Please enter a valid email address');
            }
            if (!$this->isValidPasswordLength($password)) {
                return $this->fail('Password must be 6-72 characters');
            }
            if (Db::name('user')->where('email', $email)->find()) {
                return $this->fail('This email has already been registered');
            }

            try {
                $userId = (int) Db::name('user')->insertGetId([
                    'user_name'   => $name,
                    'email'       => $email,
                    'login_pwd'   => password_hash($password, PASSWORD_BCRYPT),
                    'create_time' => date('Y-m-d H:i:s'),
                ]);
            } catch (\Throwable $insertErr) {
                if ($this->isUniqueConflict($insertErr)) {
                    return $this->fail('This email has already been registered', 409);
                }
                throw $insertErr;
            }

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
            if (!$this->verifySameOrigin()) {
                return $this->fail('Forbidden: cross-origin request rejected', 403);
            }

            $email    = strtolower($this->strParam('email'));
            $password = $this->rawStrParam('password');

            if ($email === '' || $password === '') {
                return $this->fail('Email and password are required');
            }

            $user = Db::name('user')->where('email', $email)->find();
            if (!$user || !$this->verifyAndUpgradePassword($user, $password)) {
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
        try {
            if (!$this->verifySameOrigin()) {
                return $this->fail('Forbidden: cross-origin request rejected', 403);
            }

            Session::delete('user_id');
            Session::delete('user_email');
            $this->clearResetChallenge();

            if (BaseAdmin::hasAdminSession()) {
                $this->rotateSession();
            } else {
                $this->destroySession();
            }

            return $this->ok(null, 'Logout successful');
        } catch (\Throwable $e) {
            return $this->serverError('Logout failed', $e);
        }
    }

    public function session()
    {
        try {
            $userId = (int) Session::get('user_id', 0);
            if ($userId <= 0) {
                return $this->ok([
                    'authenticated' => false,
                    'user_id'       => 0,
                    'user_name'     => 'Guest',
                    'email'         => '',
                ]);
            }

            $user = Db::name('user')
                ->field('user_code, user_name, email')
                ->where('user_code', $userId)
                ->find();

            if (!$user) {
                Session::delete('user_id');
                Session::delete('user_email');
                return $this->ok([
                    'authenticated' => false,
                    'user_id'       => 0,
                    'user_name'     => 'Guest',
                    'email'         => '',
                ]);
            }

            return $this->ok([
                'authenticated' => true,
                'user_id'       => (int) $user['user_code'],
                'user_name'     => $user['user_name'],
                'email'         => $user['email'],
            ]);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to check session status', $e);
        }
    }

    public function sendResetCode()
    {
        try {
            if (!$this->verifySameOrigin()) {
                return $this->fail('Forbidden: cross-origin request rejected', 403);
            }

            $email = strtolower($this->strParam('email'));
            if (!$this->isValidEmail($email)) {
                return $this->fail('Please enter a valid email address');
            }

            $cooldown = (int) Env::get('auth.reset_cooldown', 2);
            $lastSent = (int) Session::get('reset_sent_at', 0);
            $now      = time();
            if ($cooldown > 0 && $lastSent > 0 && ($now - $lastSent) < $cooldown) {
                return $this->fail('Please wait before requesting another verification code', 429);
            }

            $user = Db::name('user')->field('user_code, email')->where('email', $email)->find();
            if (!$user) {
                return $this->fail('Account not found for this email');
            }

            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $ttl  = max(60, (int) Env::get('auth.reset_ttl', 600));

            Session::set('reset_email', $email);
            Session::set('reset_code_hash', password_hash($code, PASSWORD_BCRYPT));
            Session::set('reset_expires_at', $now + $ttl);
            Session::set('reset_attempts', 0);
            Session::set('reset_sent_at', $now);

            $rawExpose = Env::get('auth.expose_reset_code', getenv('CINETIX_EXPOSE_RESET_CODE') ?: false);
            $expose    = filter_var($rawExpose, FILTER_VALIDATE_BOOLEAN);

            $respData = [
                'email'      => $email,
                'expires_in' => $ttl,
            ];
            if ($expose) {
                $respData['debug_code'] = $code;
            }

            return $this->ok($respData, 'Verification code generated and sent');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to send verification code', $e);
        }
    }

    public function changePassword()
    {
        try {
            if (!$this->verifySameOrigin()) {
                return $this->fail('Forbidden: cross-origin request rejected', 403);
            }

            $sessionUserId    = (int) Session::get('user_id', 0);
            $oldPassword      = $this->rawStrParam('old_password');
            $newPassword      = $this->rawStrParam('pwd');
            $verificationCode = $this->strParam('verification_code');

            if (!$this->isValidPasswordLength($newPassword)) {
                return $this->fail('New password must be 6-72 characters');
            }

            // Path A: Signed-in user changing password by verifying current password
            if ($oldPassword !== '' && $verificationCode === '') {
                if ($sessionUserId <= 0) {
                    return $this->fail('Please sign in to change your password using current password', 401);
                }

                $user = Db::name('user')->where('user_code', $sessionUserId)->find();
                if (!$user) {
                    Session::delete('user_id');
                    Session::delete('user_email');
                    return $this->fail('Account session is no longer valid', 401);
                }

                if (!$this->verifyAndUpgradePassword($user, $oldPassword)) {
                    return $this->fail('Current password is incorrect', 401);
                }

                if (hash_equals($oldPassword, $newPassword)) {
                    return $this->fail('New password must be different from your current password');
                }

                $updated = Db::name('user')
                    ->where('user_code', $sessionUserId)
                    ->update([
                        'login_pwd'   => password_hash($newPassword, PASSWORD_BCRYPT),
                        'update_time' => date('Y-m-d H:i:s'),
                    ]);

                if ($updated === false) {
                    return $this->fail('Password update failed');
                }

                $this->clearResetChallenge();
                $this->rotateSession();
                Session::set('user_id', $sessionUserId);
                Session::set('user_email', $user['email']);

                return $this->ok(null, 'Password changed successfully');
            }

            // Path B: Dynamic 6-digit verification code reset bound to session & email
            $email = strtolower($this->strParam('email'));
            if (!$this->isValidEmail($email)) {
                return $this->fail('Please enter a valid email address');
            }
            if (!preg_match('/^\d{6}$/', $verificationCode)) {
                return $this->fail('Please enter the 6-digit verification code');
            }

            $resetEmail = (string) Session::get('reset_email', '');
            $resetHash  = (string) Session::get('reset_code_hash', '');
            $expiresAt  = (int) Session::get('reset_expires_at', 0);
            $attempts   = (int) Session::get('reset_attempts', 0);

            if ($resetEmail === '' || $resetHash === '' || $expiresAt <= 0) {
                return $this->fail('Please request a verification code first');
            }

            if (time() > $expiresAt) {
                $this->clearResetChallenge();
                return $this->fail('Verification code has expired. Please request a new code.');
            }

            if ($attempts >= self::MAX_RESET_ATTEMPTS) {
                $this->clearResetChallenge();
                return $this->fail('Too many failed verification attempts. Please request a new code.', 429);
            }

            $emailMatch = hash_equals($resetEmail, $email);
            $codeMatch  = password_verify($verificationCode, $resetHash);
            if (!$emailMatch || !$codeMatch) {
                $attempts++;
                if ($attempts >= self::MAX_RESET_ATTEMPTS) {
                    $this->clearResetChallenge();
                    return $this->fail('Too many failed verification attempts. Please request a new code.', 429);
                }
                Session::set('reset_attempts', $attempts);
                return $this->fail('Verification code is incorrect');
            }

            $user = Db::name('user')->where('email', $email)->find();
            if (!$user) {
                $this->clearResetChallenge();
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

            $this->clearResetChallenge();
            $this->rotateSession();
            if ($sessionUserId > 0 && $sessionUserId === (int) $user['user_code']) {
                Session::set('user_id', $sessionUserId);
                Session::set('user_email', $user['email']);
            }

            return $this->ok(null, 'Password changed successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Password change failed', $e);
        }
    }

    private function verifyAndUpgradePassword(array $user, $password)
    {
        $rawPassword = (string) $password;
        if ($rawPassword === '' || strlen($rawPassword) > self::MAX_PASSWORD_BYTES) {
            return false;
        }

        $storedHash = (string) ($user['login_pwd'] ?? '');
        if (preg_match('/^\$2[ayb]\$/', $storedHash)) {
            return password_verify($rawPassword, $storedHash);
        }

        $authenticated = $storedHash !== '' && hash_equals($storedHash, $rawPassword);
        if ($authenticated) {
            Db::name('user')
                ->where('user_code', $user['user_code'])
                ->update([
                    'login_pwd'   => password_hash($rawPassword, PASSWORD_BCRYPT),
                    'update_time' => date('Y-m-d H:i:s'),
                ]);
        }
        return $authenticated;
    }

    private function clearResetChallenge()
    {
        Session::delete('reset_email');
        Session::delete('reset_code_hash');
        Session::delete('reset_expires_at');
        Session::delete('reset_attempts');
        Session::delete('reset_sent_at');
    }

    private function issueUserSession($userId, $name, $email, $message)
    {
        $this->clearResetChallenge();
        $this->rotateSession();
        Session::set('user_id', (int) $userId);
        Session::set('user_email', (string) $email);

        return $this->ok([
            'user_id'   => (int) $userId,
            'user_name' => $name,
            'email'     => $email,
        ], $message);
    }
}
