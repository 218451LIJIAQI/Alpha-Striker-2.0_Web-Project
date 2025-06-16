<?php
namespace app\offer\controller;
use app\offer\model\Offer as OfferModel;

class Offer
{
    /**
     * Get offer list
     * @return json
     */
    public function getOfferList()
    {
        try {
            $offer_type = input('offer_type', '');
            // Modified here, instantiate model first then call method
            $offerModel = new OfferModel();
            $offers = $offerModel->getOfferList($offer_type);
            
            return json([
                'success' => true,
                'data' => $offers
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Failed to get offer list: ' . $e->getMessage()
            ]);
        }
    }
    
    /**
     * Query money by badge
     * @param string $badge Offer identifier
     * @return json
     */
    public function getMoneyByBadge()
    {
        try {
            $badge = input('badge');
            if (empty($badge)) {
                return json([
                    'success' => false,
                    'message' => 'Badge parameter cannot be empty'
                ]);
            }
            
            $offerModel = new OfferModel();
            $money = $offerModel->getMoneyByBadge($badge);
            
            return json([
                'success' => true,
                'data' => $money
            ]);
            
        } catch (\Exception $e) {
            return json([
                'success' => false,
                'message' => 'Query failed: ' . $e->getMessage()
            ]);
        }
    }
}