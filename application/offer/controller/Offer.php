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
            $offerType     = $this->strParam('offer_type');
            $movieCode     = $this->idParam('movie_code');
            $sessionUserId = (int) Session::get('user_id', 0);
            $today         = date('Y-m-d');

            $query = Db::name('offer')
                ->field('offer_code, offer_title, offer_description, promo_code, offer_validity, img, badge, money, offer_type, user_code')
                ->order('offer_code', 'asc');

            if ($sessionUserId > 0) {
                $query->where(function ($q) use ($sessionUserId) {
                    $q->whereNull('user_code')->whereOr('user_code', $sessionUserId);
                });
            } else {
                $query->whereNull('user_code');
            }

            if ($offerType !== '' && strtolower($offerType) !== 'all') {
                $query->where('offer_type', $offerType);
            }

            $offers = $query->select();
            if (empty($offers)) {
                return $this->ok([]);
            }

            $offerIds  = array_values(array_unique(array_column($offers, 'offer_code')));
            $linkQuery = Db::table('movie_offer')->where('offer_code', 'in', $offerIds);
            $linkRows  = $this->applyDateWindow($linkQuery, 'valid_from', 'valid_to', $today)->select();
            $movieMap  = [];
            foreach ($linkRows as $lr) {
                $oid = (int) $lr['offer_code'];
                $movieMap[$oid][] = (int) $lr['movie_code'];
            }

            $filtered = [];
            foreach ($offers as $offer) {
                $validity = trim((string) ($offer['offer_validity'] ?? ''));
                if ($this->isValidIsoDate($validity) && $validity < $today) {
                    continue;
                }

                $oid          = (int) $offer['offer_code'];
                $linkedMovies = $movieMap[$oid] ?? [];
                sort($linkedMovies);
                $offer['movie_codes']  = $linkedMovies;
                $offer['is_exclusive'] = !empty($offer['user_code']);
                unset($offer['user_code']);

                if ($movieCode > 0 && !in_array($movieCode, $linkedMovies, true)) {
                    continue;
                }
                $filtered[] = $offer;
            }

            return $this->ok($filtered);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to load offers', $e);
        }
    }

    public function getMoneyByBadge()
    {
        try {
            $code          = strtoupper($this->strParam('badge') ?: $this->strParam('promo_code'));
            $movieCode     = $this->idParam('movie_code');
            $seatCount     = $this->idParam('seat_count');
            $date          = $this->strParam('date');
            $sessionUserId = (int) Session::get('user_id', 0);

            $validation = $this->validatePromoForContext($code, $movieCode, $sessionUserId, $date);
            if (!$validation['valid']) {
                return $this->fail($validation['message'], $validation['status']);
            }

            $offer = $validation['offer'];
            if ($movieCode > 0 && $seatCount > 0) {
                $movie = Db::name('movies')->field('money')->where('movie_code', $movieCode)->find();
                if ($movie) {
                    $offer['pricing'] = $this->calculatePricing((float) $movie['money'], $seatCount, (float) $offer['money']);
                }
            }

            return $this->ok($offer, 'Promo code applied');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to verify promo code', $e);
        }
    }
}