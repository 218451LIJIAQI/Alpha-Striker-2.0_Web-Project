<?php
namespace app\seat\model;
use think\Model;

class Seat extends Model
{
    protected $name = 'seat';
    
    public function movie()
    {
        return $this->belongsTo('app\movie\model\Movies', 'movie_code', 'movie_code');
    }
    
    public function user()
    {
        return $this->belongsTo('app\user\model\User', 'user_code', 'user_code');
    }
}