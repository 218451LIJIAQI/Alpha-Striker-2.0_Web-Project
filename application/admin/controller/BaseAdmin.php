<?php
namespace app\admin\controller;

use app\common\controller\ApiController;
use think\Db;
use think\exception\HttpResponseException;
use think\facade\Request;
use think\facade\Session;

/**
 * Base controller for authenticated admin endpoints.
 * Enforces Same-Origin check, active admin session, and non-empty constant-time X-Admin-Token / Bearer verification,
 * and centralizes partial-update merging, single/batch target ID resolution, foreign-key ID resolution,
 * relation mapping, non-destructive junction syncing, and formula-safe UTF-8 BOM CSV streaming.
 */
abstract class BaseAdmin extends ApiController
{
    private const MAX_BATCH_IDS = 200;

    public function __construct()
    {
        if (!$this->verifySameOrigin()) {
            throw new HttpResponseException(
                $this->fail('Forbidden: cross-origin request rejected', 403)
            );
        }

        if (!self::hasAdminSession()) {
            throw new HttpResponseException(
                $this->fail('Unauthorized: admin login required', 401)
            );
        }

        if (!self::checkSession()) {
            throw new HttpResponseException(
                $this->fail('Forbidden: valid X-Admin-Token header is required', 403)
            );
        }
    }

    public static function hasAdminSession()
    {
        $sessionToken = (string) Session::get('admin_token', '');
        return Session::get('admin_auth') === true && $sessionToken !== '';
    }

    public static function checkSession()
    {
        $sessionToken = (string) Session::get('admin_token', '');
        if (Session::get('admin_auth') !== true || $sessionToken === '') {
            return false;
        }

        $clientToken = self::extractToken();
        if ($clientToken === '') {
            return false;
        }

        return hash_equals($sessionToken, $clientToken);
    }

    /**
     * Resolves either a single positive ID or a batch list of positive IDs for atomic delete/bulk actions.
     */
    protected function resolveTargetIds($singleKey, $batchKey, $direct = '')
    {
        if ($direct !== '' && $direct !== null) {
            $one = $this->parsePositiveInt($direct);
            return $one > 0 ? [$one] : [];
        }

        $payload = $this->payload();
        if (isset($payload[$batchKey])) {
            $batch = $this->normalizeIdArray($payload[$batchKey]);
            return array_slice($batch, 0, self::MAX_BATCH_IDS);
        }

        if (isset($payload[$singleKey])) {
            if (is_array($payload[$singleKey])) {
                return array_slice($this->normalizeIdArray($payload[$singleKey]), 0, self::MAX_BATCH_IDS);
            }
            $one = $this->parsePositiveInt($payload[$singleKey]);
            return $one > 0 ? [$one] : [];
        }

        return [];
    }

    /**
     * Merges an existing database record with submitted payload fields for partial-update support.
     * Unsubmitted keys inherit existing values; submitted empty strings explicitly clear nullable columns; "0" is preserved.
     */
    protected function mergeExistingPayload(array $existing, array $payload, array $allowedFields)
    {
        $merged = [];
        foreach ($allowedFields as $field) {
            if (array_key_exists($field, $payload)) {
                $merged[$field] = $payload[$field];
            } elseif (array_key_exists($field, $existing)) {
                $merged[$field] = $existing[$field];
            }
        }
        return $merged;
    }

    protected function resolveValidIds($table, $pk, $raw)
    {
        $ids = $this->normalizeIdArray($raw);
        if (empty($ids)) {
            return [];
        }
        $valid = Db::name($table)->where($pk, 'in', $ids)->order($pk, 'asc')->column($pk);
        return array_map('intval', $valid ?: []);
    }

    protected function queryRelationIds($table, $whereCol, $whereId, $targetCol)
    {
        $vals = Db::table($table)
            ->where($whereCol, (int) $whereId)
            ->order($targetCol, 'asc')
            ->column($targetCol);
        return array_map('intval', $vals ?: []);
    }

    protected function mapRelationIds($table, $groupCol, $valueCol)
    {
        $rows    = Db::table($table)->field("{$groupCol}, {$valueCol}")->select();
        $grouped = [];
        foreach ($rows as $row) {
            $gid = (int) $row[$groupCol];
            $grouped[$gid][] = (int) $row[$valueCol];
        }
        foreach ($grouped as &$list) {
            sort($list);
        }
        unset($list);
        return $grouped;
    }

