<?php
namespace app\theater\controller;

use app\common\controller\ApiController;
use think\Db;

class Theater extends ApiController
{
    public function getTheaterList()
    {
        try {
            $keyword    = $this->strParam('address');
            $amenity    = $this->strParam('amenity');
            $movieCode  = $this->idParam('movie_code');
            $targetDate = $this->targetDateParam('date');

            $query = Db::name('theater')
                ->field('theater_code, theater_name, address, amenity, star, img, reviews, distance')
                ->order('theater_code', 'asc');

            if ($movieCode > 0) {
                $schedQuery        = Db::table('theater_movie')->where('movie_code', $movieCode);
                $scheduledTheaters = $this->applyDateWindow($schedQuery, 'start_date', 'end_date', $targetDate)
                    ->column('theater_code');

                if (empty($scheduledTheaters)) {
                    [$empty, $meta] = $this->paginateAndSort([], ['id_asc' => null], 'id_asc');
                    return $this->ok($empty, 'OK', ['meta' => $meta]);
                }
                $query->where('theater_code', 'in', $scheduledTheaters);
            }

            if ($keyword !== '') {
                $escapedKeyword = $this->escapeLike($keyword);
                $query->where('theater_name|address', 'like', "%{$escapedKeyword}%");
            }

            if ($amenity !== '' && strtolower($amenity) !== 'all') {
                $escapedAmenity = $this->escapeLike($amenity);
                $query->where('amenity', 'like', "%{$escapedAmenity}%");
            }

            $rows = $query->select();
            [$paged, $meta] = $this->paginateAndSort(
                $rows,
                [
                    'id_asc'      => function ($a, $b) { return ((int) $a['theater_code']) <=> ((int) $b['theater_code']); },
                    'name_asc'    => function ($a, $b) { return strcasecmp((string) $a['theater_name'], (string) $b['theater_name']); },
                    'rating_desc' => function ($a, $b) { return ((float) $b['star']) <=> ((float) $a['star']); },
                ],
                'id_asc'
            );

            return $this->ok($paged, 'OK', ['meta' => $meta]);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load theater list', $e);
        }
    }

    public function getTheaterDetails()
    {
        try {
            $theaterCode = $this->idParam('theater_code');
            if ($theaterCode <= 0) {
                return $this->fail('Valid theater_code parameter is required');
            }

            $theater = Db::name('theater')->where('theater_code', $theaterCode)->find();
            if (!$theater) {
                return $this->fail('Theater does not exist', 404);
            }

            $targetDate = $this->targetDateParam('date');
            $movieQuery = Db::table('theater_movie')
                ->alias('tm')
                ->join('t_movies m', 'tm.movie_code = m.movie_code')
                ->where('tm.theater_code', $theaterCode);

            $theater['movies'] = $this->applyDateWindow($movieQuery, 'tm.start_date', 'tm.end_date', $targetDate)
                ->field('m.movie_code, m.movie_name, m.star, m.tag, m.money, m.movie_type, m.img, m.times, tm.daily_showtimes')
                ->order('m.movie_code', 'asc')
                ->select();

            return $this->ok($theater);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load theater details', $e);
        }
    }
}