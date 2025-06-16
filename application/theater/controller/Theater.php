<?php
namespace app\theater\controller;
use app\theater\model\Theater as TheaterModel;
use think\Db;

class Theater
{
    /**
     * Get theater list
     * @param string $address Address keyword
     * @param string $amenity Amenity keyword
     * @return json
     */
    public function getTheaterList()
    {
        try {
            $address = input('address', '');
            $amenity = input('amenity', '');
            
            $query = Db::name('theater')
                ->field('theater_code, theater_name, address, amenity, star, img, reviews');
                
            if (!empty($address)) {
                $query->where('address', 'like', "%{$address}%");
            }
            
            if (!empty($amenity)) {
                $query->where('amenity', 'like', "%{$amenity}%");
            }
            
            $theaters = $query->select();
            
            return json([
                'success' => true,
                'data' => $theaters
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Failed to get theater list: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * Get theater details
     * @param string $theater_code Theater code
     * @return json
     */
    public function getTheaterDetails()
    {
        try {
            $theater_code = input('theater_code');
            
            $theater = Db::name('theater')
                ->where('theater_code', $theater_code)
                ->find();
                
            if (!$theater) {
                return json([
                    'success' => false,
                    'message' => 'Theater does not exist'
                ]);
            }
            
            return json([
                'success' => true,
                'data' => $theater
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Failed to get theater details: ' . $e->getMessage()
            ]);
        }
    }
}