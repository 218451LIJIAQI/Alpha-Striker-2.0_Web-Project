<?php
namespace app\admin\controller;
use app\user\model\User as UserModel;

class User
{
    /**
     * Get user list
     * @return json
     */
    public function index()
    {
        $model = new UserModel();
        $users = $model->select();
        return json(['success' => true, 'data' => $users]);
    }

    /**
     * Create user
     * @return json
     */
    public function create()
    {
        $data = input('post.');
        $model = new UserModel();
        $result = $model->save($data);
        return json(['success' => $result]);
    }

    /**
     * Update user information
     * @param string $user_code User code
     * @return json
     */
    public function update($user_code)
    {
        $data = input('post.');
        $model = new UserModel();
        $result = $model->save($data, ['user_code' => $user_code]);
        return json(['success' => $result]);
    }

    /**
     * Delete user
     * @param string $user_code User code
     * @return json
     */
    public function delete($user_code)
    {
        $model = new UserModel();
        $result = $model->where('user_code', $user_code)->delete();
        return json(['success' => $result]);
    }

    /**
     * Query user information by user_code
     * @param string $user_code User code
     * @return json
     */
    public function getUserByCode($user_code = '')
    {
        try {
            if (empty($user_code)) {
                $user_code = input('user_code');
            }

            if (empty($user_code)) {
                return json([
                    'success' => false,
                    'message' => 'user_code parameter cannot be empty'
                ]);
            }

            $model = new UserModel();
            $user = $model->where('user_code', $user_code)->find();

            if ($user) {
                return json([
                    'success' => true,
                    'data' => $user
                ]);
            } else {
                return json([
                    'success' => false,
                    'message' => 'User information not found'
                ]);
            }

        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Query failed: ' . $e->getMessage()
            ]);
        }
    }
}