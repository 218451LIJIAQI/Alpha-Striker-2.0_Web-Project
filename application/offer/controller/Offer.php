<?php
namespace app\offer\controller;

use app\common\controller\ApiController;
use think\Db;

class Offer extends ApiController
{
    public function getOfferList()
    {
        try {
            $offerType = $this->strParam('offer_type');
            $query     = Db::name('offer')
                ->field('offer_code, offer_title, offer_description, promo_code, offer_validity, img, badge, money, offer_type')
                ->order('offer_code', 'asc');

            if ($offerType !== '' && strtolower($offerType) !== 'all') {
                $query->where('offer_type', $offerType);
            }

            return $this->ok($query->select());
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load offers', $e);
        }
    }

    public function getMoneyByBadge()
    {
        try {
            $code = strtoupper($this->strParam('badge') ?: $this->strParam('promo_code'));
            if ($code === '') {
                return $this->fail('Promo code is required');
            }

            $offer = Db::name('offer')
                ->field('offer_code, offer_title, promo_code, offer_validity, badge, money')
                ->where('promo_code', $code)
                ->find();

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