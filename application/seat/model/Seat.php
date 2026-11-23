<?php
namespace app\seat\model;

use think\Model;

class Seat extends Model
{
    protected $name = 'seat';
    protected $pk   = 'seat_code';

    public function movie()
    {
        return $this->belongsTo('app\\movie\\model\\Movies', 'movie_code', 'movie_code');
    }

    public function user()
    {
        return $this->belongsTo('app\\user\\model\\User', 'user_code', 'user_code')
            ->field('user_code, user_name, email');
    }

    public function theater()
    {
        return $this->belongsTo('app\\theater\\model\\Theater', 'theater_code', 'theater_code')
            ->field('theater_code, theater_name, address');
    }
}