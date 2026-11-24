<?php
namespace app\admin\controller;

use think\Db;

class Theater extends BaseAdmin
{
    private const ALLOWED_FIELDS = [
        'theater_name',
        'address',
        'amenity',
        'star',
        'img',
        'reviews',
        'distance',
        'theater_id',
    ];

    public function index()
    {
        try {
            $theaters = Db::name('theater')->order('theater_code', 'asc')->select();
            if (empty($theaters)) {
                return $this->ok([]);
            }

            $movieMap = $this->mapRelationIds('theater_movie', 'theater_code', 'movie_code');
            foreach ($theaters as &$t) {
                $tid              = (int) $t['theater_code'];
                $mCodes           = $movieMap[$tid] ?? [];
                $t['movie_codes'] = $mCodes;
                $t['movie_count'] = count($mCodes);
            }
            unset($t);

            return $this->ok($theaters);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query theaters', $e);
        }
    }

    public function getTheaterByCode($theater_code = '')
    {
        try {
            $theaterId = $this->idParam('theater_code', $theater_code);
            if ($theaterId <= 0) {
                return $this->fail('Valid theater_code is required');
            }

            $theater = Db::name('theater')->where('theater_code', $theaterId)->find();
            if (!$theater) {
                return $this->fail('Theater not found', 404);
            }

            $theater['movie_codes'] = $this->queryRelationIds('theater_movie', 'theater_code', $theaterId, 'movie_code');

            return $this->ok($theater);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query theater details', $e);
        }
    }

    public function create()
    {
        try {
            $payload        = $this->payload();
            [$data, $error] = $this->prepareTheaterData($payload);
            if ($error !== null) {
                return $this->fail($error);
            }

            $movieCodes = array_key_exists('movie_codes', $payload)
                ? $this->resolveValidIds('movies', 'movie_code', $payload['movie_codes'])
                : array_map('intval', Db::name('movies')->order('movie_code', 'asc')->column('movie_code') ?: []);

            Db::startTrans();
            try {
                $data['create_time'] = date('Y-m-d H:i:s');
                $theaterId           = (int) Db::name('theater')->insertGetId($data);
                if ($theaterId <= 0) {
                    Db::rollback();
                    return $this->fail('Failed to create theater');
                }

                if ($data['theater_id'] === null || $data['theater_id'] === '') {
                    $autoCode = 'TH-' . str_pad((string) $theaterId, 3, '0', STR_PAD_LEFT);
                    Db::name('theater')->where('theater_code', $theaterId)->update(['theater_id' => $autoCode]);
                }

                $this->syncScheduleRows('theater_code', $theaterId, $movieCodes, 'movie_code');
                Db::commit();

                return $this->ok([
                    'theater_code' => $theaterId,
                    'movie_codes'  => $movieCodes,
                ], 'Theater created successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to create theater', $e);
        }
    }

    public function update($theater_code = '')
    {
        try {
            $payload   = $this->payload();
            $theaterId = $this->idParam('theater_code', $theater_code);
            if ($theaterId <= 0) {
                return $this->fail('Valid theater_code is required');
            }

            $existing = Db::name('theater')->where('theater_code', $theaterId)->find();
            if (!$existing) {
                return $this->fail('Theater not found', 404);
            }

            $merged         = $this->mergeExistingPayload($existing, $payload, self::ALLOWED_FIELDS);
            [$data, $error] = $this->prepareTheaterData($merged);
            if ($error !== null) {
                return $this->fail($error);
            }
            if ($data['theater_id'] === null || $data['theater_id'] === '') {
                $data['theater_id'] = 'TH-' . str_pad((string) $theaterId, 3, '0', STR_PAD_LEFT);
            }

            $movieCodes = array_key_exists('movie_codes', $payload)
                ? $this->resolveValidIds('movies', 'movie_code', $payload['movie_codes'])
                : null;

            Db::startTrans();
            try {
                $data['update_time'] = date('Y-m-d H:i:s');
                if (Db::name('theater')->where('theater_code', $theaterId)->update($data) === false) {
                    Db::rollback();
                    return $this->fail('Failed to update theater');
                }

                if ($movieCodes !== null) {
                    $this->syncScheduleRows('theater_code', $theaterId, $movieCodes, 'movie_code');
                }

                Db::commit();
                return $this->ok(['theater_code' => $theaterId], 'Theater updated successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to update theater', $e);
        }
    }

    public function delete($theater_code = '')
    {
        try {
            $theaterId = $this->idParam('theater_code', $theater_code);
            if ($theaterId <= 0) {
                return $this->fail('Valid theater_code is required');
            }

            Db::startTrans();
            try {
                if (!Db::name('theater')->where('theater_code', $theaterId)->find()) {
                    Db::rollback();
                    return $this->fail('Theater not found', 404);
                }

                Db::table('theater_movie')->where('theater_code', $theaterId)->delete();
                Db::name('seat')->where('theater_code', $theaterId)->delete();
                Db::name('theater')->where('theater_code', $theaterId)->delete();

                Db::commit();
                return $this->ok(['theater_code' => $theaterId], 'Theater deleted successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete theater', $e);
        }
    }

    private function prepareTheaterData(array $payload)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        $name    = isset($data['theater_name']) ? (string) $data['theater_name'] : '';
        $address = isset($data['address']) ? (string) $data['address'] : '';
        $img     = isset($data['img']) ? (string) $data['img'] : '';
        $amenity = isset($data['amenity']) && $data['amenity'] !== null ? (string) $data['amenity'] : '';
        $reviews = isset($data['reviews']) && $data['reviews'] !== null ? (string) $data['reviews'] : '';
        $dist    = isset($data['distance']) && $data['distance'] !== null ? (string) $data['distance'] : '';
        $codeLbl = isset($data['theater_id']) && $data['theater_id'] !== null ? (string) $data['theater_id'] : '';

        if ($name === '' || $this->textLen($name) > 200) {
            return [null, 'Theater name (1-200 characters) is required'];
        }
        if ($address === '' || $this->textLen($address) > 500) {
            return [null, 'Theater address (1-500 characters) is required'];
        }
        if ($img === '' || $this->textLen($img) > 500) {
            return [null, 'Theater image path or URL (1-500 characters) is required'];
        }
        if ($amenity !== '' && $this->textLen($amenity) > 500) {
            return [null, 'Amenities list must be 500 characters or fewer'];
        }
        if ($reviews !== '' && $this->textLen($reviews) > 50) {
            return [null, 'Reviews label must be 50 characters or fewer'];
        }
        if ($dist !== '' && $this->textLen($dist) > 50) {
            return [null, 'Distance label must be 50 characters or fewer'];
        }
        if ($codeLbl !== '' && $this->textLen($codeLbl) > 100) {
            return [null, 'Theater code label must be 100 characters or fewer'];
        }

        $rawStar = isset($data['star']) && $data['star'] !== null && $data['star'] !== '' ? $data['star'] : 4.8;
        $star    = $this->parseFiniteFloat($rawStar, 0.0, 5.0);
        if ($star === null) {
            return [null, 'Rating must be between 0.0 and 5.0'];
        }

        return [[
            'theater_name' => $name,
            'address'      => $address,
            'amenity'      => $amenity !== '' ? $amenity : null,
            'star'         => round($star, 1),
            'img'          => $img,
            'reviews'      => $reviews !== '' ? $reviews : null,
            'distance'     => $dist !== '' ? $dist : null,
            'theater_id'   => $codeLbl !== '' ? $codeLbl : null,
        ], null];
    }
}