<?php
namespace app\offer\controller;

use app\common\controller\ApiController;
use think\Db;
use think\facade\Session;

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

            $offers = $query->select();
            if (!empty($offers)) {
                $offerIds = array_values(array_unique(array_column($offers, 'offer_code')));
                $links    = Db::table('movie_offer')
                    ->where('offer_code', 'in', $offerIds)
                    ->field('offer_code, movie_code')
                    ->order('movie_code', 'asc')
                    ->select();

                $movieMap = [];
                foreach ($links as $row) {
                    $oid = (int) $row['offer_code'];
                    $movieMap[$oid][] = (int) $row['movie_code'];
                }
                foreach ($offers as &$item) {
                    $oid = (int) $item['offer_code'];
                    $item['movie_codes'] = $movieMap[$oid] ?? [];
                }
                unset($item);
            }

            return $this->ok($offers);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load offers', $e);
        }
    }

    public function getMoneyByBadge()
    {
        try {
            $code      = $this->strParam('badge') ?: $this->strParam('promo_code');
            $movieCode = $this->idParam('movie_code');
            $date      = $this->strParam('date');
            $userId    = (int) Session::get('user_id', 0);

            [$offer, $error] = $this->validateOfferForBooking($code, $movieCode, $date, $userId);
            if ($error !== null) {
                return $this->fail($error);
            }

            return $this->ok($offer, 'Promo code applied');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to verify promo code', $e);
        }
    }
}