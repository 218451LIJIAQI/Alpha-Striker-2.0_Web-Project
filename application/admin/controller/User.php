<?php
namespace app\admin\controller;

use app\user\model\User as UserModel;
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
            $payload = $this->payload();
            $userId  = (int) ($user_code !== '' ? $user_code : ($payload['user_code'] ?? 0));

            if ($userId <= 0) {
                return $this->fail('Valid user_code is required');
            }

            $user = Db::name('user')
                ->field(self::SAFE_FIELDS)
                ->where('user_code', $userId)
                ->find();

            if (!$user) {
                return $this->fail('User not found', 404);
            }

            return $this->ok($user);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query user details', $e);
        }
    }

    public function create()
    {
        try {
            $payload  = $this->payload();
            $name     = isset($payload['user_name']) ? trim((string) $payload['user_name']) : '';
            $email    = isset($payload['email']) ? strtolower(trim((string) $payload['email'])) : '';
            $password = isset($payload['login_pwd']) ? (string) $payload['login_pwd'] : '';

            if ($name === '' || mb_strlen($name) > 50) {
                return $this->fail('Valid username (1-50 characters) is required');
            }
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
                return $this->fail('Valid email address is required');
            }
            if (strlen($password) < 6) {
                return $this->fail('Password must be at least 6 characters');
            }
            if (Db::name('user')->where('email', $email)->find()) {
                return $this->fail('Email is already registered');
            }

            $model              = new UserModel();
            $model->user_name   = $name;
            $model->email       = $email;
            $model->login_pwd   = password_hash($password, PASSWORD_BCRYPT);
            $model->create_time = date('Y-m-d H:i:s');

            if (!$model->save()) {
                return $this->fail('Failed to create user');
            }

            return $this->ok(['user_code' => (int) $model->user_code], 'User created successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to create user', $e);
        }
    }

    public function update($user_code = '')
    {
        try {
            $payload = $this->payload();
            $userId  = (int) ($user_code !== '' ? $user_code : ($payload['user_code'] ?? 0));

            if ($userId <= 0) {
                return $this->fail('Valid user_code is required');
            }

            $existing = Db::name('user')->where('user_code', $userId)->find();
            if (!$existing) {
                return $this->fail('User not found', 404);
            }

            $name     = isset($payload['user_name']) ? trim((string) $payload['user_name']) : '';
            $email    = isset($payload['email']) ? strtolower(trim((string) $payload['email'])) : '';
            $password = isset($payload['login_pwd']) ? (string) $payload['login_pwd'] : '';

            if ($name === '' || mb_strlen($name) > 50) {
                return $this->fail('Valid username (1-50 characters) is required');
            }
            if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
                return $this->fail('Valid email address is required');
            }

            $duplicate = Db::name('user')
                ->where('email', $email)
                ->where('user_code', '<>', $userId)
                ->find();
            if ($duplicate) {
                return $this->fail('Email is already registered to another user');
            }

            $updateData = [
                'user_name'   => $name,
                'email'       => $email,
                'update_time' => date('Y-m-d H:i:s'),
            ];

            if ($password !== '') {
                if (strlen($password) < 6) {
                    return $this->fail('New password must be at least 6 characters');
                }
                $updateData['login_pwd'] = password_hash($password, PASSWORD_BCRYPT);
            }

            $updated = Db::name('user')->where('user_code', $userId)->update($updateData);
            if ($updated === false) {
                return $this->fail('Failed to update user');
            }

            return $this->ok(['user_code' => $userId], 'User updated successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to update user', $e);
        }
    }

    public function delete($user_code = '')
    {
        try {
            $payload = $this->payload();
            $userId  = (int) ($user_code !== '' ? $user_code : ($payload['user_code'] ?? 0));

            if ($userId <= 0) {
                return $this->fail('Valid user_code is required');
            }

            $deleted = Db::name('user')->where('user_code', $userId)->delete();
            if (!$deleted) {
                return $this->fail('User not found', 404);
            }

            return $this->ok(['user_code' => $userId], 'User deleted successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete user', $e);
        }
    }
}