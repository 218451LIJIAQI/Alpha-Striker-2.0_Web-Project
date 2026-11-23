<?php
namespace app\movie\controller;

use app\common\controller\ApiController;
use think\Db;

class Movies extends ApiController
{
    private const PUBLIC_FIELDS = 'movie_code, movie_name, star, tag, money, movie_type, img, times';

    /**
     * List movies with optional genre filter.
     */
    public function getMovieList()
    {
        try {
            $params = $this->payload();
            $genre  = isset($params['genre']) ? trim((string) $params['genre']) : 'all';

            $query = Db::name('movies')
                ->field(self::PUBLIC_FIELDS)
                ->order('movie_code', 'asc');

            if ($genre !== '' && strtolower($genre) !== 'all') {
                $query->where('movie_type', $genre);
            }

            return $this->ok($query->select());
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load movie list', $e);
        }
    }

    /**
     * Search movies by title, genre, or highlight tag.
     */
    public function searchMovies()
    {
        try {
            $params  = $this->payload();
            $keyword = isset($params['keyword']) ? trim((string) $params['keyword']) : '';

            $query = Db::name('movies')
                ->field(self::PUBLIC_FIELDS)
                ->order('movie_code', 'asc');

            if ($keyword !== '') {
                $escaped = $this->escapeLike($keyword);
                $query->where('movie_name|movie_type|tag', 'like', "%{$escaped}%");
            }

            return $this->ok($query->select());
        } catch (\Throwable $e) {
            return $this->serverError('Movie search failed', $e);
        }
    }

    /**
     * Get single movie details by movie_code.
     *
     * @param string $movie_code
     */
    public function getMovieByCode($movie_code = '')
    {
        try {
            $params    = $this->payload();
            $movieCode = $movie_code !== '' ? $movie_code : ($params['movie_code'] ?? '');
            $movieId   = (int) $movieCode;

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

            return $this->ok($movie);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load movie details', $e);
        }
    }
}