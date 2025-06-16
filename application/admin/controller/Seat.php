<?php
namespace app\admin\controller;
use app\seat\model\Seat as SeatModel;
use app\movie\model\Movies as MovieModel;
use app\user\model\User as UserModel;

class Seat
{
    public function index()
    {
        try {
            $model = new SeatModel();
            $seats = $model->with(['movie','user'])->select();
            return json(['success' => true, 'data' => $seats]);
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Failed to query seat information: ' . $e->getMessage()
            ]);
        }
    }
    
    public function delete($seat_code)
    {
        $model = new SeatModel();
        $result = $model->where('seat_code', $seat_code)->delete();
        return json(['success' => $result]);
    }
}