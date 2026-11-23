<?php
namespace app\offer\model;

use think\Model;

class Offer extends Model
{
    protected $name = 'offer';
    protected $pk   = 'offer_code';

    /**
     * List promotional offers, optionally filtered by offer_type.
     *
     * @param string $offerType
     * @return array
     */
    public function getOfferList($offerType = '')
    {
        $query = $this->field(
            'offer_code, offer_title, offer_description, promo_code, offer_validity, img, badge, money, offer_type'
        )->order('offer_code', 'asc');

        $offerType = trim((string) $offerType);
        if ($offerType !== '' && strtolower($offerType) !== 'all') {
            $query->where('offer_type', $offerType);
        }

        return $query->select();
    }

    /**
     * Find a promotional offer by its promo code (case-insensitive normalized code).
     *
     * @param string $promoCode
     * @return array|null
     */
    public function findByPromoCode($promoCode)
    {
        $normalized = strtoupper(trim((string) $promoCode));
        if ($normalized === '') {
            return null;
        }

        return $this->where('promo_code', $normalized)
            ->field('offer_code, offer_title, promo_code, offer_validity, badge, money')
            ->find();
    }
}
