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

            $keyword = strtolower($this->strParam('keyword'));
            [$paged, $meta] = $this->paginateAndSort(
                $users,
                [
                    'id_asc'   => function ($a, $b) { return ((int) $a['user_code']) <=> ((int) $b['user_code']); },
                    'id_desc'  => function ($a, $b) { return ((int) $b['user_code']) <=> ((int) $a['user_code']); },
                    'name_asc' => function ($a, $b) { return strcasecmp((string) $a['user_name'], (string) $b['user_name']); },
                ],
                'id_asc',
                function ($u) use ($keyword) {
                    if ($keyword === '') {
                        return true;
                    }
                    $hay = strtolower('#' . $u['user_code'] . ' ' . ($u['user_name'] ?? '') . ' ' . ($u['email'] ?? ''));
                    return strpos($hay, $keyword) !== false;
                }
            );

            return $this->ok($paged, 'OK', ['meta' => $meta]);
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
            $name     = $this->strParam('user_name');
            $email    = strtolower($this->strParam('email'));
            $password = $this->rawStrParam('login_pwd');

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
            $payload = $this->payload();
            $userId  = $this->idParam('user_code', $user_code);
            if ($userId <= 0) {
                return $this->fail('Valid user_code is required');
            }

            $existing = Db::name('user')->where('user_code', $userId)->find();
            if (!$existing) {
                return $this->fail('User not found', 404);
            }

            $name     = array_key_exists('user_name', $payload) ? $this->strParam('user_name') : (string) $existing['user_name'];
            $email    = array_key_exists('email', $payload) ? strtolower($this->strParam('email')) : strtolower((string) $existing['email']);
            $password = $this->rawStrParam('login_pwd');

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
            $targetIds = $this->resolveTargetIds('user_code', 'user_codes', $user_code);
            if (empty($targetIds)) {
                return $this->fail('Valid user_code is required');
            }

            Db::startTrans();
            try {
                $existingIds = array_map(
                    'intval',
                    Db::name('user')->where('user_code', 'in', $targetIds)->lock(true)->column('user_code') ?: []
                );
                if (empty($existingIds)) {
                    Db::rollback();
                    return $this->fail('User not found', 404);
                }

                Db::name('seat')->where('user_code', 'in', $existingIds)->update(['user_code' => null]);
                Db::name('offer')->where('user_code', 'in', $existingIds)->update(['user_code' => null]);
                Db::name('user')->where('user_code', 'in', $existingIds)->delete();

                Db::commit();
                return $this->ok([
                    'user_code'     => $existingIds[0],
                    'deleted_ids'   => $existingIds,
                    'deleted_count' => count($existingIds),
                ], 'User deleted successfully');
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
        if (!$this->isValidEmail($email)) {
            return 'Valid email address is required';
        }
        if ($requirePassword && !$this->isValidPasswordLength($password)) {
            return 'Password must be 6-72 characters';
        }
        if (!$requirePassword && $password !== '' && !$this->isValidPasswordLength($password)) {
            return 'New password must be 6-72 characters';
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