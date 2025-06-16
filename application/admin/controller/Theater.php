<?php
namespace app\admin\controller;
use app\theater\model\Theater as TheaterModel;
use think\Db;

class Theater
{
    /**
     * Get theater list for admin
     * @return json
     */
    public function index()
    {
        try {
            $theaters = Db::name('theater')->select();
            return json(['success' => true, 'data' => $theaters]);
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Failed to query theater information: ' . $e->getMessage()
            ]);
        }
    }
} 