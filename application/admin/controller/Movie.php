<?php
namespace app\admin\controller;
use app\movie\model\Movies as MovieModel;

class Movie
{
    public function index()
    {
        $model = new MovieModel();
        $movies = $model->select();
        return json(['success' => true, 'data' => $movies]);
    }

    
    
    public function create()
    {
        $data = input('post.');
        $model = new MovieModel();
        $result = $model->save($data);
        return json(['success' => $result]);
    }
    
    public function update($movie_code)
    {
        $data = input('post.');
        $model = new MovieModel();
        $result = $model->save($data, ['movie_code' => $movie_code]);
        return json(['success' => $result]);
    }
    
    public function delete($movie_code)
    {
        $model = new MovieModel();
        $result = $model->where('movie_code', $movie_code)->delete();
        return json(['success' => $result]);
    }
    
    /**
     * Query movie information by movie_code
     * @param string $movie_code Movie code
     * @return json
     */
    public function getMovieByCode($movie_code = '')
    {
        try {
            if (empty($movie_code)) {
                $movie_code = input('movie_code');
            }
            
            if (empty($movie_code)) {
                return json([
                    'success' => false,
                    'message' => 'movie_code parameter cannot be empty'
                ]);
            }
            
            $model = new MovieModel();
            $movie = $model->where('movie_code', $movie_code)->find();
            
            if ($movie) {
                return json([
                    'success' => true,
                    'data' => $movie
                ]);
            } else {
                return json([
                    'success' => false,
                    'message' => 'Movie information not found'
                ]);
            }
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Query failed: ' . $e->getMessage()
            ]);
        }
    }
}