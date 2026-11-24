<?php
namespace app\offer\controller;

use app\common\controller\ApiController;
use think\Db;

class Offer extends ApiController
{
    public function getOfferList()
    {
        try {
            $offerType     = $this->strParam('offer_type');
            $movieCode     = $this->idParam('movie_code');
            $sessionUserId = $this->resolveActiveSessionUserId();
            $today         = date('Y-m-d');
            $targetDate    = $this->targetDateParam('date');

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
                [$empty, $meta] = $this->paginateAndSort([], ['id_asc' => null], 'id_asc');
                return $this->ok($empty, 'OK', ['meta' => $meta]);
            }

            $offerIds  = array_values(array_unique(array_column($offers, 'offer_code')));
            $linkQuery = Db::table('movie_offer')->where('offer_code', 'in', $offerIds);
            $linkRows  = $this->applyDateWindow($linkQuery, 'valid_from', 'valid_to', $targetDate)->select();
            $movieMap  = [];
            foreach ($linkRows as $lr) {
                $oid = (int) $lr['offer_code'];
                $movieMap[$oid][] = (int) $lr['movie_code'];
            }

            $filtered = [];
            foreach ($offers as $offer) {
                $validity = trim((string) ($offer['offer_validity'] ?? ''));
                if ($this->isValidIsoDate($validity) && ($validity < $today || $validity < $targetDate)) {
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

            [$paged, $meta] = $this->paginateAndSort(
                $filtered,
                [
                    'id_asc'        => function ($a, $b) { return ((int) $a['offer_code']) <=> ((int) $b['offer_code']); },
                    'discount_desc' => function ($a, $b) { return ((float) $b['money']) <=> ((float) $a['money']); },
                    'validity_asc'  => function ($a, $b) { return strcmp((string) ($a['offer_validity'] ?? ''), (string) ($b['offer_validity'] ?? '')); },
                ],
                'id_asc'
            );

            return $this->ok($paged, 'OK', ['meta' => $meta]);
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
            $sessionUserId = $this->resolveActiveSessionUserId();

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