    /**
     * Synchronizes `theater_movie` rows non-destructively so existing start_date, end_date,
     * and daily_showtimes values are preserved for retained links.
     */
    protected function syncScheduleRows($whereCol, $whereId, array $targetIds, $targetCol)
    {
        $ownerId = (int) $whereId;
        if (empty($targetIds)) {
            Db::table('theater_movie')->where($whereCol, $ownerId)->delete();
            return;
        }

        Db::table('theater_movie')
            ->where($whereCol, $ownerId)
            ->where($targetCol, 'not in', $targetIds)
            ->delete();

        $existingIds = $this->queryRelationIds('theater_movie', $whereCol, $ownerId, $targetCol);
        $toInsert    = array_values(array_diff($targetIds, $existingIds));
        if (empty($toInsert)) {
            return;
        }

        $now  = date('Y-m-d H:i:s');
        $rows = [];
        foreach ($toInsert as $targetId) {
            $rows[] = [
                $whereCol         => $ownerId,
                $targetCol        => (int) $targetId,
                'start_date'      => '2026-01-01',
                'end_date'        => '2027-12-31',
                'daily_showtimes' => 4,
                'created_time'    => $now,
            ];
        }
        Db::table('theater_movie')->insertAll($rows);
    }

    /**
     * Synchronizes `movie_offer` rows non-destructively across both Movie and Offer controllers,
     * preserving existing discount_percent and valid_from metadata on retained pairs.
     */
    protected function syncMovieOfferRows($whereCol, $whereId, array $targetIds, $targetCol, $fixedValidTo = null)
    {
        $ownerId = (int) $whereId;
        if (empty($targetIds)) {
            Db::table('movie_offer')->where($whereCol, $ownerId)->delete();
            return;
        }

        Db::table('movie_offer')
            ->where($whereCol, $ownerId)
            ->where($targetCol, 'not in', $targetIds)
            ->delete();

        if ($fixedValidTo !== null && $this->isValidIsoDate((string) $fixedValidTo)) {
            Db::table('movie_offer')
                ->where($whereCol, $ownerId)
                ->update(['valid_to' => (string) $fixedValidTo]);
        }

        $existingIds = $this->queryRelationIds('movie_offer', $whereCol, $ownerId, $targetCol);
        $toInsert    = array_values(array_diff($targetIds, $existingIds));
        if (empty($toInsert)) {
            return;
        }

        $offerValidities = $targetCol === 'offer_code'
            ? Db::name('offer')->where('offer_code', 'in', $toInsert)->column('offer_validity', 'offer_code')
            : [];

        $now  = date('Y-m-d H:i:s');
        $rows = [];
        foreach ($toInsert as $targetId) {
            $tid     = (int) $targetId;
            $validTo = $fixedValidTo !== null && $this->isValidIsoDate((string) $fixedValidTo)
                ? (string) $fixedValidTo
                : (isset($offerValidities[$tid]) && $this->isValidIsoDate((string) $offerValidities[$tid])
                    ? (string) $offerValidities[$tid]
                    : '2027-12-31');

            $rows[] = [
                $whereCol          => $ownerId,
                $targetCol         => $tid,
                'discount_percent' => 0.00,
                'valid_from'       => '2026-01-01',
                'valid_to'         => $validTo,
                'created_time'     => $now,
            ];
        }
        Db::table('movie_offer')->insertAll($rows);
    }

    /**
     * Builds a UTF-8 BOM CSV HTTP download response with OWASP formula-injection neutralization.
     */
    protected function csvResponse($filename, array $headers, array $rows)
    {
        $cleanName = preg_replace('/[^A-Za-z0-9._-]/', '_', (string) $filename) ?: 'export.csv';
        $lines     = [$this->formatCsvRow($headers)];
        foreach ($rows as $row) {
            $lines[] = $this->formatCsvRow(is_array($row) ? $row : []);
        }
        $body = "\xEF\xBB\xBF" . implode("\r\n", $lines);
        return response($body, 200, [
            'Content-Type'           => 'text/csv; charset=UTF-8',
            'Content-Disposition'    => 'attachment; filename="' . $cleanName . '"',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private static function extractToken()
    {
        $headerToken = Request::header('x-admin-token');
        if (is_string($headerToken) && trim($headerToken) !== '') {
            return trim($headerToken);
        }

        $authHeader = Request::header('authorization');
        if (is_string($authHeader) && stripos($authHeader, 'Bearer ') === 0) {
            return trim(substr($authHeader, 7));
        }

        return '';
    }
}
