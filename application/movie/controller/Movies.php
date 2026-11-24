<?php
namespace app\movie\controller;

use app\common\controller\ApiController;
use think\Db;

class Movies extends ApiController
{
    private const PUBLIC_FIELDS = 'movie_code, movie_name, star, tag, money, movie_type, img, times';

    public function getMovieList()
    {
        try {
            $genre = $this->strParam('genre', 'all');
            $query = Db::name('movies')
                ->field(self::PUBLIC_FIELDS)
                ->order('movie_code', 'asc');

            if ($genre !== '' && strtolower($genre) !== 'all') {
                $query->where('movie_type', $genre);
            }

            $rows = $query->select();
            [$paged, $meta] = $this->paginateAndSort(
                $rows,
                [
                    'id_asc'      => function ($a, $b) { return ((int) $a['movie_code']) <=> ((int) $b['movie_code']); },
                    'title_asc'   => function ($a, $b) { return strcasecmp((string) $a['movie_name'], (string) $b['movie_name']); },
                    'rating_desc' => function ($a, $b) { return ((float) $b['star']) <=> ((float) $a['star']); },
                    'price_asc'   => function ($a, $b) { return ((float) $a['money']) <=> ((float) $b['money']); },
                ],
                'id_asc'
            );

            return $this->ok($paged, 'OK', ['meta' => $meta]);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load movie list', $e);
        }
    }

    public function searchMovies()
    {
        try {
            $keyword = $this->strParam('keyword');
            $query   = Db::name('movies')
                ->field(self::PUBLIC_FIELDS)
                ->order('movie_code', 'asc');

            if ($keyword !== '') {
                $escaped = $this->escapeLike($keyword);
                $query->where('movie_name|movie_type|tag', 'like', "%{$escaped}%");
            }

            $rows = $query->select();
            [$paged, $meta] = $this->paginateAndSort(
                $rows,
                [
                    'id_asc'      => function ($a, $b) { return ((int) $a['movie_code']) <=> ((int) $b['movie_code']); },
                    'title_asc'   => function ($a, $b) { return strcasecmp((string) $a['movie_name'], (string) $b['movie_name']); },
                    'rating_desc' => function ($a, $b) { return ((float) $b['star']) <=> ((float) $a['star']); },
                ],
                'id_asc'
            );

            return $this->ok($paged, 'OK', ['meta' => $meta]);
        } catch (\Throwable $e) {
            return $this->serverError('Movie search failed', $e);
        }
    }

    public function getMovieByCode($movie_code = '')
    {
        try {
            $movieId = $this->idParam('movie_code', $movie_code);
            if ($movieId <= 0) {
                return $this->fail('Valid movie_code parameter is required');
            }

            $movie = Db::name('movies')
                ->field(self::PUBLIC_FIELDS)
                ->where('movie_code', $movieId)
                ->find();

            if (!$movie) {
                return $this->fail('Movie not found', 404);
            }

            $targetDate   = $this->targetDateParam('date');
            $schedQuery   = Db::table('theater_movie')->where('movie_code', $movieId);
            $theaterCodes = $this->applyDateWindow($schedQuery, 'start_date', 'end_date', $targetDate)
                ->order('theater_code', 'asc')
                ->column('theater_code');

            $movie['theater_codes'] = array_map('intval', $theaterCodes ?: []);

            return $this->ok($movie);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load movie details', $e);
        }
    }
}