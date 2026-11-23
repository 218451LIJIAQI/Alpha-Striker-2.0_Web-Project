<?php
namespace app\theater\controller;

use app\common\controller\ApiController;
use think\Db;

class Theater extends ApiController
{
    public function getTheaterList()
    {
        try {
            $keyword   = $this->strParam('address');
            $amenity   = $this->strParam('amenity');
            $movieCode = $this->idParam('movie_code');

            if ($movieCode > 0) {
                $today = date('Y-m-d');
                $query = Db::table('t_theater')
                    ->alias('t')
                    ->join('theater_movie tm', 'tm.theater_code = t.theater_code')
                    ->where('tm.movie_code', $movieCode)
                    ->where(function ($q) use ($today) {
                        $q->whereNull('tm.start_date')->whereOr('tm.start_date', '<=', $today);
                    })
                    ->where(function ($q) use ($today) {
                        $q->whereNull('tm.end_date')->whereOr('tm.end_date', '>=', $today);
                    })
                    ->field('t.theater_code, t.theater_name, t.address, t.amenity, t.star, t.img, t.reviews, t.distance, tm.daily_showtimes')
                    ->order('t.theater_code', 'asc');

                if ($keyword !== '') {
                    $escapedKeyword = $this->escapeLike($keyword);
                    $query->where('t.theater_name|t.address', 'like', "%{$escapedKeyword}%");
                }
                if ($amenity !== '' && strtolower($amenity) !== 'all') {
                    $escapedAmenity = $this->escapeLike($amenity);
                    $query->where('t.amenity', 'like', "%{$escapedAmenity}%");
                }

                return $this->ok($query->select());
            }

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

            $today = date('Y-m-d');
            $theater['movies'] = Db::table('theater_movie')
                ->alias('tm')
                ->join('t_movies m', 'tm.movie_code = m.movie_code')
                ->where('tm.theater_code', $theaterCode)
                ->where(function ($q) use ($today) {
                    $q->whereNull('tm.start_date')->whereOr('tm.start_date', '<=', $today);
                })
                ->where(function ($q) use ($today) {
                    $q->whereNull('tm.end_date')->whereOr('tm.end_date', '>=', $today);
                })
                ->field('m.movie_code, m.movie_name, m.star, m.tag, m.money, m.movie_type, m.img, m.times, tm.daily_showtimes')
                ->order('m.movie_code', 'asc')
                ->select();

            return $this->ok($theater);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load theater details', $e);
        }
    }
}