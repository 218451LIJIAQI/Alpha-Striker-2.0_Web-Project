<?php
namespace app\admin\controller;

use think\Db;

class User extends BaseAdmin
{
    private const SAFE_FIELDS = 'user_code, user_name, email, create_time, update_time';

    public function index()
    {
        try {
            $users = Db::name('user')
                ->field(self::SAFE_FIELDS)
                ->order('user_code', 'asc')
                ->select();

            return $this->ok($users);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query users', $e);
        }
    }

    public function getUserByCode($user_code = '')
    {
        try {
            $userId = $this->idParam('user_code', $user_code);
            if ($userId <= 0) {
                return $this->fail('Valid user_code is required');
            }

            $user = Db::name('user')
                ->field(self::SAFE_FIELDS)
                ->where('user_code', $userId)
                ->find();

            return $user ? $this->ok($user) : $this->fail('User not found', 404);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query user details', $e);
        }
    }

    public function create()
    {
        try {
            $payload  = $this->payload();
            $name     = $this->strParam('user_name');
            $email    = strtolower($this->strParam('email'));
            $password = isset($payload['login_pwd']) ? (string) $payload['login_pwd'] : '';

            $error = $this->validateUserInput($name, $email, $password, true, 0);
            if ($error !== null) {
                return $this->fail($error);
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
                    return $this->fail('Email is already registered', 409);
                }
                throw $insertErr;
            }

            if ($userId <= 0) {
                return $this->fail('Failed to create user');
            }

            return $this->ok(['user_code' => $userId], 'User created successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to create user', $e);
        }
    }

    public function update($user_code = '')
    {
        try {
            $userId = $this->idParam('user_code', $user_code);
            if ($userId <= 0) {
                return $this->fail('Valid user_code is required');
            }

            if (!Db::name('user')->where('user_code', $userId)->find()) {
                return $this->fail('User not found', 404);
            }

            $payload  = $this->payload();
            $name     = $this->strParam('user_name');
            $email    = strtolower($this->strParam('email'));
            $password = isset($payload['login_pwd']) ? (string) $payload['login_pwd'] : '';

            $error = $this->validateUserInput($name, $email, $password, false, $userId);
            if ($error !== null) {
                return $this->fail($error);
            }

            $updateData = [
                'user_name'   => $name,
                'email'       => $email,
                'update_time' => date('Y-m-d H:i:s'),
            ];
            if ($password !== '') {
                $updateData['login_pwd'] = password_hash($password, PASSWORD_BCRYPT);
            }

            try {
                if (Db::name('user')->where('user_code', $userId)->update($updateData) === false) {
                    return $this->fail('Failed to update user');
                }
            } catch (\Throwable $updErr) {
                if ($this->isUniqueConflict($updErr)) {
                    return $this->fail('Email is already registered to another user', 409);
                }
                throw $updErr;
            }

            return $this->ok(['user_code' => $userId], 'User updated successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to update user', $e);
        }
    }

    public function delete($user_code = '')
    {
        try {
            $userId = $this->idParam('user_code', $user_code);
            if ($userId <= 0) {
                return $this->fail('Valid user_code is required');
            }

            Db::startTrans();
            try {
                if (!Db::name('user')->where('user_code', $userId)->find()) {
                    Db::rollback();
                    return $this->fail('User not found', 404);
                }

                Db::name('seat')->where('user_code', $userId)->update(['user_code' => null]);
                Db::name('offer')->where('user_code', $userId)->update(['user_code' => null]);
                Db::name('user')->where('user_code', $userId)->delete();

                Db::commit();
                return $this->ok(['user_code' => $userId], 'User deleted successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete user', $e);
        }
    }

    private function validateUserInput($name, $email, $password, $requirePassword, $excludeUserId)
    {
        if ($name === '' || $this->textLen($name) > 50) {
            return 'Valid username (1-50 characters) is required';
        }
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
            return 'Valid email address is required';
        }
        if ($requirePassword && strlen($password) < 6) {
            return 'Password must be at least 6 characters';
        }
        if (!$requirePassword && $password !== '' && strlen($password) < 6) {
            return 'New password must be at least 6 characters';
        }

        $dupQuery = Db::name('user')->where('email', $email);
        if ($excludeUserId > 0) {
            $dupQuery->where('user_code', '<>', $excludeUserId);
        }
        if ($dupQuery->find()) {
            return $excludeUserId > 0
                ? 'Email is already registered to another user'
                : 'Email is already registered';
        }

        return null;
    }
}