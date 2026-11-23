<?php
namespace app\user\model;

use think\Model;

class User extends Model
{
    protected $name   = 'user';
    protected $pk     = 'user_code';
    protected $hidden = ['login_pwd'];
}
