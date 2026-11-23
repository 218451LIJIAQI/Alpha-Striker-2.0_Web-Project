<?php
namespace app\admin\controller;

use think\Db;

class Theater extends BaseAdmin
{
    public function index()
    {
        try {
            $theaters = Db::name('theater')
                ->order('theater_code', 'asc')
                ->select();

            return $this->ok($theaters);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query theaters', $e);
        }
    }
}