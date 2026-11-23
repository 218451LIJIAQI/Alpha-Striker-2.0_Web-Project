<?php
namespace app\movie\controller;

use app\admin\controller\BaseAdmin;
use app\common\controller\ApiController;
use think\Db;
use think\facade\Session;

class Seat extends ApiController
{
    public const ALLOWED_SHOWTIMES = [
        '09:30 AM',
        '12:00 PM',
        '02:30 PM',
        '05:15 PM',
        '08:00 PM',
        '10:30 PM',
    ];

    public const MAX_SEATS_PER_ORDER = 10;

    public function getSeatList()
    {
        try {
            $movieCode   = $this->idParam('movie_code');
            $theaterCode = $this->resolveTheaterCode();
            $date        = $this->strParam('date');
            $time        = $this->strParam('time');

            if ($movieCode <= 0 || $theaterCode <= 0 || !$this->isValidDate($date) || $time === '') {
                return $this->fail('Valid movie_code, theater_code, date (YYYY-MM-DD), and time are required');
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
            $theaterCode = $this->resolveTheaterCode();
            $date        = $this->strParam('date');
            $time        = $this->strParam('time');
            $promoCode   = $this->strParam('promo_code') ?: $this->strParam('badge');
            $rawSeats    = $data['seat_nums'] ?? [];

            if ($movieCode <= 0 || $theaterCode <= 0 || $date === '' || $time === '' || empty($rawSeats)) {
                return $this->fail('Complete screening and seat parameters are required');
            }
            if (!$this->isValidDate($date)) {
                return $this->fail('Screening date must be a valid YYYY-MM-DD date');
            }

            $earliestAllowed = date('Y-m-d', strtotime('-1 day'));
            if ($date < $earliestAllowed) {
                return $this->fail('Cannot book seats for a past screening date');
            }

            if (!in_array($time, self::ALLOWED_SHOWTIMES, true)) {
                return $this->fail('Invalid screening showtime selected');
            }

            if (!is_array($rawSeats) && (!is_scalar($rawSeats) || is_bool($rawSeats))) {
                return $this->fail('Invalid seat_nums format');
            }
            $seatList        = is_array($rawSeats) ? $rawSeats : explode(',', (string) $rawSeats);
            $normalizedSeats = [];
            foreach ($seatList as $seat) {
                if (!is_scalar($seat) || is_bool($seat)) {
                    return $this->fail('Invalid seat coordinate entry');
                }
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
            if (count($seatNums) > self::MAX_SEATS_PER_ORDER) {
                return $this->fail('Maximum ' . self::MAX_SEATS_PER_ORDER . ' seats per transaction');
            }

            $movie = Db::name('movies')->where('movie_code', $movieCode)->find();
            if (!$movie) {
                return $this->fail('Selected movie does not exist', 404);
            }
            $theater = Db::name('theater')->where('theater_code', $theaterCode)->find();
            if (!$theater) {
                return $this->fail('Selected theater does not exist', 404);
            }

            $schedule = Db::table('theater_movie')
                ->where('theater_code', $theaterCode)
                ->where('movie_code', $movieCode)
                ->find();
            if (!$schedule) {
                return $this->fail('This movie is not scheduled at the selected theater');
            }
            if (!empty($schedule['start_date']) && $this->isValidDate($schedule['start_date']) && $date < $schedule['start_date']) {
                return $this->fail('Selected date is before the screening schedule window');
            }
            if (!empty($schedule['end_date']) && $this->isValidDate($schedule['end_date']) && $date > $schedule['end_date']) {
                return $this->fail('Selected date is after the screening schedule window');
            }
            $dailyShowtimes = max(1, min(count(self::ALLOWED_SHOWTIMES), (int) ($schedule['daily_showtimes'] ?? 6)));
            $slotIndex      = array_search($time, self::ALLOWED_SHOWTIMES, true);
            if ($slotIndex !== false && $slotIndex >= $dailyShowtimes) {
                return $this->fail('Selected showtime is not available for this theater schedule');
            }

            // Bind booking exclusively to server-authenticated session user (preventing account spoofing)
            $sessionUserId = (int) Session::get('user_id', 0);
            $userCode      = null;
            if ($sessionUserId > 0) {
                $exists = Db::name('user')->where('user_code', $sessionUserId)->value('user_code');
                if ($exists) {
                    $userCode = (int) $exists;
                } else {
                    Session::delete('user_id');
                    Session::delete('user_email');
                }
            }

            $appliedOffer = null;
            $promoMoney   = 0.00;
            if ($promoCode !== '') {
                [$appliedOffer, $offerErr] = $this->validateOfferForBooking($promoCode, $movieCode, $date, $userCode ?: 0);
                if ($offerErr !== null) {
                    return $this->fail($offerErr);
                }
                $promoMoney = (float) $appliedOffer['money'];
            }

            $pricing = $this->calculateCheckoutPricing($movie['money'], count($seatNums), $promoMoney);
            $now     = date('Y-m-d H:i:s');

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

                $seatCodes = [];
                foreach ($seatNums as $seatNum) {
                    $seatId = (int) Db::name('seat')->insertGetId([
                        'movie_code'   => $movieCode,
                        'theater_code' => $theaterCode,
                        'user_code'    => $userCode,
                        'date'         => $date,
                        'time'         => $time,
                        'seat_num'     => $seatNum,
                        'seat_zone'    => in_array($seatNum[0], ['D', 'E'], true) ? 2 : 1,
                        'create_time'  => $now,
                    ]);
                    $seatCodes[] = $seatId;
                }

                Db::commit();

                $firstId    = !empty($seatCodes) ? $seatCodes[0] : 0;
                $bookingRef = 'BK-' . date('ymd') . '-' . str_pad((string) $firstId, 4, '0', STR_PAD_LEFT);

                return $this->ok([
                    'booking_ref'  => $bookingRef,
                    'booked_count' => count($seatCodes),
                    'seats'        => $seatNums,
                    'seat_codes'   => $seatCodes,
                    'movie_code'   => $movieCode,
                    'movie_name'   => $movie['movie_name'],
                    'theater_code' => $theaterCode,
                    'theater_name' => $theater['theater_name'],
                    'date'         => $date,
                    'time'         => $time,
                    'promo_code'   => $appliedOffer ? $appliedOffer['promo_code'] : null,
                    'pricing'      => $pricing,
                ], 'Booking confirmed');
            } catch (\Throwable $txError) {
                Db::rollback();
                if ($this->isDuplicateSeatException($txError)) {
                    return $this->fail('One or more selected seats were just booked by another customer', 409);
                }
                throw $txError;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to save seat booking', $e);
        }
    }

    public function getSeatListByUserCode()
    {
        try {
            $isAdmin       = BaseAdmin::checkSession($this->payload());
            $sessionUserId = (int) Session::get('user_id', 0);
            $requestedId   = $this->idParam('user_code');

            if (!$isAdmin) {
                if ($sessionUserId <= 0) {
                    return $this->fail('Authentication required to view tickets', 401);
                }
                if ($requestedId > 0 && $requestedId !== $sessionUserId) {
                    return $this->fail('Not authorized to access another user\'s tickets', 403);
                }
                $userCode = $sessionUserId;
            } else {
                $userCode = $requestedId > 0 ? $requestedId : $sessionUserId;
                if ($userCode <= 0) {
                    return $this->fail('Valid user_code parameter is required');
                }
            }

            if (!Db::name('user')->where('user_code', $userCode)->value('user_code')) {
                if (!$isAdmin) {
                    Session::delete('user_id');
                    Session::delete('user_email');
                    return $this->fail('User account is no longer active', 401);
                }
                return $this->fail('User not found', 404);
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

            $isAdmin      = BaseAdmin::checkSession($this->payload());
            $callerUserId = (int) Session::get('user_id', 0);
            $ownerUserId  = isset($seat['user_code']) ? (int) $seat['user_code'] : 0;

            if (!$isAdmin) {
                if ($callerUserId <= 0) {
                    return $this->fail('Authentication required to cancel bookings', 401);
                }
                if ($ownerUserId <= 0 || $callerUserId !== $ownerUserId) {
                    return $this->fail('Not authorized to cancel this booking', 403);
                }
            }

            Db::name('seat')->where('seat_code', $seatId)->delete();
            return $this->ok(['seat_code' => $seatId], 'Booking cancelled');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to cancel booking', $e);
        }
    }

    private function resolveTheaterCode()
    {
        if (!$this->hasParam('theater_code') || $this->strParam('theater_code') === '') {
            return 1;
        }
        return $this->idParam('theater_code');
    }

    private function isDuplicateSeatException(\Throwable $e)
    {
        $msg  = strtolower($e->getMessage());
        $code = (string) $e->getCode();
        return $code === '23000'
            || strpos($msg, '1062') !== false
            || strpos($msg, 'duplicate entry') !== false
            || strpos($msg, 'unique constraint') !== false;
    }
}