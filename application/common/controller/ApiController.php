<?php
namespace app\common\controller;

use think\Db;
use think\facade\Log;
use think\facade\Request;

/**
 * Shared JSON API base controller.
 * Centralizes type-safe parameter parsing, asset/date validation, promo verification,
 * checkout pricing calculation, and uniform JSON responses.
 */
abstract class ApiController
{
    public const SERVICE_FEE = 2.50;
    public const GROUP_DISCOUNT_MIN_SEATS = 5;
    public const GROUP_DISCOUNT_RATE = 0.30;

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

    protected function hasParam($key)
    {
        $payload = $this->payload();
        return array_key_exists($key, $payload);
    }

    protected function idParam($key, $direct = '')
    {
        $candidate = ($direct !== '' && $direct !== null) ? $direct : ($this->payload()[$key] ?? null);
        if (!is_scalar($candidate) || is_bool($candidate)) {
            return 0;
        }
        $str = trim((string) $candidate);
        if (!preg_match('/^-?\d+$/', $str)) {
            return 0;
        }
        return (int) $str;
    }

    protected function strParam($key, $default = '')
    {
        $payload = $this->payload();
        if (!isset($payload[$key]) || !is_scalar($payload[$key]) || is_bool($payload[$key])) {
            return $default;
        }
        $clean = str_replace("\0", '', (string) $payload[$key]);
        return trim($clean);
    }

    protected function rawPasswordParam($key)
    {
        $payload = $this->payload();
        if (!isset($payload[$key]) || !is_scalar($payload[$key]) || is_bool($payload[$key])) {
            return '';
        }
        return str_replace("\0", '', (string) $payload[$key]);
    }

    protected function intListParam($key)
    {
        $payload = $this->payload();
        if (!array_key_exists($key, $payload)) {
            return null;
        }
        $raw = $payload[$key];
        $items = is_array($raw) ? $raw : ((is_scalar($raw) && !is_bool($raw)) ? explode(',', (string) $raw) : []);
        $ids = [];
        foreach ($items as $item) {
            if (!is_scalar($item) || is_bool($item)) {
                continue;
            }
            $trimmed = trim((string) $item);
            if ($trimmed === '') {
                continue;
            }
            if (!preg_match('/^\d+$/', $trimmed) || (int) $trimmed <= 0) {
                return false;
            }
            $id = (int) $trimmed;
            $ids[$id] = $id;
        }
        return array_values($ids);
    }

    protected function textLen($value)
    {
        $str = (string) $value;
        return function_exists('mb_strlen') ? mb_strlen($str, 'UTF-8') : strlen($str);
    }

    protected function textSlice($value, $maxLen)
    {
        $str = (string) $value;
        return function_exists('mb_substr') ? mb_substr($str, 0, (int) $maxLen, 'UTF-8') : substr($str, 0, (int) $maxLen);
    }

    protected function isValidDate($value)
    {
        $str = trim((string) $value);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $str, $m)) {
            return false;
        }
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }

    protected function isSafeAssetUrl($value)
    {
        if (!is_string($value)) {
            return false;
        }
        $trimmed = trim($value);
        if ($trimmed === '' || $this->textLen($trimmed) > 500 || preg_match('/[\x00-\x1F\x7F]/', $trimmed)) {
            return false;
        }
        if (preg_match('/^[a-zA-Z][a-zA-Z0-9+.-]*:/', $trimmed)) {
            return (bool) preg_match('/^(https?:\/\/|data:image\/[a-zA-Z0-9.+-]+;base64,)/i', $trimmed);
        }
        return true;
    }

    protected function pickAllowed(array $source, array $allowedFields)
    {
        $allowed  = array_flip($allowedFields);
        $filtered = [];
        foreach ($source as $key => $value) {
            if (!isset($allowed[$key])) {
                continue;
            }
            if ($value === null) {
                $filtered[$key] = null;
            } elseif (is_scalar($value) && !is_bool($value)) {
                $filtered[$key] = is_string($value) ? trim(str_replace("\0", '', $value)) : $value;
            }
        }
        return $filtered;
    }

    protected function escapeLike($keyword)
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim((string) $keyword));
    }

    protected function calculateCheckoutPricing($unitPrice, $seatCount, $promoDiscount = 0.0)
    {
        $unit     = round(max(0.0, (float) $unitPrice), 2);
        $count    = max(0, (int) $seatCount);
        $subtotal = round($unit * $count, 2);
        $groupOff = $count >= self::GROUP_DISCOUNT_MIN_SEATS
            ? round($subtotal * self::GROUP_DISCOUNT_RATE, 2)
            : 0.00;
        $promoOff = round(max(0.0, (float) $promoDiscount), 2);
        $fee      = $count > 0 ? self::SERVICE_FEE : 0.00;
        $total    = max(0.00, round($subtotal - ($groupOff + $promoOff) + $fee, 2));

        return [
            'unit_price'     => $unit,
            'seat_count'     => $count,
            'subtotal'       => $subtotal,
            'group_discount' => $groupOff,
            'promo_discount' => $promoOff,
            'service_fee'    => $fee,
            'total_paid'     => $total,
        ];
    }

    protected function validateOfferForBooking($rawCode, $movieCode = 0, $screeningDate = '', $sessionUserId = 0)
    {
        $code = strtoupper(trim((string) $rawCode));
        if ($code === '') {
            return [null, 'Promo code is required'];
        }

        $offer = Db::name('offer')
            ->field('offer_code, offer_title, promo_code, offer_validity, badge, money, user_code')
            ->where('promo_code', $code)
            ->find();

        if (!$offer) {
            return [null, 'Invalid promo code'];
        }

        $today    = date('Y-m-d');
        $validity = trim((string) ($offer['offer_validity'] ?? ''));
        if ($this->isValidDate($validity)) {
            if ($validity < $today) {
                return [null, 'This promo code has expired'];
            }
            if ($this->isValidDate($screeningDate) && $screeningDate > $validity) {
                return [null, 'This promo code expires before the selected screening date'];
            }
        }

        $exclusiveOwner = isset($offer['user_code']) ? (int) $offer['user_code'] : 0;
        if ($exclusiveOwner > 0 && (int) $sessionUserId !== $exclusiveOwner) {
            return [null, 'This promo code is exclusive to another member account'];
        }

        if ((int) $movieCode > 0) {
            $link = Db::table('movie_offer')
                ->where('offer_code', (int) $offer['offer_code'])
                ->where('movie_code', (int) $movieCode)
                ->find();

            if (!$link) {
                return [null, 'This promo code is not valid for the selected movie'];
            }

            $refDate   = $this->isValidDate($screeningDate) ? $screeningDate : $today;
            $validFrom = trim((string) ($link['valid_from'] ?? ''));
            $validTo   = trim((string) ($link['valid_to'] ?? ''));

            if ($this->isValidDate($validFrom) && $refDate < $validFrom) {
                return [null, 'This promo code is not yet active for this movie'];
            }
            if ($this->isValidDate($validTo) && $refDate > $validTo) {
                return [null, 'This promo code has expired for this movie'];
            }
        }

        unset($offer['user_code']);
        $offer['money'] = round((float) $offer['money'], 2);
        return [$offer, null];
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
