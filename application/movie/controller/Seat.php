<?php
namespace app\movie\controller;

use app\common\controller\ApiController;
use think\Db;
use think\facade\Session;

class Seat extends ApiController
{
    /**
     * Query occupied seats for a specific screening (movie, theater, date, time).
     */
    public function getSeatList()
    {
        try {
            $params      = $this->payload();
            $movieCode   = isset($params['movie_code']) ? (int) $params['movie_code'] : 0;
            $theaterCode = !empty($params['theater_code']) ? (int) $params['theater_code'] : 1;
            $date        = isset($params['date']) ? trim((string) $params['date']) : '';
            $time        = isset($params['time']) ? trim((string) $params['time']) : '';

            if ($movieCode <= 0 || $date === '' || $time === '') {
                return $this->fail('movie_code, date, and time are required');
            }

            $seats = Db::name('seat')
                ->where('movie_code', $movieCode)
                ->where('theater_code', $theaterCode)
                ->where('date', $date)
                ->where('time', $time)
                ->field('seat_num, seat_zone, theater_code')
                ->order('seat_num', 'asc')
                ->select();

            return $this->ok($seats);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query occupied seats', $e);
        }
    }

    /**
     * Atomically reserve one or more seats with row-level conflict detection and nullable guest user_code.
     */
    public function saveSeats()
    {
        try {
            $data        = $this->payload();
            $movieCode   = isset($data['movie_code']) ? (int) $data['movie_code'] : 0;
            $theaterCode = !empty($data['theater_code']) ? (int) $data['theater_code'] : 1;
            $date        = isset($data['date']) ? trim((string) $data['date']) : '';
            $time        = isset($data['time']) ? trim((string) $data['time']) : '';
            $rawSeats    = $data['seat_nums'] ?? [];

            if ($movieCode <= 0 || $theaterCode <= 0 || $date === '' || $time === '' || empty($rawSeats)) {
                return $this->fail('Complete screening and seat parameters are required');
            }

            $seatList = is_array($rawSeats) ? $rawSeats : explode(',', (string) $rawSeats);
            $normalizedSeats = [];
            foreach ($seatList as $seat) {
                $code = strtoupper(trim((string) $seat));
                if ($code === '') {
                    continue;
                }
                if (!preg_match('/^[A-H](?:[1-9]|1[0-2])$/', $code)) {
                    return $this->fail("Invalid seat coordinate: {$code}");
                }
                $normalizedSeats[$code] = $code;
            }

            $seatNums = array_values($normalizedSeats);
            if (empty($seatNums)) {
                return $this->fail('At least one valid seat must be selected');
            }

            if (!Db::name('movies')->where('movie_code', $movieCode)->find()) {
                return $this->fail('Selected movie does not exist', 404);
            }
            if (!Db::name('theater')->where('theater_code', $theaterCode)->find()) {
                return $this->fail('Selected theater does not exist', 404);
            }

            // Resolve optional authenticated user_code; store NULL for guest checkouts to satisfy fk_seat_user
            $sessionUserId = (int) Session::get('user_id', 0);
            $requestedId   = isset($data['user_code']) ? (int) $data['user_code'] : 0;
            $resolvedUser  = $sessionUserId > 0 ? $sessionUserId : $requestedId;
            $userCode      = null;

            if ($resolvedUser > 0) {
                $exists = Db::name('user')->where('user_code', $resolvedUser)->value('user_code');
                if ($exists) {
                    $userCode = (int) $exists;
                }
            }

            $now = date('Y-m-d H:i:s');
            $rowsToInsert = [];
            foreach ($seatNums as $seatNum) {
                $rowLetter = substr($seatNum, 0, 1);
                $zone      = in_array($rowLetter, ['D', 'E'], true) ? 2 : 1;
                $rowsToInsert[] = [
                    'movie_code'   => $movieCode,
                    'theater_code' => $theaterCode,
                    'user_code'    => $userCode,
                    'date'         => $date,
                    'time'         => $time,
                    'seat_num'     => $seatNum,
                    'seat_zone'    => $zone,
                    'create_time'  => $now,
                ];
            }

            Db::startTrans();
            try {
                $conflicts = Db::name('seat')
                    ->where('movie_code', $movieCode)
                    ->where('theater_code', $theaterCode)
                    ->where('date', $date)
                    ->where('time', $time)
                    ->where('seat_num', 'in', $seatNums)
                    ->lock(true)
                    ->column('seat_num');

                if (!empty($conflicts)) {
                    Db::rollback();
                    return $this->fail(
                        'Seats already booked: ' . implode(', ', $conflicts),
                        409
                    );
                }

                $insertedCount = Db::name('seat')->insertAll($rowsToInsert);
                Db::commit();

                return $this->ok([
                    'booked_count' => (int) $insertedCount,
                    'seats'        => $seatNums,
                    'theater_code' => $theaterCode,
                    'date'         => $date,
                    'time'         => $time,
                ], 'Booking confirmed');
            } catch (\Throwable $txError) {
                Db::rollback();
                throw $txError;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to save seat booking', $e);
        }
    }

    /**
     * List all booked seats belonging to a user with joined movie and theater details.
     */
    public function getSeatListByUserCode()
    {
        try {
            $params   = $this->payload();
            $userCode = isset($params['user_code']) ? (int) $params['user_code'] : (int) Session::get('user_id', 0);

            if ($userCode <= 0) {
                return $this->fail('Valid user_code parameter is required');
            }

            $seats = Db::name('seat')
                ->where('user_code', $userCode)
                ->field('seat_code, movie_code, theater_code, date, time, seat_num, seat_zone, create_time')
                ->order('seat_code', 'desc')
                ->select();

            if (empty($seats)) {
                return $this->ok([]);
            }

            $movieCodes   = array_values(array_unique(array_column($seats, 'movie_code')));
            $theaterCodes = array_values(array_unique(array_filter(array_column($seats, 'theater_code'))));

            $movies = !empty($movieCodes)
                ? Db::name('movies')
                    ->where('movie_code', 'in', $movieCodes)
                    ->column('movie_code, movie_name, star, tag, money, movie_type, img, times', 'movie_code')
                : [];

            $theaters = !empty($theaterCodes)
                ? Db::name('theater')
                    ->where('theater_code', 'in', $theaterCodes)
                    ->column('theater_code, theater_name, address', 'theater_code')
                : [];

            foreach ($seats as &$seat) {
                $mCode = $seat['movie_code'];
                $tCode = $seat['theater_code'] ?? 1;
                $seat['movie_info']   = $movies[$mCode] ?? null;
                $seat['theater_info'] = $theaters[$tCode] ?? null;
            }
            unset($seat);

            return $this->ok($seats);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load user tickets', $e);
        }
    }

    /**
     * Cancel a booked seat owned by the requesting user (or administrator).
     *
     * @param string $seat_code
     */
    public function delete($seat_code = '')
    {
        try {
            $params   = $this->payload();
            $seatId   = (int) ($seat_code !== '' ? $seat_code : ($params['seat_code'] ?? 0));

            if ($seatId <= 0) {
                return $this->fail('Valid seat_code is required');
            }

            $seat = Db::name('seat')->where('seat_code', $seatId)->find();
            if (!$seat) {
                return $this->fail('Ticket record not found', 404);
            }

            $isAdmin       = Session::get('admin_auth') === true;
            $sessionUserId = (int) Session::get('user_id', 0);
            $callerUserId  = $sessionUserId > 0 ? $sessionUserId : (int) ($params['user_code'] ?? 0);
            $ownerUserId   = isset($seat['user_code']) ? (int) $seat['user_code'] : 0;

            if (!$isAdmin && ($ownerUserId <= 0 || $callerUserId !== $ownerUserId)) {
                return $this->fail('Not authorized to cancel this booking', 403);
            }

            Db::name('seat')->where('seat_code', $seatId)->delete();
            return $this->ok(['seat_code' => $seatId], 'Booking cancelled');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to cancel booking', $e);
        }
    }
}