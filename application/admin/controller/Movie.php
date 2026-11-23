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
            return $movie ? $this->ok($movie) : $this->fail('Movie not found', 404);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query movie details', $e);
        }
    }

    public function create()
    {
        try {
            [$data, $error] = $this->prepareMovieData($this->payload());
            if ($error !== null) {
                return $this->fail($error);
            }

            $data['create_time'] = date('Y-m-d H:i:s');
            $movieId = (int) Db::name('movies')->insertGetId($data);
            if ($movieId <= 0) {
                return $this->fail('Failed to create movie');
            }

            return $this->ok(['movie_code' => $movieId], 'Movie created successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to create movie', $e);
        }
    }

    public function update($movie_code = '')
    {
        try {
            $movieId = $this->idParam('movie_code', $movie_code);
            if ($movieId <= 0) {
                return $this->fail('Valid movie_code is required');
            }

            if (!Db::name('movies')->where('movie_code', $movieId)->find()) {
                return $this->fail('Movie not found', 404);
            }

            [$data, $error] = $this->prepareMovieData($this->payload());
            if ($error !== null) {
                return $this->fail($error);
            }

            $data['update_time'] = date('Y-m-d H:i:s');
            if (Db::name('movies')->where('movie_code', $movieId)->update($data) === false) {
                return $this->fail('Failed to update movie');
            }

            return $this->ok(['movie_code' => $movieId], 'Movie updated successfully');
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

            if (!Db::name('movies')->where('movie_code', $movieId)->delete()) {
                return $this->fail('Movie not found', 404);
            }

            return $this->ok(['movie_code' => $movieId], 'Movie deleted successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete movie', $e);
        }
    }

    private function prepareMovieData(array $payload)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        if (empty($data['movie_name'])) {
            return [null, 'Movie title is required'];
        }
        if (empty($data['movie_type'])) {
            return [null, 'Movie genre is required'];
        }
        if (empty($data['img'])) {
            return [null, 'Poster image path or URL is required'];
        }
        if (empty($data['times'])) {
            return [null, 'Movie duration is required'];
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