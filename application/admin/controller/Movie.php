<?php
namespace app\admin\controller;

use app\movie\model\Movies as MovieModel;

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
            $model  = new MovieModel();
            $movies = $model->order('movie_code', 'asc')->select();
            return $this->ok($movies);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query movies', $e);
        }
    }

    public function getMovieByCode($movie_code = '')
    {
        try {
            $payload = $this->payload();
            $movieId = (int) ($movie_code !== '' ? $movie_code : ($payload['movie_code'] ?? 0));

            if ($movieId <= 0) {
                return $this->fail('Valid movie_code is required');
            }

            $model = new MovieModel();
            $movie = $model->where('movie_code', $movieId)->find();
            if (!$movie) {
                return $this->fail('Movie not found', 404);
            }

            return $this->ok($movie);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query movie details', $e);
        }
    }

    public function create()
    {
        try {
            $data = $this->pickAllowed($this->payload(), self::ALLOWED_FIELDS);

            $validationError = $this->validateMoviePayload($data);
            if ($validationError !== null) {
                return $this->fail($validationError);
            }

            $data['tag']         = isset($data['tag']) && $data['tag'] !== '' ? $data['tag'] : null;
            $data['star']        = round((float) $data['star'], 1);
            $data['money']       = round((float) $data['money'], 2);
            $data['create_time'] = date('Y-m-d H:i:s');

            $model = new MovieModel();
            if (!$model->save($data)) {
                return $this->fail('Failed to create movie');
            }

            return $this->ok(['movie_code' => (int) $model->movie_code], 'Movie created successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to create movie', $e);
        }
    }

    public function update($movie_code = '')
    {
        try {
            $payload = $this->payload();
            $movieId = (int) ($movie_code !== '' ? $movie_code : ($payload['movie_code'] ?? 0));

            if ($movieId <= 0) {
                return $this->fail('Valid movie_code is required');
            }

            $model = new MovieModel();
            if (!$model->where('movie_code', $movieId)->find()) {
                return $this->fail('Movie not found', 404);
            }

            $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);
            $validationError = $this->validateMoviePayload($data);
            if ($validationError !== null) {
                return $this->fail($validationError);
            }

            $data['tag']         = isset($data['tag']) && $data['tag'] !== '' ? $data['tag'] : null;
            $data['star']        = round((float) $data['star'], 1);
            $data['money']       = round((float) $data['money'], 2);
            $data['update_time'] = date('Y-m-d H:i:s');

            $saved = $model->save($data, ['movie_code' => $movieId]);
            if ($saved === false) {
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
            $payload = $this->payload();
            $movieId = (int) ($movie_code !== '' ? $movie_code : ($payload['movie_code'] ?? 0));

            if ($movieId <= 0) {
                return $this->fail('Valid movie_code is required');
            }

            $model   = new MovieModel();
            $deleted = $model->where('movie_code', $movieId)->delete();
            if (!$deleted) {
                return $this->fail('Movie not found', 404);
            }

            return $this->ok(['movie_code' => $movieId], 'Movie deleted successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete movie', $e);
        }
    }

    private function validateMoviePayload(array $data)
    {
        if (empty($data['movie_name'])) {
            return 'Movie title is required';
        }
        if (empty($data['movie_type'])) {
            return 'Movie genre is required';
        }
        if (empty($data['img'])) {
            return 'Poster image path or URL is required';
        }
        if (empty($data['times'])) {
            return 'Movie duration is required';
        }
        if (!isset($data['star']) || !is_numeric($data['star']) || (float) $data['star'] < 0 || (float) $data['star'] > 5) {
            return 'Rating must be between 0.0 and 5.0';
        }
        if (!isset($data['money']) || !is_numeric($data['money']) || (float) $data['money'] < 0) {
            return 'Ticket price must be a non-negative number';
        }
        return null;
    }
}