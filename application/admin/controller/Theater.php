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
            $theaters = Db::name('theater')
                ->order('theater_code', 'asc')
                ->select();

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
            return $theater ? $this->ok($theater) : $this->fail('Theater not found', 404);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query theater details', $e);
        }
    }

    public function create()
    {
        try {
            [$data, $error] = $this->prepareTheaterData($this->payload());
            if ($error !== null) {
                return $this->fail($error);
            }

            $now   = date('Y-m-d H:i:s');
            $today = date('Y-m-d');
            $data['create_time'] = $now;

            Db::startTrans();
            try {
                $theaterId = (int) Db::name('theater')->insertGetId($data);
                if ($theaterId <= 0) {
                    Db::rollback();
                    return $this->fail('Failed to create theater');
                }

                $movieIds = array_map('intval', Db::name('movies')->column('movie_code'));
                if (!empty($movieIds)) {
                    $schedRows = [];
                    foreach ($movieIds as $mid) {
                        $schedRows[] = [
                            'theater_code'    => $theaterId,
                            'movie_code'      => $mid,
                            'start_date'      => $today,
                            'end_date'        => '2027-12-31',
                            'daily_showtimes' => 3,
                            'created_time'    => $now,
                        ];
                    }
                    Db::table('theater_movie')->insertAll($schedRows);
                }

                Db::commit();
                return $this->ok(['theater_code' => $theaterId], 'Theater created successfully');
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
            $theaterId = $this->idParam('theater_code', $theater_code);
            if ($theaterId <= 0) {
                return $this->fail('Valid theater_code is required');
            }
            if (!Db::name('theater')->where('theater_code', $theaterId)->find()) {
                return $this->fail('Theater not found', 404);
            }

            [$data, $error] = $this->prepareTheaterData($this->payload());
            if ($error !== null) {
                return $this->fail($error);
            }

            $data['update_time'] = date('Y-m-d H:i:s');
            if (Db::name('theater')->where('theater_code', $theaterId)->update($data) === false) {
                return $this->fail('Failed to update theater');
            }

            return $this->ok(['theater_code' => $theaterId], 'Theater updated successfully');
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
            if (!Db::name('theater')->where('theater_code', $theaterId)->find()) {
                return $this->fail('Theater not found', 404);
            }

            Db::startTrans();
            try {
                Db::table('theater_movie')->where('theater_code', $theaterId)->delete();
                Db::name('seat')->where('theater_code', $theaterId)->delete();
                Db::name('theater')->where('theater_code', $theaterId)->delete();
                Db::commit();
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }

            return $this->ok(['theater_code' => $theaterId], 'Theater deleted successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete theater', $e);
        }
    }

    private function prepareTheaterData(array $payload)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        if (empty($data['theater_name']) || $this->textLen($data['theater_name']) > 200) {
            return [null, 'Theater name is required (1-200 characters)'];
        }
        if (empty($data['address']) || $this->textLen($data['address']) > 500) {
            return [null, 'Theater address is required (1-500 characters)'];
        }
        if (empty($data['img']) || !$this->isSafeAssetUrl($data['img'])) {
            return [null, 'A valid theater image path or URL is required'];
        }
        if (array_key_exists('star', $payload) && is_bool($payload['star'])) {
            return [null, 'Rating must be between 0.0 and 5.0'];
        }
        $star = isset($data['star']) && $data['star'] !== '' ? $data['star'] : 4.8;
        if (!is_numeric($star) || (float) $star < 0 || (float) $star > 5) {
            return [null, 'Rating must be between 0.0 and 5.0'];
        }

        $data['star']       = round((float) $star, 1);
        $data['amenity']    = !empty($data['amenity']) ? $this->textSlice($data['amenity'], 500) : null;
        $data['reviews']    = !empty($data['reviews']) ? $this->textSlice($data['reviews'], 50) : null;
        $data['distance']   = !empty($data['distance']) ? $this->textSlice($data['distance'], 50) : null;
        $data['theater_id'] = !empty($data['theater_id']) ? $this->textSlice($data['theater_id'], 100) : null;

        return [$data, null];
    }
}