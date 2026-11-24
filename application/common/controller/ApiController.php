<?php
namespace app\common\controller;

use think\Db;
use think\facade\Log;
use think\facade\Request;
use think\facade\Session;

/**
 * Shared JSON API base controller.
 * Centralizes payload parsing, strict integer/scalar guards, mbstring-free UTF-8 helpers,
 * ISO calendar validation, role-aware session lifecycle, date-window query scoping,
 * authoritative promo verification, checkout pricing calculation, and SQL conflict detection.
 */
abstract class ApiController
{
    public const SERVICE_FEE              = 2.50;
    public const GROUP_DISCOUNT_MIN_SEATS = 5;
    public const GROUP_DISCOUNT_RATE      = 0.30;
    public const MAX_SEATS_PER_ORDER      = 10;
    public const MAX_PASSWORD_BYTES       = 72;

    /** @var array|null */
    private $cachedPayload = null;

    protected function payload()
    {
        if ($this->cachedPayload !== null) {
            return $this->cachedPayload;
        }

        $params = Request::param();
        if (!is_array($params)) {
            $params = [];
        }

        $raw = file_get_contents('php://input');
        if (is_string($raw) && trim($raw) !== '') {
            $decoded = json_decode($raw, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $params = array_merge($params, $decoded);
            }
        }

        return $this->cachedPayload = $params;
    }

    protected function parsePositiveInt($raw)
    {
        if (is_int($raw)) {
            return $raw > 0 ? $raw : 0;
        }
        if ($raw === null || is_bool($raw) || is_array($raw) || is_object($raw) || is_float($raw)) {
            return 0;
        }
        $str = trim((string) $raw);
        if (!preg_match('/^\d+$/', $str)) {
            return 0;
        }
        $val = (int) $str;
        return $val > 0 ? $val : 0;
    }

    protected function idParam($key, $direct = '')
    {
        if ($direct !== '' && $direct !== null) {
            return $this->parsePositiveInt($direct);
        }
        $payload = $this->payload();
        return isset($payload[$key]) ? $this->parsePositiveInt($payload[$key]) : 0;
    }

    protected function optionalIdWithDefault($key, $defaultId = 1)
    {
        $payload = $this->payload();
        if (!isset($payload[$key]) || $payload[$key] === '' || $payload[$key] === null) {
            return (int) $defaultId;
        }
        return $this->parsePositiveInt($payload[$key]);
    }

    protected function strParam($key, $default = '')
    {
        $payload = $this->payload();
        if (!isset($payload[$key]) || is_array($payload[$key]) || is_object($payload[$key]) || is_bool($payload[$key])) {
            return $default;
        }
        return trim((string) $payload[$key]);
    }

    protected function rawStrParam($key, $default = '')
    {
        $payload = $this->payload();
        if (!isset($payload[$key]) || is_array($payload[$key]) || is_object($payload[$key]) || is_bool($payload[$key])) {
            return $default;
        }
        return (string) $payload[$key];
    }

