<?php
namespace app\offer\controller;

use app\common\controller\ApiController;
use app\offer\model\Offer as OfferModel;

class Offer extends ApiController
{
    /**
     * List active offers, optionally filtered by offer_type.
     */
    public function getOfferList()
    {
        try {
            $params    = $this->payload();
            $offerType = isset($params['offer_type']) ? trim((string) $params['offer_type']) : '';

            $offerModel = new OfferModel();
            $offers     = $offerModel->getOfferList($offerType);

            return $this->ok($offers);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load offers', $e);
        }
    }

    /**
     * Validate a promo code (passed as badge or promo_code) and return its discount amount.
     */
    public function getMoneyByBadge()
    {
        try {
            $params = $this->payload();
            $code   = $params['badge'] ?? ($params['promo_code'] ?? '');
            $code   = strtoupper(trim((string) $code));

            if ($code === '') {
                return $this->fail('Promo code is required');
            }

            $offerModel = new OfferModel();
            $offer      = $offerModel->findByPromoCode($code);

            if (!$offer) {
                return $this->fail('Invalid promo code');
            }

            $validity = trim((string) ($offer['offer_validity'] ?? ''));
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $validity) && $validity < date('Y-m-d')) {
                return $this->fail('This promo code has expired');
            }

            return $this->ok($offer, 'Promo code applied');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to verify promo code', $e);
        }
    }
}