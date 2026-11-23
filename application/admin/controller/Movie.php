<?php
namespace app\admin\controller;

use think\Db;

class Movie extends BaseAdmin
{
    private const ALLOWED_FIELDS = [
        'movie_name',
        'tag',
        'star',
        'movie_type',
        'img',
        'money',
        'times',
    ];

    public function index()
    {
        try {
            $movies = Db::name('movies')->order('movie_code', 'asc')->select();
            if (!empty($movies)) {
                $schedules = Db::table('theater_movie')
                    ->field('movie_code, theater_code, daily_showtimes')
                    ->order('theater_code', 'asc')
                    ->select();
                $theaterMap   = [];
                $showtimesMap = [];
                foreach ($schedules as $row) {
                    $mid = (int) $row['movie_code'];
                    $theaterMap[$mid][] = (int) $row['theater_code'];
                    if (!isset($showtimesMap[$mid])) {
                        $showtimesMap[$mid] = (int) $row['daily_showtimes'];
                    }
                }
                foreach ($movies as &$m) {
                    $mid = (int) $m['movie_code'];
                    $m['theater_codes']   = $theaterMap[$mid] ?? [];
                    $m['daily_showtimes'] = $showtimesMap[$mid] ?? 4;
                }
                unset($m);
            }
            return $this->ok($movies);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query movies', $e);
        }
    }

    public function getMovieByCode($movie_code = '')
    {
        try {
            $movieId = $this->idParam('movie_code', $movie_code);
            if ($movieId <= 0) {
                return $this->fail('Valid movie_code is required');
            }

            $movie = Db::name('movies')->where('movie_code', $movieId)->find();
            if (!$movie) {
                return $this->fail('Movie not found', 404);
            }

            $schedules = Db::table('theater_movie')
                ->where('movie_code', $movieId)
                ->order('theater_code', 'asc')
                ->select();
            $movie['theater_codes']   = array_map('intval', array_column($schedules, 'theater_code'));
            $movie['daily_showtimes'] = !empty($schedules) ? (int) $schedules[0]['daily_showtimes'] : 4;

            return $this->ok($movie);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query movie details', $e);
        }
    }

