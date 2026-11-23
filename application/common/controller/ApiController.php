<?php
namespace app\common\controller;

use think\facade\Log;
use think\facade\Request;

/**
 * Shared JSON API base controller.
 * Unifies form/JSON payload parsing, response envelopes, field whitelisting, and safe error logging.
 */
abstract class ApiController
{
    /**
     * Merge query/form parameters with raw JSON request body when present.
     *
     * @return array
     */
    protected function payload()
    {
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

        return $params;
    }

    /**
     * Keep only whitelisted database columns so strict field mode remains safe.
     *
     * @param array $source
     * @param array $allowedFields
     * @return array
     */
    protected function pickAllowed(array $source, array $allowedFields)
    {
        $allowed = array_flip($allowedFields);
        $filtered = [];
        foreach ($source as $key => $value) {
            if (isset($allowed[$key])) {
                $filtered[$key] = is_string($value) ? trim($value) : $value;
            }
        }
        return $filtered;
    }

    /**
     * Escape SQL LIKE wildcards (% and _) in user search terms.
     *
     * @param string $keyword
     * @return string
     */
    protected function escapeLike($keyword)
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim((string) $keyword));
    }

    /**
     * Build a standard successful JSON response.
     *
     * @param mixed  $data
     * @param string $message
     * @param array  $extra
     * @param int    $httpCode
     * @return \think\response\Json
     */
    protected function ok($data = null, $message = 'OK', array $extra = [], $httpCode = 200)
    {
        $body = array_merge([
            'success' => true,
            'message' => $message,
            'data'    => $data,
        ], $extra);

        return json($body, $httpCode);
    }

    /**
     * Build a standard error JSON response without leaking internal stack traces.
     *
     * @param string $message
     * @param int    $httpCode
     * @param mixed  $data
     * @return \think\response\Json
     */
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

    /**
     * Record internal exception details in application logs and return a safe error message.
     *
     * @param string     $userMessage
     * @param \Throwable $exception
     * @param int        $httpCode
     * @return \think\response\Json
     */
    protected function serverError($userMessage, $exception, $httpCode = 500)
    {
        Log::error($userMessage . ' | ' . $exception->getMessage());
        return $this->fail($userMessage, $httpCode);
    }
}
