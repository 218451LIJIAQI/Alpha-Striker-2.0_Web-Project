<?php
namespace app\movie\controller;

use app\common\controller\ApiController;
use think\Db;
use think\facade\Session;

class Seat extends ApiController
{
    public function getSeatList()
    {
        try {
            $movieCode   = $this->idParam('movie_code');
            $theaterCode = $this->idParam('theater_code') ?: 1;
            $date        = $this->strParam('date');
            $time        = $this->strParam('time');

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

    public function saveSeats()
    {
        try {
            $data        = $this->payload();
            $movieCode   = $this->idParam('movie_code');
            $theaterCode = $this->idParam('theater_code') ?: 1;
            $date        = $this->strParam('date');
            $time        = $this->strParam('time');
            $rawSeats    = $data['seat_nums'] ?? [];

            if ($movieCode <= 0 || $theaterCode <= 0 || $date === '' || $time === '' || empty($rawSeats)) {
                return $this->fail('Complete screening and seat parameters are required');
            }

            $seatList        = is_array($rawSeats) ? $rawSeats : explode(',', (string) $rawSeats);
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

            $resolvedUser = (int) Session::get('user_id', 0) ?: $this->idParam('user_code');
            $userCode     = null;
            if ($resolvedUser > 0) {
                $exists = Db::name('user')->where('user_code', $resolvedUser)->value('user_code');
                if ($exists) {
                    $userCode = (int) $exists;
                }
            }

            $now          = date('Y-m-d H:i:s');
            $rowsToInsert = [];
            foreach ($seatNums as $seatNum) {
                $rowsToInsert[] = [
                    'movie_code'   => $movieCode,
                    'theater_code' => $theaterCode,
                    'user_code'    => $userCode,
                    'date'         => $date,
                    'time'         => $time,
                    'seat_num'     => $seatNum,
                    'seat_zone'    => in_array($seatNum[0], ['D', 'E'], true) ? 2 : 1,
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
                    return $this->fail('Seats already booked: ' . implode(', ', $conflicts), 409);
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

    public function getSeatListByUserCode()
    {
        try {
            $userCode = $this->idParam('user_code') ?: (int) Session::get('user_id', 0);
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
                $tCode                = $seat['theater_code'] ?? 1;
                $seat['movie_info']   = $movies[$seat['movie_code']] ?? null;
                $seat['theater_info'] = $theaters[$tCode] ?? null;
            }
            unset($seat);

            return $this->ok($seats);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load user tickets', $e);
        }
    }

    public function delete($seat_code = '')
    {
        try {
            $seatId = $this->idParam('seat_code', $seat_code);
            if ($seatId <= 0) {
                return $this->fail('Valid seat_code is required');
            }

            $seat = Db::name('seat')->where('seat_code', $seatId)->find();
            if (!$seat) {
                return $this->fail('Ticket record not found', 404);
            }

            $isAdmin      = Session::get('admin_auth') === true;
            $callerUserId = (int) Session::get('user_id', 0) ?: $this->idParam('user_code');
            $ownerUserId  = isset($seat['user_code']) ? (int) $seat['user_code'] : 0;

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