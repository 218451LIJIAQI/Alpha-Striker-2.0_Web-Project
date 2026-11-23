<?php
namespace app\admin\controller;

use app\seat\model\Seat as SeatModel;

class Seat extends BaseAdmin
{
    public function index()
    {
        try {
            $model = new SeatModel();
            $seats = $model->with(['movie', 'user', 'theater'])
                ->order('seat_code', 'desc')
                ->select();

            return $this->ok($seats);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query seat bookings', $e);
        }
    }

    public function delete($seat_code = '')
    {
        try {
            $payload = $this->payload();
            $seatId  = (int) ($seat_code !== '' ? $seat_code : ($payload['seat_code'] ?? 0));

            if ($seatId <= 0) {
                return $this->fail('Valid seat_code is required');
            }

            $model   = new SeatModel();
            $deleted = $model->where('seat_code', $seatId)->delete();
            if (!$deleted) {
                return $this->fail('Seat booking not found', 404);
            }

            return $this->ok(['seat_code' => $seatId], 'Seat booking deleted');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete seat booking', $e);
        }
    }
}