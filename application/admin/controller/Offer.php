<?php
namespace app\admin\controller;

use think\Db;

class Offer extends BaseAdmin
{
    private const ALLOWED_FIELDS = [
        'offer_title',
        'offer_type',
        'offer_description',
        'promo_code',
        'offer_validity',
        'img',
        'badge',
        'money',
        'user_code',
    ];

    public function index()
    {
        try {
            $offers = Db::name('offer')->order('offer_code', 'asc')->select();
            if (empty($offers)) {
                return $this->ok([]);
            }

            $links    = Db::table('movie_offer')->select();
            $movieMap = [];
            foreach ($links as $row) {
                $oid = (int) $row['offer_code'];
                $movieMap[$oid][] = (int) $row['movie_code'];
            }

            $userIds = array_values(array_unique(array_filter(array_column($offers, 'user_code'))));
            $users   = !empty($userIds)
                ? Db::name('user')->where('user_code', 'in', $userIds)->column('user_code, user_name, email', 'user_code')
                : [];

            foreach ($offers as &$o) {
                $oid              = (int) $o['offer_code'];
                $mCodes           = $movieMap[$oid] ?? [];
                sort($mCodes);
                $o['movie_codes'] = $mCodes;
                $o['movie_count'] = count($mCodes);
                $uCode            = !empty($o['user_code']) ? (int) $o['user_code'] : 0;
                $o['owner']       = $uCode > 0 ? ($users[$uCode] ?? null) : null;
            }
            unset($o);

            return $this->ok($offers);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query offers', $e);
        }
    }

    public function getOfferByCode($offer_code = '')
    {
        try {
            $offerId = $this->idParam('offer_code', $offer_code);
            if ($offerId <= 0) {
                return $this->fail('Valid offer_code is required');
            }

            $offer = Db::name('offer')->where('offer_code', $offerId)->find();
            if (!$offer) {
                return $this->fail('Offer not found', 404);
            }

            $mCodes = Db::table('movie_offer')
                ->where('offer_code', $offerId)
                ->order('movie_code', 'asc')
                ->column('movie_code');
            $offer['movie_codes'] = array_map('intval', $mCodes ?: []);

            return $this->ok($offer);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query offer details', $e);
        }
    }

