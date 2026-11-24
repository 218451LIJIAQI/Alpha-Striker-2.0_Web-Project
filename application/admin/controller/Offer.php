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

            $movieMap = $this->mapRelationIds('movie_offer', 'offer_code', 'movie_code');
            $userIds  = array_values(array_unique(array_filter(array_column($offers, 'user_code'))));
            $users    = !empty($userIds)
                ? Db::name('user')->where('user_code', 'in', $userIds)->column('user_code, user_name, email', 'user_code')
                : [];

            foreach ($offers as &$o) {
                $oid              = (int) $o['offer_code'];
                $mCodes           = $movieMap[$oid] ?? [];
                $o['movie_codes'] = $mCodes;
                $o['movie_count'] = count($mCodes);
                $uCode            = isset($o['user_code']) && $o['user_code'] !== null ? (int) $o['user_code'] : 0;
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

            $offer['movie_codes'] = $this->queryRelationIds('movie_offer', 'offer_code', $offerId, 'movie_code');

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

                $this->syncMovieOfferRows('offer_code', $offerId, $movieCodes, 'movie_code', $data['offer_validity']);
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

            $existing = Db::name('offer')->where('offer_code', $offerId)->find();
            if (!$existing) {
                return $this->fail('Offer not found', 404);
            }

            $merged         = $this->mergeExistingPayload($existing, $payload, self::ALLOWED_FIELDS);
            [$data, $error] = $this->prepareOfferData($merged, $offerId);
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
                    $this->syncMovieOfferRows('offer_code', $offerId, $movieCodes, 'movie_code', $data['offer_validity']);
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

    private function prepareOfferData(array $payload, $excludeOfferId)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        $title = isset($data['offer_title']) ? (string) $data['offer_title'] : '';
        $type  = isset($data['offer_type']) ? (string) $data['offer_type'] : '';
        $desc  = isset($data['offer_description']) ? (string) $data['offer_description'] : '';
        $code  = isset($data['promo_code']) ? (string) $data['promo_code'] : '';
        $valid = isset($data['offer_validity']) ? (string) $data['offer_validity'] : '';
        $img   = isset($data['img']) ? (string) $data['img'] : '';
        $badge = isset($data['badge']) && $data['badge'] !== null ? (string) $data['badge'] : '';

        if ($title === '' || $this->textLen($title) > 200) {
            return [null, 'Offer title (1-200 characters) is required'];
        }
        if ($type === '' || $this->textLen($type) > 100) {
            return [null, 'Offer category (1-100 characters) is required'];
        }
        if ($desc === '' || $this->textLen($desc) > 500) {
            return [null, 'Offer description (1-500 characters) is required'];
        }
        if ($code === '' || $this->textLen($code) > 100) {
            return [null, 'Promo code (1-100 characters) is required'];
        }
        if ($valid === '' || !$this->isValidIsoDate($valid)) {
            return [null, 'Validity date must use YYYY-MM-DD format'];
        }
        if ($img === '' || $this->textLen($img) > 500) {
            return [null, 'Offer image path or URL (1-500 characters) is required'];
        }
        if ($badge !== '' && $this->textLen($badge) > 50) {
            return [null, 'Highlight badge must be 50 characters or fewer'];
        }

        $money = $this->parseFiniteFloat($data['money'] ?? null, 0.0);
        if ($money === null) {
            return [null, 'Discount amount must be a non-negative number'];
        }

        $ownerUserCode = null;
        if (array_key_exists('user_code', $data) && $data['user_code'] !== null && $data['user_code'] !== '') {
            $candidateUid = $this->parsePositiveInt($data['user_code']);
            if ($candidateUid <= 0 || !Db::name('user')->where('user_code', $candidateUid)->find()) {
                return [null, 'Selected exclusive member account does not exist'];
            }
            $ownerUserCode = $candidateUid;
        }

        $promoCode  = strtoupper($code);
        $promoQuery = Db::name('offer')->where('promo_code', $promoCode);
        if ($excludeOfferId > 0) {
            $promoQuery->where('offer_code', '<>', $excludeOfferId);
        }
        if ($promoQuery->find()) {
            return [null, 'Promo code is already in use by another offer'];
        }

        return [[
            'offer_title'       => $title,
            'offer_type'        => $type,
            'offer_description' => $desc,
            'promo_code'        => $promoCode,
            'offer_validity'    => $valid,
            'img'               => $img,
            'badge'             => $badge !== '' ? $badge : null,
            'money'             => $this->roundCents($money),
            'user_code'         => $ownerUserCode,
        ], null];
    }
}