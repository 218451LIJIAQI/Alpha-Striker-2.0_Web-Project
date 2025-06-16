<?php
namespace app\offer\model;
use think\Model;

class Offer extends Model
{
    /**
     * Get offer list
     * @param string $offer_type Offer type
     * @return array
     */
    public function getOfferList($offer_type = '')
    {
        $query = $this->field('offer_code, offer_title, offer_description, promo_code, offer_validity, img, badge, offer_type');
        
        if (!empty($offer_type)) {
            $query->where('offer_type', $offer_type);
        }
        
        return $query->select();
    }

    /**
     * Get offer amount by badge
     * @param string $badge Offer identifier
     * @return array
     */
    public function getMoneyByBadge($badge)
    {
        return $this->where('promo_code', $badge)
            ->field('money')
            ->find();
    }
}
