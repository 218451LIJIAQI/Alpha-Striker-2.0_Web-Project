<?php
namespace app\admin\controller;

class Auth
{
    public function login()
    {
        try {
            // Get request data
            $data = input('post.');
            
            // If POST data is empty, try parsing JSON
            if (empty($data)) {
                $input = file_get_contents('php://input');
                if (!empty($input)) {
                    $jsonData = json_decode($input, true);
                    if ($jsonData) {
                        $data = $jsonData;
                    }
                }
            }
            
            $username = isset($data['username']) ? $data['username'] : '';
            $password = isset($data['password']) ? $data['password'] : '';
            
            // Validate required fields
            if (empty($username) || empty($password)) {
                return json([
                    'success' => false,
                    'message' => 'Username and password are required'
                ]);
            }
            
            // Admin credentials verification
            // Should verify from database, using hardcode temporarily
            if ($username === 'admin' && $password === 'admin') {
                // Generate more secure token
                $token = md5('admin_token_' . time() . rand(1000, 9999));
                
                return json([
                    'success' => true,
                    'message' => 'Login successful',
                    'token' => $token,
                    'data' => [
                        'admin_id' => 1,
                        'username' => $username,
                        'role' => 'admin'
                    ]
                ]);
            }
            
            return json([
                'success' => false,
                'message' => 'Invalid username or password'
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Login failed: ' . $e->getMessage()
            ]);
        }
    }
    
    /**
     * Admin logout method
     */
    public function logout()
    {
        try {
            // Clear session or token related logic
            return json([
                'success' => true,
                'message' => 'Logout successful'
            ]);
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Logout failed: ' . $e->getMessage()
            ]);
        }
    }
    
    /**
     * Check admin authentication
     */
    public function checkAuth()
    {
        try {
            // Should verify token validity here
            $token = input('post.token') ?: input('get.token');
            
            if (empty($token)) {
                return json([
                    'success' => false,
                    'message' => 'Token is required'
                ]);
            }
            
            // Simple token verification, should be more complex in actual application
            if (strpos($token, 'admin_token') !== false) {
                return json([
                    'success' => true,
                    'message' => 'Authentication valid',
                    'data' => [
                        'admin_id' => 1,
                        'username' => 'admin',
                        'role' => 'admin'
                    ]
                ]);
            }
            
            return json([
                'success' => false,
                'message' => 'Invalid token'
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Authentication check failed: ' . $e->getMessage()
            ]);
        }
    }
}