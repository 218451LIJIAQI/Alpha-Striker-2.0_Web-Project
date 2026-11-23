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
            if (empty($movies)) {
                return $this->ok([]);
            }

            $links      = Db::table('theater_movie')->select();
            $theaterMap = [];
            foreach ($links as $row) {
                $mid = (int) $row['movie_code'];
                $theaterMap[$mid][] = (int) $row['theater_code'];
            }

            foreach ($movies as &$m) {
                $mid                = (int) $m['movie_code'];
                $tCodes             = $theaterMap[$mid] ?? [];
                sort($tCodes);
                $m['theater_codes'] = $tCodes;
                $m['theater_count'] = count($tCodes);
            }
            unset($m);

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

            $tCodes = Db::table('theater_movie')
                ->where('movie_code', $movieId)
                ->order('theater_code', 'asc')
                ->column('theater_code');
            $movie['theater_codes'] = array_map('intval', $tCodes ?: []);

            return $this->ok($movie);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query movie details', $e);
        }
    }

    public function create()
    {
        try {
            $payload        = $this->payload();
            [$data, $error] = $this->prepareMovieData($payload);
            if ($error !== null) {
                return $this->fail($error);
            }

            $hasTheaterKey = array_key_exists('theater_codes', $payload);
            $theaterCodes  = $hasTheaterKey
                ? $this->resolveValidIds('theater', 'theater_code', $payload['theater_codes'])
                : array_map('intval', Db::name('theater')->order('theater_code', 'asc')->column('theater_code') ?: []);

            $hasOfferKey = array_key_exists('offer_codes', $payload);
            $offerCodes  = $hasOfferKey
                ? $this->resolveValidIds('offer', 'offer_code', $payload['offer_codes'])
                : array_map('intval', Db::name('offer')->whereNull('user_code')->order('offer_code', 'asc')->column('offer_code') ?: []);

            Db::startTrans();
            try {
                $data['create_time'] = date('Y-m-d H:i:s');
                $movieId             = (int) Db::name('movies')->insertGetId($data);
                if ($movieId <= 0) {
                    Db::rollback();
                    return $this->fail('Failed to create movie');
                }

                $this->syncMovieTheaters($movieId, $theaterCodes);
                $this->syncMovieOffers($movieId, $offerCodes);
                Db::commit();

                return $this->ok([
                    'movie_code'    => $movieId,
                    'theater_codes' => $theaterCodes,
                ], 'Movie created successfully');
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
            $payload = $this->payload();
            $movieId = $this->idParam('movie_code', $movie_code);
            if ($movieId <= 0) {
                return $this->fail('Valid movie_code is required');
            }

            if (!Db::name('movies')->where('movie_code', $movieId)->find()) {
                return $this->fail('Movie not found', 404);
            }

            [$data, $error] = $this->prepareMovieData($payload);
            if ($error !== null) {
                return $this->fail($error);
            }

            $hasTheaterKey = array_key_exists('theater_codes', $payload);
            $theaterCodes  = $hasTheaterKey
                ? $this->resolveValidIds('theater', 'theater_code', $payload['theater_codes'])
                : null;

            Db::startTrans();
            try {
                $data['update_time'] = date('Y-m-d H:i:s');
                if (Db::name('movies')->where('movie_code', $movieId)->update($data) === false) {
                    Db::rollback();
                    return $this->fail('Failed to update movie');
                }

                if ($theaterCodes !== null) {
                    $this->syncMovieTheaters($movieId, $theaterCodes);
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

            Db::startTrans();
            try {
                if (!Db::name('movies')->where('movie_code', $movieId)->find()) {
                    Db::rollback();
                    return $this->fail('Movie not found', 404);
                }

                Db::table('theater_movie')->where('movie_code', $movieId)->delete();
                Db::table('movie_offer')->where('movie_code', $movieId)->delete();
                Db::name('seat')->where('movie_code', $movieId)->delete();
                Db::name('movies')->where('movie_code', $movieId)->delete();

                Db::commit();
                return $this->ok(['movie_code' => $movieId], 'Movie deleted successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete movie', $e);
        }
    }

    private function syncMovieTheaters($movieId, array $theaterCodes)
    {
        Db::table('theater_movie')->where('movie_code', $movieId)->delete();
        if (empty($theaterCodes)) {
            return;
        }

        $now  = date('Y-m-d H:i:s');
        $rows = [];
        foreach ($theaterCodes as $tid) {
            $rows[] = [
                'theater_code'    => (int) $tid,
                'movie_code'      => (int) $movieId,
                'start_date'      => '2026-01-01',
                'end_date'        => '2027-12-31',
                'daily_showtimes' => 4,
                'created_time'    => $now,
            ];
        }
        Db::table('theater_movie')->insertAll($rows);
    }

    private function syncMovieOffers($movieId, array $offerCodes)
    {
        Db::table('movie_offer')->where('movie_code', $movieId)->delete();
        if (empty($offerCodes)) {
            return;
        }

        $offers = Db::name('offer')->where('offer_code', 'in', $offerCodes)->column('offer_validity', 'offer_code');
        $now    = date('Y-m-d H:i:s');
        $rows   = [];
        foreach ($offerCodes as $oid) {
            $validTo = isset($offers[$oid]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $offers[$oid])
                ? $offers[$oid]
                : '2027-12-31';
            $rows[] = [
                'movie_code'       => (int) $movieId,
                'offer_code'       => (int) $oid,
                'discount_percent' => 0.00,
                'valid_from'       => '2026-01-01',
                'valid_to'         => $validTo,
                'created_time'     => $now,
            ];
        }
        Db::table('movie_offer')->insertAll($rows);
    }

    private function resolveValidIds($table, $pk, $raw)
    {
        $ids = $this->normalizeIdArray($raw);
        if (empty($ids)) {
            return [];
        }
        $valid = Db::name($table)->where($pk, 'in', $ids)->order($pk, 'asc')->column($pk);
        return array_map('intval', $valid ?: []);
    }

    private function prepareMovieData(array $payload)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        if (empty($data['movie_name']) || $this->textLen($data['movie_name']) > 200) {
            return [null, 'Movie title (1-200 characters) is required'];
        }
        if (empty($data['movie_type']) || $this->textLen($data['movie_type']) > 50) {
            return [null, 'Movie genre (1-50 characters) is required'];
        }
        if (empty($data['img']) || $this->textLen($data['img']) > 500) {
            return [null, 'Poster image path or URL (1-500 characters) is required'];
        }
        if (empty($data['times']) || $this->textLen($data['times']) > 50) {
            return [null, 'Movie duration (1-50 characters) is required'];
        }
        if (isset($data['tag']) && $this->textLen($data['tag']) > 50) {
            return [null, 'Highlight badge must be 50 characters or fewer'];
        }
        if (!isset($data['star']) || !is_numeric($data['star']) || (float) $data['star'] < 0 || (float) $data['star'] > 5) {
            return [null, 'Rating must be between 0.0 and 5.0'];
        }
        if (!isset($data['money']) || !is_numeric($data['money']) || (float) $data['money'] < 0) {
            return [null, 'Ticket price must be a non-negative number'];
        }

        $data['tag']   = isset($data['tag']) && $data['tag'] !== '' ? $data['tag'] : null;
        $data['star']  = round((float) $data['star'], 1);
        $data['money'] = round((float) $data['money'], 2);

        return [$data, null];
    }
}