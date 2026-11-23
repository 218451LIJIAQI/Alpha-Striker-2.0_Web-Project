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
            if (!empty($offers)) {
                $links = Db::table('movie_offer')
                    ->field('offer_code, movie_code')
                    ->order('movie_code', 'asc')
                    ->select();
                $movieMap = [];
                foreach ($links as $row) {
                    $movieMap[(int) $row['offer_code']][] = (int) $row['movie_code'];
                }
                foreach ($offers as &$o) {
                    $o['movie_codes'] = $movieMap[(int) $o['offer_code']] ?? [];
                }
                unset($o);
            }
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

            $offer['movie_codes'] = array_map(
                'intval',
                Db::table('movie_offer')
                    ->where('offer_code', $offerId)
                    ->order('movie_code', 'asc')
                    ->column('movie_code')
            );

            return $this->ok($offer);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query offer details', $e);
        }
    }

    public function create()
    {
        try {
            [$data, $error] = $this->prepareOfferData($this->payload(), 0);
            if ($error !== null) {
                return $this->fail($error);
            }

            [$movieCodes, $movieErr] = $this->resolveMovieCodes(true);
            if ($movieErr !== null) {
                return $this->fail($movieErr);
            }

            $now   = date('Y-m-d H:i:s');
            $today = date('Y-m-d');
            $data['create_time'] = $now;

            Db::startTrans();
            try {
                $offerId = (int) Db::name('offer')->insertGetId($data);
                if ($offerId <= 0) {
                    Db::rollback();
                    return $this->fail('Failed to create offer');
                }

                $this->syncMovieOfferLinks($offerId, $movieCodes, $today, $data['offer_validity'], $now);
                Db::commit();

                return $this->ok(['offer_code' => $offerId], 'Offer created successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }
        } catch (\Throwable $e) {
            return $this->serverError('Failed to create offer', $e);
        }
    }

    public function update($offer_code = '')
    {
        try {
            $offerId = $this->idParam('offer_code', $offer_code);
            if ($offerId <= 0) {
                return $this->fail('Valid offer_code is required');
            }

            if (!Db::name('offer')->where('offer_code', $offerId)->find()) {
                return $this->fail('Offer not found', 404);
            }

            [$data, $error] = $this->prepareOfferData($this->payload(), $offerId);
            if ($error !== null) {
                return $this->fail($error);
            }

            [$movieCodes, $movieErr] = $this->resolveMovieCodes(false);
            if ($movieErr !== null) {
                return $this->fail($movieErr);
            }

            $now   = date('Y-m-d H:i:s');
            $today = date('Y-m-d');
            $data['update_time'] = $now;

            Db::startTrans();
            try {
                if (Db::name('offer')->where('offer_code', $offerId)->update($data) === false) {
                    Db::rollback();
                    return $this->fail('Failed to update offer');
                }

                if ($movieCodes !== null) {
                    $this->syncMovieOfferLinks($offerId, $movieCodes, $today, $data['offer_validity'], $now);
                } else {
                    Db::table('movie_offer')
                        ->where('offer_code', $offerId)
                        ->update(['valid_to' => $data['offer_validity']]);
                }

                Db::commit();
                return $this->ok(['offer_code' => $offerId], 'Offer updated successfully');
            } catch (\Throwable $txErr) {
                Db::rollback();
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

            if (!Db::name('offer')->where('offer_code', $offerId)->find()) {
                return $this->fail('Offer not found', 404);
            }

            Db::startTrans();
            try {
                Db::table('movie_offer')->where('offer_code', $offerId)->delete();
                Db::name('offer')->where('offer_code', $offerId)->delete();
                Db::commit();
            } catch (\Throwable $txErr) {
                Db::rollback();
                throw $txErr;
            }

            return $this->ok(['offer_code' => $offerId], 'Offer deleted successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete offer', $e);
        }
    }

    private function prepareOfferData(array $payload, $excludeOfferId)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        if (empty($data['offer_title']) || $this->textLen($data['offer_title']) > 200) {
            return [null, 'Offer title is required (1-200 characters)'];
        }
        if (empty($data['offer_type']) || $this->textLen($data['offer_type']) > 100) {
            return [null, 'Offer category is required (1-100 characters)'];
        }
        if (empty($data['offer_description']) || $this->textLen($data['offer_description']) > 500) {
            return [null, 'Offer description is required (1-500 characters)'];
        }
        if (empty($data['promo_code'])) {
            return [null, 'Promo code is required'];
        }
        $promoCode = strtoupper((string) $data['promo_code']);
        if (!preg_match('/^[A-Z0-9_-]{3,50}$/', $promoCode)) {
            return [null, 'Promo code must be 3-50 alphanumeric characters, hyphens, or underscores'];
        }
        if (empty($data['offer_validity']) || !$this->isValidDate($data['offer_validity'])) {
            return [null, 'Validity date must be a valid YYYY-MM-DD calendar date'];
        }
        if (empty($data['img']) || !$this->isSafeAssetUrl($data['img'])) {
            return [null, 'A valid offer image path or URL is required'];
        }
        if (!isset($data['money']) || !is_numeric($data['money']) || (float) $data['money'] <= 0 || (float) $data['money'] > 9999.99) {
            return [null, 'Discount amount must be greater than 0 and at most 9999.99'];
        }
        if (isset($data['badge']) && $this->textLen($data['badge']) > 50) {
            return [null, 'Highlight badge must be 50 characters or fewer'];
        }

        $userCode = null;
        if (isset($data['user_code']) && $data['user_code'] !== '' && $data['user_code'] !== null) {
            $uid = $this->idParam('user_code');
            if ($uid <= 0 || !Db::name('user')->where('user_code', $uid)->value('user_code')) {
                return [null, 'Selected exclusive user does not exist'];
            }
            $userCode = $uid;
        }

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
        $data['user_code']  = $userCode;

        return [$data, null];
    }

    private function resolveMovieCodes($defaultAllOnOmit)
    {
        $movieCodes = $this->intListParam('movie_codes');
        if ($movieCodes === false) {
            return [null, 'Invalid movie_codes parameter'];
        }

        $allMovies = array_map('intval', Db::name('movies')->order('movie_code', 'asc')->column('movie_code'));
        if ($movieCodes === null) {
            return [$defaultAllOnOmit ? $allMovies : null, null];
        }

        if (empty($movieCodes) && !empty($allMovies)) {
            return [null, 'Please select at least one applicable movie for this offer'];
        }

        if (!empty($movieCodes)) {
            $existing = array_values(array_intersect($movieCodes, $allMovies));
            if (count($existing) !== count($movieCodes)) {
                return [null, 'One or more selected movies do not exist'];
            }
        }

        return [$movieCodes, null];
    }

    private function syncMovieOfferLinks($offerId, array $movieCodes, $validFrom, $validTo, $now)
    {
        Db::table('movie_offer')->where('offer_code', $offerId)->delete();
        if (empty($movieCodes)) {
            return;
        }
        $rows = [];
        foreach ($movieCodes as $mid) {
            $rows[] = [
                'movie_code'       => (int) $mid,
                'offer_code'       => (int) $offerId,
                'discount_percent' => 0.00,
                'valid_from'       => $validFrom,
                'valid_to'         => $validTo,
                'created_time'     => $now,
            ];
        }
        Db::table('movie_offer')->insertAll($rows);
    }
}