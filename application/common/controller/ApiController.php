<?php
namespace app\common\controller;

use think\facade\Log;
use think\facade\Request;

/**
 * Shared JSON API base controller.
 * Unifies form/JSON payload parsing, parameter extraction, field whitelisting, and safe responses.
 */
abstract class ApiController
{
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

    protected function idParam($key, $direct = '')
    {
        if ($direct !== '' && $direct !== null) {
            return (int) $direct;
        }
        $payload = $this->payload();
        return isset($payload[$key]) ? (int) $payload[$key] : 0;
    }

    protected function strParam($key, $default = '')
    {
        $payload = $this->payload();
        return isset($payload[$key]) ? trim((string) $payload[$key]) : $default;
    }

    protected function textLen($value)
    {
        $str = (string) $value;
        return function_exists('mb_strlen') ? mb_strlen($str, 'UTF-8') : strlen($str);
    }

    protected function pickAllowed(array $source, array $allowedFields)
    {
        $allowed  = array_flip($allowedFields);
        $filtered = [];
        foreach ($source as $key => $value) {
            if (isset($allowed[$key])) {
                $filtered[$key] = is_string($value) ? trim($value) : $value;
            }
        }
        return $filtered;
    }

    protected function escapeLike($keyword)
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim((string) $keyword));
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
