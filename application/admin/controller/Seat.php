<?php
namespace app\admin\controller;

use think\Db;

class Seat extends BaseAdmin
{
    public function index()
    {
        try {
            return $this->ok($this->loadEnrichedSeats());
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query seat bookings', $e);
        }
    }

    /**
     * Streams all seat booking orders as a UTF-8 BOM CSV with OWASP formula-injection protection.
     */
    public function exportCsv()
    {
        try {
            $seats   = $this->loadEnrichedSeats();
            $headers = ['Booking ID', 'Movie', 'Theater', 'Date', 'Time', 'Seat', 'Zone', 'Customer', 'Email', 'Created At'];
            $rows    = [];
            foreach ($seats as $s) {
                $zone   = ((int) ($s['seat_zone'] ?? 1)) === 2 ? 'Prime VIP' : 'Standard';
                $rows[] = [
                    $s['seat_code'],
                    $s['movie']['movie_name'] ?? ('Movie #' . $s['movie_code']),
                    $s['theater']['theater_name'] ?? ('Theater #' . ($s['theater_code'] ?? 1)),
                    $s['date'] ?? '',
                    $s['time'] ?? '',
                    $s['seat_num'] ?? '',
                    $zone,
                    $s['user']['user_name'] ?? 'Guest Checkout',
                    $s['user']['email'] ?? '',
                    $s['create_time'] ?? '',
                ];
            }

            return $this->csvResponse('cinetix-seat-bookings.csv', $headers, $rows);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to export seat bookings CSV', $e);
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

    private function loadEnrichedSeats()
    {
        $seats = Db::name('seat')->order('seat_code', 'desc')->select();
        if (empty($seats)) {
            return [];
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
            $uCode           = $seat['user_code'] ?? null;
            $tCode           = $seat['theater_code'] ?? 1;
            $seat['movie']   = $movies[$seat['movie_code']] ?? null;
            $seat['user']    = $uCode ? ($users[$uCode] ?? null) : null;
            $seat['theater'] = $theaters[$tCode] ?? null;
        }
        unset($seat);

        return $seats;
    }
}