    public function create()
    {
        try {
            $payload = $this->payload();
            [$data, $error] = $this->prepareMovieData($payload);
            if ($error !== null) {
                return $this->fail($error);
            }

            [$theaterCodes, $dailyShowtimes, $schedErr] = $this->resolveScheduleParams(true);
            if ($schedErr !== null) {
                return $this->fail($schedErr);
            }

            $prevMovieCount = (int) Db::name('movies')->count();
            $universalOffers = [];
            if ($prevMovieCount > 0) {
                $offerCounts = Db::table('movie_offer')
                    ->field('offer_code, COUNT(*) as cnt')
                    ->group('offer_code')
                    ->select();
                foreach ($offerCounts as $oc) {
                    if ((int) $oc['cnt'] >= $prevMovieCount) {
                        $universalOffers[] = (int) $oc['offer_code'];
                    }
                }
            } else {
                $universalOffers = array_map('intval', Db::name('offer')->column('offer_code'));
            }

            $now   = date('Y-m-d H:i:s');
            $today = date('Y-m-d');
            $data['create_time'] = $now;

            Db::startTrans();
            try {
                $movieId = (int) Db::name('movies')->insertGetId($data);
                if ($movieId <= 0) {
                    Db::rollback();
                    return $this->fail('Failed to create movie');
                }

                $this->syncTheaterSchedule($movieId, $theaterCodes, $dailyShowtimes, $today, $now);

                if (!empty($universalOffers)) {
                    $validities = Db::name('offer')
                        ->where('offer_code', 'in', $universalOffers)
                        ->column('offer_validity', 'offer_code');
                    $offerRows = [];
                    foreach ($universalOffers as $oid) {
                        $validTo = $validities[$oid] ?? '2027-12-31';
                        $offerRows[] = [
                            'movie_code'       => $movieId,
                            'offer_code'       => $oid,
                            'discount_percent' => 0.00,
                            'valid_from'       => $today,
                            'valid_to'         => $this->isValidDate($validTo) ? $validTo : '2027-12-31',
                            'created_time'     => $now,
                        ];
                    }
                    Db::table('movie_offer')->insertAll($offerRows);
                }

                Db::commit();
                return $this->ok(['movie_code' => $movieId], 'Movie created successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to create movie', $e);
        }
    }

    public function update($movie_code = '')
    {
        try {
            $movieId = $this->idParam('movie_code', $movie_code);
            if ($movieId <= 0) {
                return $this->fail('Valid movie_code is required');
            }

            if (!Db::name('movies')->where('movie_code', $movieId)->find()) {
                return $this->fail('Movie not found', 404);
            }

            [$data, $error] = $this->prepareMovieData($this->payload());
            if ($error !== null) {
                return $this->fail($error);
            }

            [$theaterCodes, $dailyShowtimes, $schedErr] = $this->resolveScheduleParams(false);
            if ($schedErr !== null) {
                return $this->fail($schedErr);
            }

            $now   = date('Y-m-d H:i:s');
            $today = date('Y-m-d');
            $data['update_time'] = $now;

            Db::startTrans();
            try {
                if (Db::name('movies')->where('movie_code', $movieId)->update($data) === false) {
                    Db::rollback();
                    return $this->fail('Failed to update movie');
                }

                if ($theaterCodes !== null) {
                    $this->syncTheaterSchedule($movieId, $theaterCodes, $dailyShowtimes, $today, $now);
                } elseif ($this->hasParam('daily_showtimes')) {
                    Db::table('theater_movie')
                        ->where('movie_code', $movieId)
                        ->update(['daily_showtimes' => $dailyShowtimes]);
                }

                Db::commit();
                return $this->ok(['movie_code' => $movieId], 'Movie updated successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to update movie', $e);
        }
    }

    public function delete($movie_code = '')
    {
        try {
            $movieId = $this->idParam('movie_code', $movie_code);
            if ($movieId <= 0) {
                return $this->fail('Valid movie_code is required');
            }

            if (!Db::name('movies')->where('movie_code', $movieId)->find()) {
                return $this->fail('Movie not found', 404);
            }

            Db::startTrans();
            try {
                Db::table('theater_movie')->where('movie_code', $movieId)->delete();
                Db::table('movie_offer')->where('movie_code', $movieId)->delete();
                Db::name('seat')->where('movie_code', $movieId)->delete();
                Db::name('movies')->where('movie_code', $movieId)->delete();
                Db::commit();
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }

            return $this->ok(['movie_code' => $movieId], 'Movie deleted successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete movie', $e);
        }
    }

    private function prepareMovieData(array $payload)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        if (empty($data['movie_name']) || $this->textLen($data['movie_name']) > 200) {
            return [null, 'Movie title is required (1-200 characters)'];
        }
        if (empty($data['movie_type']) || $this->textLen($data['movie_type']) > 50) {
            return [null, 'Movie genre is required (1-50 characters)'];
        }
        if (empty($data['img']) || !$this->isSafeAssetUrl($data['img'])) {
            return [null, 'A valid poster image path or URL is required'];
        }
        if (empty($data['times']) || $this->textLen($data['times']) > 50) {
            return [null, 'Movie duration is required (1-50 characters)'];
        }
        if (!isset($data['star']) || !is_numeric($data['star']) || (float) $data['star'] < 0 || (float) $data['star'] > 5) {
            return [null, 'Rating must be between 0.0 and 5.0'];
        }
        if (!isset($data['money']) || !is_numeric($data['money']) || (float) $data['money'] <= 0 || (float) $data['money'] > 9999.99) {
            return [null, 'Ticket price must be greater than 0 and at most 9999.99'];
        }
        if (isset($data['tag']) && $this->textLen($data['tag']) > 50) {
            return [null, 'Highlight badge must be 50 characters or fewer'];
        }

        $data['tag']   = isset($data['tag']) && $data['tag'] !== '' ? $data['tag'] : null;
        $data['star']  = round((float) $data['star'], 1);
        $data['money'] = round((float) $data['money'], 2);

        return [$data, null];
    }

    private function resolveScheduleParams($defaultAllOnOmit)
    {
        $dailyShowtimes = 4;
        if ($this->hasParam('daily_showtimes') && $this->strParam('daily_showtimes') !== '') {
            $ds = $this->idParam('daily_showtimes');
            if ($ds < 1 || $ds > 6) {
                return [null, 4, 'Daily showtimes must be between 1 and 6'];
            }
            $dailyShowtimes = $ds;
        }

        $theaterCodes = $this->intListParam('theater_codes');
        if ($theaterCodes === false) {
            return [null, $dailyShowtimes, 'Invalid theater_codes parameter'];
        }

        if ($theaterCodes === null) {
            if ($defaultAllOnOmit) {
                $theaterCodes = array_map('intval', Db::name('theater')->order('theater_code', 'asc')->column('theater_code'));
            }
            return [$theaterCodes, $dailyShowtimes, null];
        }

        if (!empty($theaterCodes)) {
            $existing = array_map(
                'intval',
                Db::name('theater')->where('theater_code', 'in', $theaterCodes)->column('theater_code')
            );
            if (count($existing) !== count($theaterCodes)) {
                return [null, $dailyShowtimes, 'One or more selected theaters do not exist'];
            }
        }

        return [$theaterCodes, $dailyShowtimes, null];
    }

    private function syncTheaterSchedule($movieId, array $theaterCodes, $dailyShowtimes, $today, $now)
    {
        Db::table('theater_movie')->where('movie_code', $movieId)->delete();
        if (empty($theaterCodes)) {
            return;
        }
        $rows = [];
        foreach ($theaterCodes as $tid) {
            $rows[] = [
                'theater_code'    => (int) $tid,
                'movie_code'      => (int) $movieId,
                'start_date'      => $today,
                'end_date'        => '2027-12-31',
                'daily_showtimes' => (int) $dailyShowtimes,
                'created_time'    => $now,
            ];
        }
        Db::table('theater_movie')->insertAll($rows);
    }
}