<?php
namespace app\admin\controller;

use think\Db;

class Seat extends BaseAdmin
{
    public function index()
    {
        try {
            $seats   = $this->loadEnrichedSeats();
            $keyword = strtolower($this->strParam('keyword'));
            $filter  = strtolower($this->strParam('filter', 'all'));

            [$paged, $meta] = $this->paginateAndSort(
                $seats,
                [
                    'id_desc'  => function ($a, $b) { return ((int) $b['seat_code']) <=> ((int) $a['seat_code']); },
                    'id_asc'   => function ($a, $b) { return ((int) $a['seat_code']) <=> ((int) $b['seat_code']); },
                    'date_asc' => function ($a, $b) { return $this->compareScreeningRows($a, $b); },
                    'seat_asc' => function ($a, $b) { return $this->compareSeatCodes($a['seat_num'] ?? '', $b['seat_num'] ?? ''); },
                ],
                'id_desc',
                function ($s) use ($keyword, $filter) {
                    $isVip     = ((int) ($s['seat_zone'] ?? 1)) === 2;
                    $hasMember = !empty($s['user']['user_name']);
                    if ($filter === 'vip' && !$isVip) {
                        return false;
                    }
                    if ($filter === 'std' && $isVip) {
                        return false;
                    }
                    if ($filter === 'member' && !$hasMember) {
                        return false;
                    }
                    if ($filter === 'guest' && $hasMember) {
                        return false;
                    }
                    if ($keyword !== '') {
                        $m   = $s['movie']['movie_name'] ?? ('Movie #' . $s['movie_code']);
                        $t   = $s['theater']['theater_name'] ?? ('Theater #' . ($s['theater_code'] ?? 1));
                        $u   = $hasMember ? ($s['user']['user_name'] . ' ' . ($s['user']['email'] ?? '')) : 'guest';
                        $hay = strtolower('#' . $s['seat_code'] . ' ' . $m . ' ' . $t . ' ' . $u . ' ' . ($s['date'] ?? '') . ' ' . ($s['time'] ?? '') . ' ' . ($s['seat_num'] ?? ''));
                        if (strpos($hay, $keyword) === false) {
                            return false;
                        }
                    }
                    return true;
                }
            );

            return $this->ok($paged, 'OK', ['meta' => $meta]);
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
            $targetIds = $this->resolveTargetIds('seat_code', 'seat_codes', $seat_code);
            if (empty($targetIds)) {
                return $this->fail('Valid seat_code is required');
            }

            Db::startTrans();
            try {
                $existingIds = array_map(
                    'intval',
                    Db::name('seat')->where('seat_code', 'in', $targetIds)->lock(true)->column('seat_code') ?: []
                );
                if (empty($existingIds)) {
                    Db::rollback();
                    return $this->fail('Seat booking not found', 404);
                }

                Db::name('seat')->where('seat_code', 'in', $existingIds)->delete();
                Db::commit();

                return $this->ok([
                    'seat_code'     => $existingIds[0],
                    'deleted_ids'   => $existingIds,
                    'deleted_count' => count($existingIds),
                ], 'Seat booking deleted');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
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