<?php
namespace app\admin\controller;

use think\Db;

class Seat extends BaseAdmin
{
    public function index()
    {
        try {
            $seats = Db::name('seat')->order('seat_code', 'desc')->select();
            if (empty($seats)) {
                return $this->ok([]);
            }

            $movieIds   = array_values(array_unique(array_filter(array_column($seats, 'movie_code'))));
            $userIds    = array_values(array_unique(array_filter(array_column($seats, 'user_code'))));
            $theaterIds = array_values(array_unique(array_filter(array_column($seats, 'theater_code'))));

            $movies = !empty($movieIds)
                ? Db::name('movies')->where('movie_code', 'in', $movieIds)->column('*', 'movie_code')
                : [];
            $users = !empty($userIds)
                ? Db::name('user')->where('user_code', 'in', $userIds)->column('user_code, user_name, email', 'user_code')
                : [];
            $theaters = !empty($theaterIds)
                ? Db::name('theater')->where('theater_code', 'in', $theaterIds)->column('theater_code, theater_name, address', 'theater_code')
                : [];

            foreach ($seats as &$seat) {
                $uCode = $seat['user_code'] ?? null;
                $tCode = $seat['theater_code'] ?? 1;
                $seat['movie']   = $movies[$seat['movie_code']] ?? null;
                $seat['user']    = $uCode ? ($users[$uCode] ?? null) : null;
                $seat['theater'] = $theaters[$tCode] ?? null;
            }
            unset($seat);

            return $this->ok($seats);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query seat bookings', $e);
        }
    }

    public function delete($seat_code = '')
    {
        try {
            $seatId = $this->idParam('seat_code', $seat_code);
            if ($seatId <= 0) {
                return $this->fail('Valid seat_code is required');
            }

            if (!Db::name('seat')->where('seat_code', $seatId)->delete()) {
                return $this->fail('Seat booking not found', 404);
            }

            return $this->ok(['seat_code' => $seatId], 'Seat booking deleted');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete seat booking', $e);
        }
    }
}