<?php
namespace app\movie\controller;
use app\movie\model\Movies as MoviesModel;
use think\Db;

class Movies
{
    /**
     * Get movie list
     * @return json
     */
    public function getMovieList()
    {
        try {
            $genre = input('genre', 'all');
            $query = Db::name('movies')
                ->field('movie_code, movie_name,star, tag, movie_type, img, times');
                
            if ($genre !== 'all') {
                $query->where('movie_type', $genre);
            }
            
            $movies = $query->select();
            
            return json([
                'success' => true,
                'data' => $movies
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Failed to get movie list: ' . $e->getMessage()
            ]);
        }
    }
    

    public function searchMovies()
    {
        try {
            $keyword = input('keyword');
            $movies = Db::name('movies')
                ->where('movie_name', 'like', "%{$keyword}%")
                ->field('movie_code, movie_name,star, tag,money, movie_type, img, times')
                ->select();
                
            return json([
                'success' => true,
                'data' => $movies
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Search failed: ' . $e->getMessage()
            ]);
        }
    }
    
    /**
     * Get movie details by movieCode
     * @param string $movie_code Movie code
     * @return json
     */
    public function getMovieByCode()
    {
        try {
            $movie_code = input('movie_code');
            if (empty($movie_code)) {
                return json([
                    'success' => false,
                    'message' => 'movie_code parameter cannot be empty'
                ]);
            }
            
            $movie = Db::name('movies')
                ->where('movie_code', $movie_code)
                ->find();
                
            if (!$movie) {
                return json([
                    'success' => false,
                    'message' => 'Movie information not found'
                ]);
            }
            
            return json([
                'success' => true,
                'data' => $movie
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Failed to get movie information: ' . $e->getMessage()
            ]);
        }
    }
}