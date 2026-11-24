<?php
namespace app\admin\controller;

use app\common\controller\ApiController;
use think\Db;
use think\exception\HttpResponseException;
use think\facade\Request;
use think\facade\Session;

/**
 * Base controller for authenticated admin endpoints.
 * Enforces both active admin session AND non-empty constant-time X-Admin-Token / Bearer verification,
 * and centralizes foreign-key ID resolution, relation mapping, and schedule row synchronization.
 */
abstract class BaseAdmin extends ApiController
{
    public function __construct()
    {
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

    protected function resolveValidIds($table, $pk, $raw)
    {
        $ids = $this->normalizeIdArray($raw);
        if (empty($ids)) {
            return [];
        }
        $valid = Db::name($table)->where($pk, 'in', $ids)->order($pk, 'asc')->column($pk);
        return array_map('intval', $valid ?: []);
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

    protected function syncScheduleRows($whereCol, $whereId, array $targetIds, $targetCol)
    {
        Db::table('theater_movie')->where($whereCol, (int) $whereId)->delete();
        if (empty($targetIds)) {
            return;
        }

        $now  = date('Y-m-d H:i:s');
        $rows = [];
        foreach ($targetIds as $targetId) {
            $rows[] = [
                $whereCol         => (int) $whereId,
                $targetCol        => (int) $targetId,
                'start_date'      => '2026-01-01',
                'end_date'        => '2027-12-31',
                'daily_showtimes' => 4,
                'created_time'    => $now,
            ];
        }
        Db::table('theater_movie')->insertAll($rows);
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
