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
                [$empty, $meta] = $this->paginateAndSort([], ['id_asc' => null], 'id_asc');
                return $this->ok($empty, 'OK', ['meta' => $meta]);
            }

            $theaterMap = $this->mapRelationIds('theater_movie', 'movie_code', 'theater_code');
            $offerMap   = $this->mapRelationIds('movie_offer', 'movie_code', 'offer_code');

            foreach ($movies as &$m) {
                $mid                = (int) $m['movie_code'];
                $tCodes             = $theaterMap[$mid] ?? [];
                $oCodes             = $offerMap[$mid] ?? [];
                $m['theater_codes'] = $tCodes;
                $m['theater_count'] = count($tCodes);
                $m['offer_codes']   = $oCodes;
                $m['offer_count']   = count($oCodes);
            }
            unset($m);

            $keyword = strtolower($this->strParam('keyword'));
            $genre   = strtolower($this->strParam('filter', 'all'));

            [$paged, $meta] = $this->paginateAndSort(
                $movies,
                [
                    'id_asc'      => function ($a, $b) { return ((int) $a['movie_code']) <=> ((int) $b['movie_code']); },
                    'id_desc'     => function ($a, $b) { return ((int) $b['movie_code']) <=> ((int) $a['movie_code']); },
                    'title_asc'   => function ($a, $b) { return strcasecmp((string) $a['movie_name'], (string) $b['movie_name']); },
                    'rating_desc' => function ($a, $b) { return ((float) $b['star']) <=> ((float) $a['star']); },
                    'price_desc'  => function ($a, $b) { return ((float) $b['money']) <=> ((float) $a['money']); },
                ],
                'id_asc',
                function ($m) use ($keyword, $genre) {
                    if ($genre !== '' && $genre !== 'all' && strpos(strtolower((string) ($m['movie_type'] ?? '')), $genre) === false) {
                        return false;
                    }
                    if ($keyword !== '') {
                        $hay = strtolower('#' . $m['movie_code'] . ' ' . ($m['movie_name'] ?? '') . ' ' . ($m['movie_type'] ?? '') . ' ' . ($m['tag'] ?? ''));
                        if (strpos($hay, $keyword) === false) {
                            return false;
                        }
                    }
                    return true;
                }
            );

            return $this->ok($paged, 'OK', ['meta' => $meta]);
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

            $movie['theater_codes'] = $this->queryRelationIds('theater_movie', 'movie_code', $movieId, 'theater_code');
            $movie['offer_codes']   = $this->queryRelationIds('movie_offer', 'movie_code', $movieId, 'offer_code');

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

            $theaterCodes = array_key_exists('theater_codes', $payload)
                ? $this->resolveValidIds('theater', 'theater_code', $payload['theater_codes'])
                : array_map('intval', Db::name('theater')->order('theater_code', 'asc')->column('theater_code') ?: []);

            $offerCodes = array_key_exists('offer_codes', $payload)
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

                $this->syncScheduleRows('movie_code', $movieId, $theaterCodes, 'theater_code');
                $this->syncMovieOfferRows('movie_code', $movieId, $offerCodes, 'offer_code');
                Db::commit();

                return $this->ok([
                    'movie_code'    => $movieId,
                    'theater_codes' => $theaterCodes,
                    'offer_codes'   => $offerCodes,
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

            $existing = Db::name('movies')->where('movie_code', $movieId)->find();
            if (!$existing) {
                return $this->fail('Movie not found', 404);
            }

            $merged         = $this->mergeExistingPayload($existing, $payload, self::ALLOWED_FIELDS);
            [$data, $error] = $this->prepareMovieData($merged);
            if ($error !== null) {
                return $this->fail($error);
            }

            $theaterCodes = array_key_exists('theater_codes', $payload)
                ? $this->resolveValidIds('theater', 'theater_code', $payload['theater_codes'])
                : null;
            $offerCodes = array_key_exists('offer_codes', $payload)
                ? $this->resolveValidIds('offer', 'offer_code', $payload['offer_codes'])
                : null;

            Db::startTrans();
            try {
                $data['update_time'] = date('Y-m-d H:i:s');
                if (Db::name('movies')->where('movie_code', $movieId)->update($data) === false) {
                    Db::rollback();
                    return $this->fail('Failed to update movie');
                }

                if ($theaterCodes !== null) {
                    $this->syncScheduleRows('movie_code', $movieId, $theaterCodes, 'theater_code');
                }
                if ($offerCodes !== null) {
                    $this->syncMovieOfferRows('movie_code', $movieId, $offerCodes, 'offer_code');
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
            $targetIds = $this->resolveTargetIds('movie_code', 'movie_codes', $movie_code);
            if (empty($targetIds)) {
                return $this->fail('Valid movie_code is required');
            }

            Db::startTrans();
            try {
                $existingIds = array_map(
                    'intval',
                    Db::name('movies')->where('movie_code', 'in', $targetIds)->lock(true)->column('movie_code') ?: []
                );
                if (empty($existingIds)) {
                    Db::rollback();
                    return $this->fail('Movie not found', 404);
                }

                Db::table('theater_movie')->where('movie_code', 'in', $existingIds)->delete();
                Db::table('movie_offer')->where('movie_code', 'in', $existingIds)->delete();
                Db::name('seat')->where('movie_code', 'in', $existingIds)->delete();
                Db::name('movies')->where('movie_code', 'in', $existingIds)->delete();

                Db::commit();
                return $this->ok([
                    'movie_code'    => $existingIds[0],
                    'deleted_ids'   => $existingIds,
                    'deleted_count' => count($existingIds),
                ], 'Movie deleted successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete movie', $e);
        }
    }

    private function prepareMovieData(array $payload)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        $title = isset($data['movie_name']) ? (string) $data['movie_name'] : '';
        $genre = isset($data['movie_type']) ? (string) $data['movie_type'] : '';
        $img   = isset($data['img']) ? (string) $data['img'] : '';
        $times = isset($data['times']) ? (string) $data['times'] : '';
        $tag   = isset($data['tag']) && $data['tag'] !== null ? (string) $data['tag'] : '';

        if ($title === '' || $this->textLen($title) > 200) {
            return [null, 'Movie title (1-200 characters) is required'];
        }
        if ($genre === '' || $this->textLen($genre) > 50) {
            return [null, 'Movie genre (1-50 characters) is required'];
        }
        if (!$this->isValidAssetPath($img)) {
            return [null, 'Poster image path or URL (1-500 characters) is required'];
        }
        if ($times === '' || $this->textLen($times) > 50) {
            return [null, 'Movie duration (1-50 characters) is required'];
        }
        if ($tag !== '' && $this->textLen($tag) > 50) {
            return [null, 'Highlight badge must be 50 characters or fewer'];
        }

        $star = $this->parseFiniteFloat($data['star'] ?? null, 0.0, 5.0);
        if ($star === null) {
            return [null, 'Rating must be between 0.0 and 5.0'];
        }
        $money = $this->parseFiniteFloat($data['money'] ?? null, 0.0);
        if ($money === null) {
            return [null, 'Ticket price must be a non-negative number'];
        }

        return [[
            'movie_name' => $title,
            'tag'        => $tag !== '' ? $tag : null,
            'star'       => round($star, 1),
            'movie_type' => $genre,
            'img'        => $img,
            'money'      => $this->roundCents($money),
            'times'      => $times,
        ], null];
    }
}