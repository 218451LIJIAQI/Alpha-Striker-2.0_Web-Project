<?php
namespace app\user\controller;
use app\user\model\User as UserModel;
use think\Db;

class User
{
    /**
     * User registration method
     * @param string $name Username
     * @param string $email Email
     * @param string $password Password
     * @return json
     */
    public function reg()
    {
        try {
        // Get request parameters
            $data = input('post.');
            // 
            $name = $data['name'];
            $email = $data['email'];
            $password = $data['password'];
            // Verify if email already exists
            $exist = Db::name('user')->where('email', $email)->find();
    
            if ($exist) {
                return json(['success' => false, 'message' => 'This email has been registered']);
            }

            $login_pwd =$password;

            // Save user data
            $userModel = new UserModel();
            $userModel->user_name = $name;
            $userModel->email = $email;
            $userModel->login_pwd = $login_pwd;
            $userModel->create_time = date('Y-m-d H:i:s');
            
            if ($userModel->save()) {
                return json(['success' => true, 'message' => 'Registration successful']);
            } else {
                return json(['success' => false, 'message' => 'Registration failed']);
            }
        
        } catch (\Exception $e) {
            // Catch and return database error
            return json([
                'success' => false,
                'message' => 'Database operation failed: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * User login method
     * @return json
     */
    public function login()
    {
        try {
            // Get request parameters
            $data = input('post.');
            $email = $data['email'];
            $password = $data['password'];

            // Verify if email exists
            $user = Db::name('user')->where('email', $email)->find();
            
            if (!$user) {
                return json(['success' => false, 'message' => 'User does not exist']);
            }

            if ($password !== $user['login_pwd']) {
                return json(['success' => false, 'message' => 'Password incorrect']);
            }

            // Login successful
            return json([
                'success' => true,
                'message' => 'Login successful',
                'data' => [
                    'user_id' => $user['user_code'],
                    'user_name' => $user['user_name'],
                    'email' => $user['email']
                ]
            ]);

        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Login failed: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * Change password method
     * @param string $email User email
     * @param string $pwd New password
     * @param string $verification_code Verification code
     * @return json
     */
    public function changePassword()
    {
        try {
            // Get request parameters
            $data = input('post.');
            $email = $data['email'];
            $pwd = $data['pwd'];
            $verification_code = $data['verification_code'];
            
            // Verify verification code
            if ($verification_code !== '888888') {
                return json(['success' => false, 'message' => 'Verification code incorrect']);
            }
            
            // Verify if email exists
            $user = Db::name('user')->where('email', $email)->find();
            if (!$user) {
                return json(['success' => false, 'message' => 'User does not exist']);
            }
            
            // Update password
            $update = Db::name('user')
                ->where('email', $email)
                ->update([
                    'login_pwd' => $pwd,
                    'update_time' => date('Y-m-d H:i:s')
                ]);
                
            if ($update) {
                return json(['success' => true, 'message' => 'Password changed successfully']);
            } else {
                return json(['success' => false, 'message' => 'Password change failed']);
            }
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Password change failed: ' . $e->getMessage()
            ]);
        }
    }
}
