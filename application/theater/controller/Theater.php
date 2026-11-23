<?php
namespace app\theater\controller;

use app\common\controller\ApiController;
use think\Db;

class Theater extends ApiController
{
    /**
     * List theaters with optional search keyword (matching name or address) and amenity filter.
     */
    public function getTheaterList()
    {
        try {
            $params  = $this->payload();
            $keyword = isset($params['address']) ? trim((string) $params['address']) : '';
            $amenity = isset($params['amenity']) ? trim((string) $params['amenity']) : '';

            $query = Db::name('theater')
                ->field('theater_code, theater_name, address, amenity, star, img, reviews, distance')
                ->order('theater_code', 'asc');

            if ($keyword !== '') {
                $escapedKeyword = $this->escapeLike($keyword);
                $query->where('theater_name|address', 'like', "%{$escapedKeyword}%");
            }

            if ($amenity !== '' && strtolower($amenity) !== 'all') {
                $escapedAmenity = $this->escapeLike($amenity);
                $query->where('amenity', 'like', "%{$escapedAmenity}%");
            }

            return $this->ok($query->select());
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load theater list', $e);
        }
    }

    /**
     * Get single theater details along with its active screening movies from theater_movie.
     */
    public function getTheaterDetails()
    {
        try {
            $params      = $this->payload();
            $theaterCode = isset($params['theater_code']) ? (int) $params['theater_code'] : 0;

            if ($theaterCode <= 0) {
                return $this->fail('Valid theater_code parameter is required');
            }

            $theater = Db::name('theater')
                ->where('theater_code', $theaterCode)
                ->find();

            if (!$theater) {
                return $this->fail('Theater does not exist', 404);
            }

            $today  = date('Y-m-d');
            $movies = Db::table('theater_movie')
                ->alias('tm')
                ->join('t_movies m', 'tm.movie_code = m.movie_code')
                ->where('tm.theater_code', $theaterCode)
                ->where(function ($q) use ($today) {
                    $q->whereNull('tm.end_date')->whereOr('tm.end_date', '>=', $today);
                })
                ->field('m.movie_code, m.movie_name, m.star, m.tag, m.money, m.movie_type, m.img, m.times, tm.daily_showtimes')
                ->order('m.movie_code', 'asc')
                ->select();

            $theater['movies'] = $movies;

            return $this->ok($theater);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load theater details', $e);
        }
    }
}