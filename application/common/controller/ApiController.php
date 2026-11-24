<?php
namespace app\common\controller;

use think\Db;
use think\facade\Log;
use think\facade\Request;
use think\facade\Session;

/**
 * Shared JSON & CSV API base controller.
 * Centralizes payload parsing, strict integer/float/scalar/email/password guards, mbstring-free UTF-8 helpers,
 * ISO calendar validation, same-origin CSRF verification, CSV formula-injection sanitization,
 * role-aware session lifecycle, cent-exact pricing math, promo validation, and SQL conflict detection.
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

    protected function parseFiniteFloat($raw, $min = 0.0, $max = INF)
    {
        if ($raw === null || $raw === '' || is_bool($raw) || is_array($raw) || is_object($raw) || !is_numeric($raw)) {
            return null;
        }
        $val = (float) $raw;
        if (!is_finite($val) || $val < $min || $val > $max) {
            return null;
        }
        return $val;
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

    protected function isValidEmail($value)
    {
        if (is_array($value) || is_object($value) || is_bool($value) || $value === null) {
            return false;
        }
        $str = trim((string) $value);
        return $str !== '' && strlen($str) <= 100 && filter_var($str, FILTER_VALIDATE_EMAIL) !== false;
    }

    protected function isValidPasswordLength($password)
    {
        if (!is_string($password)) {
            return false;
        }
        $bytes = strlen($password);
        return $bytes >= 6 && $bytes <= self::MAX_PASSWORD_BYTES;
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

    /**
     * Verifies Same-Origin boundary on state-mutating and privileged requests when Origin or Referer is present.
     */
    protected function verifySameOrigin()
    {
        $source = Request::header('origin');
        if (!is_string($source) || trim($source) === '') {
            $source = Request::header('referer');
        }
        if (!is_string($source) || trim($source) === '') {
            return true;
        }

        $trimmed = trim($source);
        if (strtolower($trimmed) === 'null') {
            return false;
        }

        $parsedHost = parse_url($trimmed, PHP_URL_HOST);
        if (!is_string($parsedHost) || $parsedHost === '') {
            return false;
        }
        $parsedPort      = parse_url($trimmed, PHP_URL_PORT);
        $sourceAuthority = strtolower($parsedHost) . ($parsedPort ? ':' . $parsedPort : '');

        $expectedHost = strtolower(trim((string) Request::header('host')));
        if ($expectedHost === '') {
            return true;
        }

        if ($sourceAuthority === $expectedHost) {
            return true;
        }
        $expectedHostnameOnly = explode(':', $expectedHost)[0];
        return $parsedPort === null && strtolower($parsedHost) === $expectedHostnameOnly;
    }

    /**
     * Neutralizes spreadsheet formula injection (OWASP CSV Injection: =, +, -, @, TAB, CR).
     */
    protected function sanitizeCsvCell($value)
    {
        if ($value === null || is_array($value) || is_object($value) || is_bool($value)) {
            return '';
        }
        if (is_int($value) || is_float($value)) {
            return is_finite((float) $value) ? (string) $value : '';
        }
        $str = (string) $value;
        if ($str !== '' && preg_match('/^(?:[\t\r\n ]*[=+\-@]|[\t\r])/', $str)) {
            return "'" . $str;
        }
        return $str;
    }

    /**
     * Formats an array of cells into a formula-safe RFC 4180 CSV line.
     */
    protected function formatCsvRow(array $cells)
    {
        $encoded = [];
        foreach ($cells as $cell) {
            $safe      = $this->sanitizeCsvCell($cell);
            $encoded[] = preg_match('/[",\r\n]/', $safe)
                ? '"' . str_replace('"', '""', $safe) . '"'
                : $safe;
        }
        return implode(',', $encoded);
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

    protected function roundCents($amount)
    {
        return round((float) $amount, 2, PHP_ROUND_HALF_UP);
    }

    /**
     * Authoritative checkout pricing calculation using half-up cent rounding.
     */
    protected function calculatePricing($unitPrice, $seatCount, $promoMoney = 0.0)
    {
        $count         = max(0, (int) $seatCount);
        $unit          = $this->roundCents(max(0.0, (float) $unitPrice));
        $subtotal      = $this->roundCents($unit * $count);
        $groupDiscount = $count >= self::GROUP_DISCOUNT_MIN_SEATS
            ? $this->roundCents($subtotal * self::GROUP_DISCOUNT_RATE)
            : 0.00;
        $promoDiscount = $this->roundCents(max(0.0, (float) $promoMoney));
        $totalDiscount = $this->roundCents($groupDiscount + $promoDiscount);
        $serviceFee    = $count > 0 ? self::SERVICE_FEE : 0.00;
        $totalAmount   = max(0.00, $this->roundCents($subtotal - $totalDiscount + $serviceFee));

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
            $validFrom = trim((string) ($link['valid_from'] ?? ''));
            $validTo   = trim((string) ($link['valid_to'] ?? ''));
            if ($validFrom !== '' && $checkDate < $validFrom) {
                return [
                    'valid'   => false,
                    'status'  => 200,
                    'message' => 'This promo code is not yet active for the selected date',
                    'offer'   => null,
                ];
            }
            if ($validTo !== '' && $checkDate > $validTo) {
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
            'money'          => $this->roundCents((float) $offer['money']),
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
