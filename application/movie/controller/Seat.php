<?php
namespace app\movie\controller;

use app\common\controller\ApiController;
use think\Db;
use think\facade\Session;

class Seat extends ApiController
{
    private const ALLOWED_PAYMENT_METHODS = ['card', 'paypal', 'applepay', 'googlepay'];

    public function getSeatList()
    {
        try {
            $movieCode   = $this->idParam('movie_code');
            $theaterCode = $this->optionalIdWithDefault('theater_code', 1);
            $date        = $this->strParam('date');
            $time        = $this->strParam('time');

            if ($movieCode <= 0 || $theaterCode <= 0 || !$this->isValidIsoDate($date) || $time === '') {
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
            $data          = $this->payload();
            $movieCode     = $this->idParam('movie_code');
            $theaterCode   = $this->optionalIdWithDefault('theater_code', 1);
            $date          = $this->strParam('date');
            $time          = $this->strParam('time');
            $promoCode     = strtoupper($this->strParam('promo_code'));
            $paymentMethod = strtolower($this->strParam('payment_method', 'card'));
            $rawSeats      = $data['seat_nums'] ?? [];

            if (!in_array($paymentMethod, self::ALLOWED_PAYMENT_METHODS, true)) {
                $paymentMethod = 'card';
            }

            if (
                $movieCode <= 0 ||
                $theaterCode <= 0 ||
                !$this->isValidIsoDate($date) ||
                $time === '' ||
                $this->textLen($time) > 30 ||
                empty($rawSeats)
            ) {
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
            if (count($seatNums) > self::MAX_SEATS_PER_ORDER) {
                return $this->fail('Maximum ' . self::MAX_SEATS_PER_ORDER . ' seats allowed per transaction');
            }

            // Strictly trust server-side Session user_id ONLY (never client-supplied user_code)
            $sessionUserId = (int) Session::get('user_id', 0);
            $userCode      = null;
            if ($sessionUserId > 0) {
                $exists = Db::name('user')->where('user_code', $sessionUserId)->value('user_code');
                if ($exists) {
                    $userCode = (int) $exists;
                }
            }

            Db::startTrans();
            try {
                $movie = Db::name('movies')
                    ->field('movie_code, movie_name, money')
                    ->where('movie_code', $movieCode)
                    ->find();
                if (!$movie) {
                    Db::rollback();
                    return $this->fail('Selected movie does not exist', 404);
                }

                $theater = Db::name('theater')
                    ->field('theater_code, theater_name')
                    ->where('theater_code', $theaterCode)
                    ->find();
                if (!$theater) {
                    Db::rollback();
                    return $this->fail('Selected theater does not exist', 404);
                }

                $schedule = Db::table('theater_movie')
                    ->where('theater_code', $theaterCode)
                    ->where('movie_code', $movieCode)
                    ->find();
                if (!$schedule) {
                    Db::rollback();
                    return $this->fail('Selected movie is not scheduled at this theater');
                }
                if (
                    (!empty($schedule['start_date']) && $date < $schedule['start_date']) ||
                    (!empty($schedule['end_date']) && $date > $schedule['end_date'])
                ) {
                    Db::rollback();
                    return $this->fail('Selected screening date is outside the theater schedule window');
                }

                $promoMoney       = 0.00;
                $appliedPromoCode = null;
                if ($promoCode !== '') {
                    $promoCheck = $this->validatePromoForContext($promoCode, $movieCode, $userCode ?: 0, $date);
                    if (!$promoCheck['valid']) {
                        Db::rollback();
                        return $this->fail($promoCheck['message'], $promoCheck['status']);
                    }
                    $promoMoney       = (float) $promoCheck['offer']['money'];
                    $appliedPromoCode = $promoCheck['offer']['promo_code'];
                }

                $pricing = $this->calculatePricing((float) $movie['money'], count($seatNums), $promoMoney);

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
                        409,
                        ['conflict_seats' => array_values($conflicts)]
                    );
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

                $insertedCount = (int) Db::name('seat')->insertAll($rowsToInsert);
                Db::commit();

                $receiptNo = 'BK-' . str_replace('-', '', $date) . '-' . strtoupper(bin2hex(random_bytes(3)));

                return $this->ok([
                    'receipt_no'     => $receiptNo,
                    'booked_count'   => $insertedCount,
                    'seats'          => $seatNums,
                    'movie_code'     => $movieCode,
                    'movie_name'     => $movie['movie_name'],
                    'theater_code'   => $theaterCode,
                    'theater_name'   => $theater['theater_name'],
                    'date'           => $date,
                    'time'           => $time,
                    'promo_code'     => $appliedPromoCode,
                    'payment_method' => $paymentMethod,
                    'pricing'        => $pricing,
                ], 'Booking confirmed');
            } catch (\Throwable $txError) {
                Db::rollback();
                if ($this->isUniqueConflict($txError)) {
                    $actualConflicts = Db::name('seat')
                        ->where('movie_code', $movieCode)
                        ->where('theater_code', $theaterCode)
                        ->where('date', $date)
                        ->where('time', $time)
                        ->where('seat_num', 'in', $seatNums)
                        ->column('seat_num');
                    $conflictList = !empty($actualConflicts) ? array_values($actualConflicts) : $seatNums;
                    return $this->fail(
                        'Seats already booked: ' . implode(', ', $conflictList),
                        409,
                        ['conflict_seats' => $conflictList]
                    );
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
            $sessionUserId = (int) Session::get('user_id', 0);
            if ($sessionUserId <= 0) {
                return $this->fail('Authentication required to view tickets', 401);
            }

            $requestedUserId = $this->idParam('user_code');
            if ($requestedUserId > 0 && $requestedUserId !== $sessionUserId) {
                return $this->fail('Forbidden: cannot access another user\'s tickets', 403);
            }

            $seats = Db::name('seat')
                ->where('user_code', $sessionUserId)
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
            $sessionUserId = (int) Session::get('user_id', 0);
            if ($sessionUserId <= 0) {
                return $this->fail('Authentication required to cancel a booking', 401);
            }

            $seatId = $this->idParam('seat_code', $seat_code);
            if ($seatId <= 0) {
                return $this->fail('Valid seat_code is required');
            }

            $seat = Db::name('seat')->where('seat_code', $seatId)->find();
            if (!$seat) {
                return $this->fail('Ticket record not found', 404);
            }

            $ownerUserId = isset($seat['user_code']) && $seat['user_code'] !== null ? (int) $seat['user_code'] : 0;
            if ($ownerUserId <= 0 || $ownerUserId !== $sessionUserId) {
                return $this->fail('Not authorized to cancel this booking', 403);
            }

            Db::name('seat')
                ->where('seat_code', $seatId)
                ->where('user_code', $sessionUserId)
                ->delete();

            return $this->ok(['seat_code' => $seatId], 'Booking cancelled');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to cancel booking', $e);
        }
    }
}