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

            $mCodes = Db::table('theater_movie')
                ->where('theater_code', $theaterId)
                ->order('movie_code', 'asc')
                ->column('movie_code');
            $theater['movie_codes'] = array_map('intval', $mCodes ?: []);

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

                if (empty($data['theater_id'])) {
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

            if (!Db::name('theater')->where('theater_code', $theaterId)->find()) {
                return $this->fail('Theater not found', 404);
            }

            [$data, $error] = $this->prepareTheaterData($payload);
            if ($error !== null) {
                return $this->fail($error);
            }
            if (empty($data['theater_id'])) {
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

        if (empty($data['theater_name']) || $this->textLen($data['theater_name']) > 200) {
            return [null, 'Theater name (1-200 characters) is required'];
        }
        if (empty($data['address']) || $this->textLen($data['address']) > 500) {
            return [null, 'Theater address (1-500 characters) is required'];
        }
        if (empty($data['img']) || $this->textLen($data['img']) > 500) {
            return [null, 'Theater image path or URL (1-500 characters) is required'];
        }
        if (isset($data['amenity']) && $this->textLen($data['amenity']) > 500) {
            return [null, 'Amenities list must be 500 characters or fewer'];
        }
        if (isset($data['reviews']) && $this->textLen($data['reviews']) > 50) {
            return [null, 'Reviews label must be 50 characters or fewer'];
        }
        if (isset($data['distance']) && $this->textLen($data['distance']) > 50) {
            return [null, 'Distance label must be 50 characters or fewer'];
        }
        if (isset($data['theater_id']) && $this->textLen($data['theater_id']) > 100) {
            return [null, 'Theater code label must be 100 characters or fewer'];
        }

        $star = isset($data['star']) && $data['star'] !== '' ? $data['star'] : 4.8;
        if (!is_numeric($star) || !is_finite((float) $star) || (float) $star < 0 || (float) $star > 5) {
            return [null, 'Rating must be between 0.0 and 5.0'];
        }

        $data['star']       = round((float) $star, 1);
        $data['amenity']    = isset($data['amenity']) && $data['amenity'] !== '' ? $data['amenity'] : null;
        $data['reviews']    = isset($data['reviews']) && $data['reviews'] !== '' ? $data['reviews'] : null;
        $data['distance']   = isset($data['distance']) && $data['distance'] !== '' ? $data['distance'] : null;
        $data['theater_id'] = isset($data['theater_id']) && $data['theater_id'] !== '' ? $data['theater_id'] : null;

        return [$data, null];
    }
}