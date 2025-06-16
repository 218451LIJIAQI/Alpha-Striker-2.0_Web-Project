<?php
namespace app\movie\controller;
use think\Db;
use app\seat\model\Seat as SeatModel;

class Seat
{
    /**
     * Query seat number list by movie code, date and time
     * @param int $movie_code Movie code
     * @param string $date Date
     * @param string $time Time
     * @return json
     */
    public function getSeatList()
    {
        try {
            $movie_code = input('movie_code');
            $date = input('date');
            $time = input('time');
            
                    if (empty($movie_code) || empty($date) || empty($time)) {
            return json([
                'success' => false,
                'message' => 'Parameters cannot be empty'
            ]);
        }
            
            $seats = Db::name('seat')
                ->where('movie_code', $movie_code)
                ->where('date', $date)
                ->where('time', $time)
                ->field('seat_num')
                ->select();
                
            return json([
                'success' => true,
                'data' => $seats
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Query failed: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * Save seat information
     * @param int $movie_code Movie code
     * @param string $date Date
     * @param string $time Time
     * @param array $seat_nums Seat number array
     * @param int $user_code User code
     * @return json
     */
    public function saveSeats()
    {
        try {
            $data = input('post.');
            
            if (empty($data['movie_code']) || empty($data['date']) || 
                empty($data['time']) || empty($data['seat_nums'])) {
                return json([
                    'success' => false,
                    'message' => 'Parameters cannot be empty'
                ]);
            }
            
            $seatData = [];
            $seatNums = is_array($data['seat_nums']) ? $data['seat_nums'] : explode(',', $data['seat_nums']);
            
            foreach ($seatNums as $seatNum) {
                $seatData[] = [
                    'movie_code' => $data['movie_code'],
                    'date' => $data['date'],
                    'time' => $data['time'],
                    'seat_num' => trim($seatNum),
                    'user_code' => $data['user_code'] ?? 0,
                    'create_time' => date('Y-m-d H:i:s')
                ];
            }
            
            $result = Db::name('seat')->insertAll($seatData);
            
            return json([
                'success' => true,
                'data' => $result
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Save failed: ' . $e->getMessage()
            ]);
        }
    }


    /**
     * Query seats by user code
     * @param int $user_code User code
     * @return json
     */
    public function getSeatListByUserCode()
    {
        try {
            $user_code = input('user_code');
            
            if (empty($user_code)) {
                return json([
                    'success' => false,
                    'message' => 'Parameters cannot be empty'
                ]);
            }
            
            // Query seat information
            $seats = Db::name('seat')
                ->where('user_code', $user_code)
                ->field('date,time,movie_code,seat_num,seat_code')
                ->select();
                
            // Query movie information for each seat
            $movieCodes = array_column($seats, 'movie_code');
            $movies = Db::name('movies')
                ->where('movie_code', 'in', array_unique($movieCodes))
                ->column('*', 'movie_code');
                
            // Merge movie information into seat data
            foreach ($seats as &$seat) {
                $seat['movie_info'] = $movies[$seat['movie_code']] ?? null;
            }
                
            return json([
                'success' => true,
                'data' => $seats
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Query failed: ' . $e->getMessage()
            ]);
        }
    }

    public function delete($seat_code)
    {
        $model = new SeatModel();
        $result = $model->where('seat_code', $seat_code)->delete();
        return json(['success' => $result]);
    }

    
}