    protected function isValidIsoDate($value)
    {
        if (is_array($value) || is_object($value) || is_bool($value)) {
            return false;
        }
        $str = trim((string) $value);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $str, $m)) {
            return false;
        }
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    /**
     * Exact UTF-8 character count without requiring ext-mbstring.
     */
    protected function textLen($value)
    {
        if (is_array($value) || is_object($value) || is_bool($value) || $value === null) {
            return 0;
        }
        $str = (string) $value;
        if ($str === '') {
            return 0;
        }
        if (function_exists('mb_strlen')) {
            return (int) call_user_func('mb_strlen', $str, 'UTF-8');
        }
        $matched = preg_match_all('/./us', $str, $m);
        if ($matched !== false) {
            return (int) $matched;
        }
        return strlen((string) preg_replace('/[\x80-\xBF]/', '', $str));
    }

    protected function rotateSession()
    {
        Session::init();
        Session::regenerate(true);
    }

    protected function destroySession()
    {
        Session::init();
        Session::clear();
        Session::destroy();
    }

    protected function pickAllowed(array $source, array $allowedFields)
    {
        $allowed  = array_flip($allowedFields);
        $filtered = [];
        foreach ($source as $key => $value) {
            if (!isset($allowed[$key])) {
                continue;
            }
            if (is_array($value) || is_object($value) || is_bool($value)) {
                $filtered[$key] = '';
            } elseif (is_string($value)) {
                $filtered[$key] = trim($value);
            } else {
                $filtered[$key] = $value;
            }
        }
        return $filtered;
    }

    protected function normalizeIdArray($raw)
    {
        if (is_string($raw)) {
            $raw = trim($raw) === '' ? [] : explode(',', $raw);
        }
        if (!is_array($raw)) {
            return [];
        }
        $ids = [];
        foreach ($raw as $item) {
            $id = $this->parsePositiveInt($item);
            if ($id > 0) {
                $ids[$id] = $id;
            }
        }
        return array_values($ids);
    }

    protected function applyDateWindow($query, $startCol, $endCol, $date)
    {
        return $query
            ->where(function ($q) use ($startCol, $date) {
                $q->whereNull($startCol)->whereOr($startCol, '<=', $date);
            })
            ->where(function ($q) use ($endCol, $date) {
                $q->whereNull($endCol)->whereOr($endCol, '>=', $date);
            });
    }

    protected function escapeLike($keyword)
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim((string) $keyword));
    }

    /**
     * Authoritative checkout pricing calculation shared across Offer preview and Seat transaction.
     */
    protected function calculatePricing($unitPrice, $seatCount, $promoMoney = 0.0)
    {
        $count         = max(0, (int) $seatCount);
        $unit          = round(max(0.0, (float) $unitPrice), 2);
        $subtotal      = round($unit * $count, 2);
        $groupDiscount = $count >= self::GROUP_DISCOUNT_MIN_SEATS
            ? round($subtotal * self::GROUP_DISCOUNT_RATE, 2)
            : 0.00;
        $promoDiscount = round(max(0.0, (float) $promoMoney), 2);
        $totalDiscount = round($groupDiscount + $promoDiscount, 2);
        $serviceFee    = $count > 0 ? self::SERVICE_FEE : 0.00;
        $totalAmount   = max(0.00, round($subtotal - $totalDiscount + $serviceFee, 2));

        return [
            'unit_price'     => $unit,
            'seat_count'     => $count,
            'subtotal'       => $subtotal,
            'group_discount' => $groupDiscount,
            'promo_discount' => $promoDiscount,
            'total_discount' => $totalDiscount,
            'service_fee'    => $serviceFee,
            'total_amount'   => $totalAmount,
        ];
    }

    /**
     * Validates a promo code against existence, expiry date, user ownership, and movie_offer applicability.
     */
    protected function validatePromoForContext($rawCode, $movieCode = 0, $sessionUserId = 0, $screeningDate = '')
    {
        $code = strtoupper(trim((string) $rawCode));
        if ($code === '') {
            return [
                'valid'   => false,
                'status'  => 200,
                'message' => 'Promo code is required',
                'offer'   => null,
            ];
        }

        $offer = Db::name('offer')
            ->field('offer_code, offer_title, offer_type, promo_code, offer_validity, badge, money, user_code')
            ->where('promo_code', $code)
            ->find();

        if (!$offer) {
            return [
                'valid'   => false,
                'status'  => 200,
                'message' => 'Invalid promo code',
                'offer'   => null,
            ];
        }

        $today    = date('Y-m-d');
        $validity = trim((string) ($offer['offer_validity'] ?? ''));
        if ($this->isValidIsoDate($validity) && $validity < $today) {
            return [
                'valid'   => false,
                'status'  => 200,
                'message' => 'This promo code has expired',
                'offer'   => null,
            ];
        }

        $ownerUserId = isset($offer['user_code']) && $offer['user_code'] !== null ? (int) $offer['user_code'] : 0;
        $callerId    = (int) $sessionUserId;
        if ($ownerUserId > 0) {
            if ($callerId <= 0) {
                return [
                    'valid'   => false,
                    'status'  => 401,
                    'message' => 'Please sign in to redeem this member-exclusive promo code',
                    'offer'   => null,
                ];
            }
            if ($callerId !== $ownerUserId) {
                return [
                    'valid'   => false,
                    'status'  => 403,
                    'message' => 'This promo code belongs to another member account',
                    'offer'   => null,
                ];
            }
        }

        $targetMovieId = (int) $movieCode;
        if ($targetMovieId > 0) {
            $link = Db::table('movie_offer')
                ->where('movie_code', $targetMovieId)
                ->where('offer_code', (int) $offer['offer_code'])
                ->find();

            if (!$link) {
                return [
                    'valid'   => false,
                    'status'  => 200,
                    'message' => 'This promo code is not applicable to the selected movie',
                    'offer'   => null,
                ];
            }

            $checkDate = ($screeningDate !== '' && $this->isValidIsoDate($screeningDate))
                ? $screeningDate
                : $today;
            if (!empty($link['valid_from']) && $checkDate < $link['valid_from']) {
                return [
                    'valid'   => false,
                    'status'  => 200,
                    'message' => 'This promo code is not yet active for the selected date',
                    'offer'   => null,
                ];
            }
            if (!empty($link['valid_to']) && $checkDate > $link['valid_to']) {
                return [
                    'valid'   => false,
                    'status'  => 200,
                    'message' => 'This promo code is not valid for the selected screening date',
                    'offer'   => null,
                ];
            }
        }

        $safeOffer = [
            'offer_code'     => (int) $offer['offer_code'],
            'offer_title'    => $offer['offer_title'],
            'offer_type'     => $offer['offer_type'],
            'promo_code'     => $offer['promo_code'],
            'offer_validity' => $offer['offer_validity'],
            'badge'          => $offer['badge'],
            'money'          => round((float) $offer['money'], 2),
            'user_code'      => $ownerUserId > 0 ? $ownerUserId : null,
        ];

        return [
            'valid'   => true,
            'status'  => 200,
            'message' => 'Promo code applied',
            'offer'   => $safeOffer,
        ];
    }

    protected function isUniqueConflict($exception)
    {
        $code = (string) $exception->getCode();
        $msg  = $exception->getMessage();
        if (in_array($code, ['23000', '40001', '1062', '1213'], true)) {
            return true;
        }
        return (bool) preg_match('/duplicate entry|unique constraint|uk_seat_booking|uk_user_email|uk_offer_promo|deadlock/i', $msg);
    }

    protected function ok($data = null, $message = 'OK', array $extra = [], $httpCode = 200)
    {
        return json(array_merge([
            'success' => true,
            'message' => $message,
            'data'    => $data,
        ], $extra), $httpCode);
    }

    protected function fail($message, $httpCode = 200, $data = null)
    {
        $body = [
            'success' => false,
            'message' => $message,
        ];
        if ($data !== null) {
            $body['data'] = $data;
        }
        return json($body, $httpCode);
    }

    protected function serverError($userMessage, $exception, $httpCode = 500)
    {
        Log::error($userMessage . ' | ' . $exception->getMessage());
        return $this->fail($userMessage, $httpCode);
    }
}