    public function create()
    {
        try {
            $payload        = $this->payload();
            [$data, $error] = $this->prepareOfferData($payload, 0);
            if ($error !== null) {
                return $this->fail($error);
            }

            $movieCodes = array_key_exists('movie_codes', $payload)
                ? $this->resolveValidIds('movies', 'movie_code', $payload['movie_codes'])
                : array_map('intval', Db::name('movies')->order('movie_code', 'asc')->column('movie_code') ?: []);

            Db::startTrans();
            try {
                $data['create_time'] = date('Y-m-d H:i:s');
                $offerId             = (int) Db::name('offer')->insertGetId($data);
                if ($offerId <= 0) {
                    Db::rollback();
                    return $this->fail('Failed to create offer');
                }

                $this->syncOfferMovies($offerId, $movieCodes, $data['offer_validity']);
                Db::commit();

                return $this->ok([
                    'offer_code'  => $offerId,
                    'movie_codes' => $movieCodes,
                ], 'Offer created successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                if ($this->isUniqueConflict($txErr)) {
                    return $this->fail('Promo code is already in use by another offer', 409);
                }
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to create offer', $e);
        }
    }

    public function update($offer_code = '')
    {
        try {
            $payload = $this->payload();
            $offerId = $this->idParam('offer_code', $offer_code);
            if ($offerId <= 0) {
                return $this->fail('Valid offer_code is required');
            }

            if (!Db::name('offer')->where('offer_code', $offerId)->find()) {
                return $this->fail('Offer not found', 404);
            }

            [$data, $error] = $this->prepareOfferData($payload, $offerId);
            if ($error !== null) {
                return $this->fail($error);
            }

            $movieCodes = array_key_exists('movie_codes', $payload)
                ? $this->resolveValidIds('movies', 'movie_code', $payload['movie_codes'])
                : null;

            Db::startTrans();
            try {
                $data['update_time'] = date('Y-m-d H:i:s');
                if (Db::name('offer')->where('offer_code', $offerId)->update($data) === false) {
                    Db::rollback();
                    return $this->fail('Failed to update offer');
                }

                if ($movieCodes !== null) {
                    $this->syncOfferMovies($offerId, $movieCodes, $data['offer_validity']);
                } else {
                    Db::table('movie_offer')
                        ->where('offer_code', $offerId)
                        ->update(['valid_to' => $data['offer_validity']]);
                }

                Db::commit();
                return $this->ok(['offer_code' => $offerId], 'Offer updated successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                if ($this->isUniqueConflict($txErr)) {
                    return $this->fail('Promo code is already in use by another offer', 409);
                }
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to update offer', $e);
        }
    }

    public function delete($offer_code = '')
    {
        try {
            $offerId = $this->idParam('offer_code', $offer_code);
            if ($offerId <= 0) {
                return $this->fail('Valid offer_code is required');
            }

            Db::startTrans();
            try {
                if (!Db::name('offer')->where('offer_code', $offerId)->find()) {
                    Db::rollback();
                    return $this->fail('Offer not found', 404);
                }

                Db::table('movie_offer')->where('offer_code', $offerId)->delete();
                Db::name('offer')->where('offer_code', $offerId)->delete();

                Db::commit();
                return $this->ok(['offer_code' => $offerId], 'Offer deleted successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete offer', $e);
        }
    }

    private function syncOfferMovies($offerId, array $movieCodes, $validUntil)
    {
        Db::table('movie_offer')->where('offer_code', $offerId)->delete();
        if (empty($movieCodes)) {
            return;
        }

        $now  = date('Y-m-d H:i:s');
        $rows = [];
        foreach ($movieCodes as $mid) {
            $rows[] = [
                'movie_code'       => (int) $mid,
                'offer_code'       => (int) $offerId,
                'discount_percent' => 0.00,
                'valid_from'       => '2026-01-01',
                'valid_to'         => $validUntil,
                'created_time'     => $now,
            ];
        }
        Db::table('movie_offer')->insertAll($rows);
    }

    private function prepareOfferData(array $payload, $excludeOfferId)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        if (empty($data['offer_title']) || $this->textLen($data['offer_title']) > 200) {
            return [null, 'Offer title (1-200 characters) is required'];
        }
        if (empty($data['offer_type']) || $this->textLen($data['offer_type']) > 100) {
            return [null, 'Offer category (1-100 characters) is required'];
        }
        if (empty($data['offer_description']) || $this->textLen($data['offer_description']) > 500) {
            return [null, 'Offer description (1-500 characters) is required'];
        }
        if (empty($data['promo_code']) || $this->textLen($data['promo_code']) > 100) {
            return [null, 'Promo code (1-100 characters) is required'];
        }
        if (empty($data['offer_validity']) || !$this->isValidIsoDate($data['offer_validity'])) {
            return [null, 'Validity date must use YYYY-MM-DD format'];
        }
        if (empty($data['img']) || $this->textLen($data['img']) > 500) {
            return [null, 'Offer image path or URL (1-500 characters) is required'];
        }
        if (isset($data['badge']) && $this->textLen($data['badge']) > 50) {
            return [null, 'Highlight badge must be 50 characters or fewer'];
        }
        if (!isset($data['money']) || !is_numeric($data['money']) || !is_finite((float) $data['money']) || (float) $data['money'] < 0) {
            return [null, 'Discount amount must be a non-negative number'];
        }

        $ownerUserCode = null;
        if (isset($data['user_code']) && $data['user_code'] !== '' && (int) $data['user_code'] > 0) {
            $candidateUid = (int) $data['user_code'];
            if (!Db::name('user')->where('user_code', $candidateUid)->find()) {
                return [null, 'Selected exclusive member account does not exist'];
            }
            $ownerUserCode = $candidateUid;
        }

        $promoCode  = strtoupper($data['promo_code']);
        $promoQuery = Db::name('offer')->where('promo_code', $promoCode);
        if ($excludeOfferId > 0) {
            $promoQuery->where('offer_code', '<>', $excludeOfferId);
        }
        if ($promoQuery->find()) {
            return [null, 'Promo code is already in use by another offer'];
        }

        $data['promo_code'] = $promoCode;
        $data['badge']      = isset($data['badge']) && $data['badge'] !== '' ? $data['badge'] : null;
        $data['money']      = round((float) $data['money'], 2);
        $data['user_code']  = $ownerUserCode;

        return [$data, null];
    }
}