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
    ];

    public function index()
    {
        try {
            $offers = Db::name('offer')->order('offer_code', 'asc')->select();
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
            return $offer ? $this->ok($offer) : $this->fail('Offer not found', 404);
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

            $data['create_time'] = date('Y-m-d H:i:s');
            $offerId = (int) Db::name('offer')->insertGetId($data);
            if ($offerId <= 0) {
                return $this->fail('Failed to create offer');
            }

            return $this->ok(['offer_code' => $offerId], 'Offer created successfully');
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

            $data['update_time'] = date('Y-m-d H:i:s');
            if (Db::name('offer')->where('offer_code', $offerId)->update($data) === false) {
                return $this->fail('Failed to update offer');
            }

            return $this->ok(['offer_code' => $offerId], 'Offer updated successfully');
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

            if (!Db::name('offer')->where('offer_code', $offerId)->delete()) {
                return $this->fail('Offer not found', 404);
            }

            return $this->ok(['offer_code' => $offerId], 'Offer deleted successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete offer', $e);
        }
    }

    private function prepareOfferData(array $payload, $excludeOfferId)
    {
        $data = $this->pickAllowed($payload, self::ALLOWED_FIELDS);

        if (empty($data['offer_title'])) {
            return [null, 'Offer title is required'];
        }
        if (empty($data['offer_type'])) {
            return [null, 'Offer category is required'];
        }
        if (empty($data['offer_description'])) {
            return [null, 'Offer description is required'];
        }
        if (empty($data['promo_code'])) {
            return [null, 'Promo code is required'];
        }
        if (empty($data['offer_validity']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['offer_validity'])) {
            return [null, 'Validity date must use YYYY-MM-DD format'];
        }
        if (empty($data['img'])) {
            return [null, 'Offer image path or URL is required'];
        }
        if (!isset($data['money']) || !is_numeric($data['money']) || (float) $data['money'] < 0) {
            return [null, 'Discount amount must be a non-negative number'];
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

        return [$data, null];
    }
}