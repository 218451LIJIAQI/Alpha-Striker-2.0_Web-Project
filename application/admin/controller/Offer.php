<?php
namespace app\admin\controller;

use app\offer\model\Offer as OfferModel;
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
            $payload = $this->payload();
            $model   = new OfferModel();
            $query   = $model->order('offer_code', 'asc');

            if (!empty($payload['offer_code'])) {
                $query->where('offer_code', (int) $payload['offer_code']);
            }

            return $this->ok($query->select());
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query offers', $e);
        }
    }

    public function getOfferByCode($offer_code = '')
    {
        try {
            $payload = $this->payload();
            $offerId = (int) ($offer_code !== '' ? $offer_code : ($payload['offer_code'] ?? 0));

            if ($offerId <= 0) {
                return $this->fail('Valid offer_code is required');
            }

            $model = new OfferModel();
            $offer = $model->where('offer_code', $offerId)->find();
            if (!$offer) {
                return $this->fail('Offer not found', 404);
            }

            return $this->ok($offer);
        } catch (\Throwable $e) {
            return $this->serverError('Failed to query offer details', $e);
        }
    }

    public function create()
    {
        try {
            $raw = $this->normalizeOfferFields($this->payload());
            $data = $this->pickAllowed($raw, self::ALLOWED_FIELDS);

            $validationError = $this->validateOfferPayload($data, 0);
            if ($validationError !== null) {
                return $this->fail($validationError);
            }

            $data['promo_code']  = strtoupper($data['promo_code']);
            $data['badge']       = isset($data['badge']) && $data['badge'] !== '' ? $data['badge'] : null;
            $data['money']       = round((float) $data['money'], 2);
            $data['user_code']   = !empty($data['user_code']) ? (int) $data['user_code'] : null;
            $data['create_time'] = date('Y-m-d H:i:s');

            $model = new OfferModel();
            if (!$model->save($data)) {
                return $this->fail('Failed to create offer');
            }

            return $this->ok(['offer_code' => (int) $model->offer_code], 'Offer created successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to create offer', $e);
        }
    }

    public function update($offer_code = '')
    {
        try {
            $raw     = $this->normalizeOfferFields($this->payload());
            $offerId = (int) ($offer_code !== '' ? $offer_code : ($raw['offer_code'] ?? 0));

            if ($offerId <= 0) {
                return $this->fail('Valid offer_code is required');
            }

            $model = new OfferModel();
            if (!$model->where('offer_code', $offerId)->find()) {
                return $this->fail('Offer not found', 404);
            }

            $data = $this->pickAllowed($raw, self::ALLOWED_FIELDS);
            $validationError = $this->validateOfferPayload($data, $offerId);
            if ($validationError !== null) {
                return $this->fail($validationError);
            }

            $data['promo_code']  = strtoupper($data['promo_code']);
            $data['badge']       = isset($data['badge']) && $data['badge'] !== '' ? $data['badge'] : null;
            $data['money']       = round((float) $data['money'], 2);
            $data['user_code']   = !empty($data['user_code']) ? (int) $data['user_code'] : null;
            $data['update_time'] = date('Y-m-d H:i:s');

            $saved = $model->save($data, ['offer_code' => $offerId]);
            if ($saved === false) {
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
            $payload = $this->payload();
            $offerId = (int) ($offer_code !== '' ? $offer_code : ($payload['offer_code'] ?? 0));

            if ($offerId <= 0) {
                return $this->fail('Valid offer_code is required');
            }

            $model   = new OfferModel();
            $deleted = $model->where('offer_code', $offerId)->delete();
            if (!$deleted) {
                return $this->fail('Offer not found', 404);
            }

            return $this->ok(['offer_code' => $offerId], 'Offer deleted successfully');
        } catch (\Throwable $e) {
            return $this->serverError('Failed to delete offer', $e);
        }
    }

    private function normalizeOfferFields(array $payload)
    {
        if (!isset($payload['offer_validity']) && isset($payload['offer-validity'])) {
            $payload['offer_validity'] = $payload['offer-validity'];
        }
        return $payload;
    }

    private function validateOfferPayload(array $data, $excludeOfferId)
    {
        if (empty($data['offer_title'])) {
            return 'Offer title is required';
        }
        if (empty($data['offer_type'])) {
            return 'Offer category is required';
        }
        if (empty($data['offer_description'])) {
            return 'Offer description is required';
        }
        if (empty($data['promo_code'])) {
            return 'Promo code is required';
        }
        if (empty($data['offer_validity']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['offer_validity'])) {
            return 'Validity date must use YYYY-MM-DD format';
        }
        if (empty($data['img'])) {
            return 'Offer image path or URL is required';
        }
        if (!isset($data['money']) || !is_numeric($data['money']) || (float) $data['money'] < 0) {
            return 'Discount amount must be a non-negative number';
        }

        $promoQuery = Db::name('offer')->where('promo_code', strtoupper($data['promo_code']));
        if ($excludeOfferId > 0) {
            $promoQuery->where('offer_code', '<>', $excludeOfferId);
        }
        if ($promoQuery->find()) {
            return 'Promo code is already in use by another offer';
        }

        return null;
    }
}