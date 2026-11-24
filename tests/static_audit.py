#!/usr/bin/env python3
"""
Static, Security, Accessibility & Relational Contract Audit Suite for CineTix (Alpha Striker 2.0).
Verifies:
1. movies.sql relational schema, foreign keys, unique constraints, and seed asset paths (case-sensitive) in SQLite (PRAGMA foreign_keys=ON).
2. PHP syntax structure, balanced delimiters, zero bare mb_* calls, zero hardcoded '888888', strict non-empty CSRF + same-origin check,
   shared BaseAdmin relation & partial-update helpers (resolveValidIds, mapRelationIds, syncScheduleRows, syncMovieOfferRows, mergeExistingPayload),
   ApiController strict scalar/integer/date/password/CSV-formula-injection/cent-rounding parity, SameSite=Lax + Asia/Kuala_Lumpur configs,
   and 3-way route parity across Frontend <-> PHP Controllers <-> mock_thinkphp_server.py.
3. JavaScript syntax across all external .js modules and inline HTML <script> blocks via `node --check`, zero leaked window.* globals,
   and presence of shared security/UI primitives (sanitizeCsvCell, sanitizeRedirectPath, isValidPasswordBytes, parseSeatCodes, activatePill, bindTabList, renderStateCard).
4. HTML/JS zero `href="#"` dead links, zero external CDN <link>/<script> dependencies, case-sensitive local asset integrity,
   100% offline CSS coverage for every `fa-*` icon class, and all 39 binary images/icons readability.
5. CSS brace balance, zero undefined or unused CSS custom properties, single centralized dark-mode variable block, `:focus-visible`,
   `prefers-reduced-motion`, sticky table headers, viewport-safe sidebar/modal scroll rules, and absence of destructive global overrides.
"""

from __future__ import annotations

import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def translate_mysql_to_sqlite(sql_text: str) -> str:
    lines = []
    for raw_line in sql_text.splitlines():
        line = raw_line.strip()
        if (
            line.startswith("SET NAMES")
            or line.startswith("CREATE DATABASE")
            or line.startswith("USE ")
            or line.startswith("SET FOREIGN_KEY_CHECKS")
        ):
            continue
        lines.append(raw_line)
    body = "\n".join(lines)
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    body = re.sub(r"\)\s*ENGINE=InnoDB[^;]*;", ");", body)
    body = re.sub(r"\bbigint\(\d+\)\s+NOT NULL\s+AUTO_INCREMENT", "INTEGER", body, flags=re.I)
    body = re.sub(r"\bbigint\(\d+\)", "INTEGER", body, flags=re.I)
    body = re.sub(r"\bint\b", "INTEGER", body, flags=re.I)
    body = re.sub(r"\s+COMMENT\s+'[^']*'", "", body, flags=re.I)
    body = re.sub(r"\s+COLLATE\s+\w+", "", body, flags=re.I)
    body = re.sub(r"NOW\(\)", "CURRENT_TIMESTAMP", body)

    converted_stmts = []
    for stmt in body.split(";"):
        s = stmt.strip()
        if not s:
            continue
        if s.upper().startswith("CREATE TABLE"):
            table_match = re.search(r"CREATE TABLE\s+`(\w+)`", s, re.I)
            tname = table_match.group(1)
            extra_indexes = []
            out_lines = []
            for ln in s.splitlines():
                stripped = ln.strip().rstrip(",")
                pk_match = re.match(r"^PRIMARY KEY\s*\(`(\w+)`\)$", stripped, re.I)
                if pk_match:
                    pk_col = pk_match.group(1)
                    out_lines = [
                        re.sub(
                            rf"(`{pk_col}`\s+INTEGER)",
                            r"\1 PRIMARY KEY AUTOINCREMENT",
                            ol,
                        )
                        for ol in out_lines
                    ]
                    continue
                uk_match = re.match(r"^UNIQUE KEY\s+`(\w+)`\s*\((.+)\)$", stripped, re.I)
                if uk_match:
                    extra_indexes.append(
                        f"CREATE UNIQUE INDEX `{uk_match.group(1)}` ON `{tname}` ({uk_match.group(2)})"
                    )
                    continue
                idx_match = re.match(r"^KEY\s+`(\w+)`\s*\((.+)\)$", stripped, re.I)
                if idx_match:
                    extra_indexes.append(
                        f"CREATE INDEX `{idx_match.group(1)}` ON `{tname}` ({idx_match.group(2)})"
                    )
                    continue
                out_lines.append(ln)

            cleaned = "\n".join(out_lines)
            cleaned = re.sub(r",(\s*\))$", r"\1", cleaned)
            converted_stmts.append(cleaned)
            converted_stmts.extend(extra_indexes)
        else:
            converted_stmts.append(s)

    return ";\n".join(converted_stmts) + ";"


def assert_case_exact_path(path: Path, context: str) -> None:
    assert_true(path.is_file(), f"Missing file in {context}: {path}")
    cur = path.resolve()
    root_resolved = ROOT.resolve()
    while cur != root_resolved and cur.parent != cur:
        entries = os.listdir(cur.parent)
        assert_true(
            cur.name in entries,
            f"Case-sensitivity mismatch for '{cur.name}' in {context} (actual entries: {entries})",
        )
        cur = cur.parent


def verify_sql_schema_and_seed_assets() -> None:
    sql_path = ROOT / "movies.sql"
    sql_text = sql_path.read_text(encoding="utf-8")
    sqlite_sql = translate_mysql_to_sqlite(sql_text)

    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.executescript(sqlite_sql)

    fk_violations = conn.execute("PRAGMA foreign_key_check;").fetchall()
    assert_true(len(fk_violations) == 0, f"Foreign key violations in seed data: {fk_violations}")

    counts = {
        tbl: conn.execute(f"SELECT COUNT(*) FROM `{tbl}`").fetchone()[0]
        for tbl in ("t_movies", "t_user", "t_theater", "t_offer", "t_seat", "theater_movie", "movie_offer")
    }
    assert_true(counts["t_movies"] == 7, f"Expected 7 seed movies, got {counts['t_movies']}")
    assert_true(counts["t_theater"] == 6, f"Expected 6 seed theaters, got {counts['t_theater']}")
    assert_true(counts["t_offer"] == 5, f"Expected 5 seed offers, got {counts['t_offer']}")
    assert_true(counts["t_user"] == 1, f"Expected 1 seed user, got {counts['t_user']}")
    assert_true(counts["theater_movie"] == 42, f"Expected 42 theater_movie rows, got {counts['theater_movie']}")
    assert_true(counts["movie_offer"] == 35, f"Expected 35 movie_offer rows, got {counts['movie_offer']}")

    pwd = conn.execute("SELECT login_pwd FROM t_user WHERE user_code = 1").fetchone()[0]
    assert_true(pwd.startswith("$2y$10$") and len(pwd) == 60, f"Seed password is not valid bcrypt: {pwd}")

    # Verify every seeded image path resolves case-sensitively from public/pages/
    for tbl in ("t_movies", "t_theater", "t_offer"):
        for (img_rel,) in conn.execute(f"SELECT img FROM `{tbl}`").fetchall():
            clean = img_rel.lstrip("./")
            while clean.startswith("../"):
                clean = clean[3:]
            assert_case_exact_path(ROOT / "public" / clean, f"SQL seed {tbl}.img='{img_rel}'")

    try:
        conn.execute(
            "INSERT INTO t_seat (movie_code, user_code, date, time, seat_num, seat_zone, theater_code) "
            "VALUES (2, NULL, '2026-11-23', '09:30 AM', 'A4', 1, 1)"
        )
        raise AssertionError("uk_seat_booking failed to reject duplicate seat!")
    except sqlite3.IntegrityError:
        pass

    conn.close()
    print(f"[PASS] SQL schema, FK constraints & 18 seed image paths verified ({counts})")


def strip_php_comments_and_strings(code: str) -> str:
    pattern = re.compile(
        r"//.*?$|#.*?$|/\*.*?\*/|'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"",
        re.S | re.M,
    )
    return pattern.sub("''", code)


def verify_php_and_security_contracts() -> None:
    php_files = sorted(
        list((ROOT / "application").rglob("*.php"))
        + list((ROOT / "config").rglob("*.php"))
        + list((ROOT / "route").rglob("*.php"))
        + [ROOT / "public" / "index.php", ROOT / "public" / "router.php", ROOT / "think"]
    )
    assert_true(len(php_files) == 23, f"Expected 23 PHP files (22 .php + think CLI), found {len(php_files)}")

    controller_methods: dict[tuple[str, str], set[str]] = {}
    dangerous_re = re.compile(r"\b(?:eval|exec|shell_exec|system|passthru|proc_open|popen)\s*\(")
    bare_mb_re = re.compile(r"\bmb_(?:strlen|substr|strtolower|strtoupper|strpos)\s*\(")

    for path in php_files:
        content = path.read_text(encoding="utf-8")
        assert_true("<?php" in content[:40], f"{path} must contain <?php opening tag")
        assert_true("888888" not in content, f"Hardcoded reset code 888888 found in {path}!")
        stripped = strip_php_comments_and_strings(content)

        for open_ch, close_ch in (("{", "}"), ("(", ")"), ("[", "]")):
            assert_true(
                stripped.count(open_ch) == stripped.count(close_ch),
                f"Unbalanced {open_ch}{close_ch} in {path}",
            )

        assert_true(dangerous_re.search(stripped) is None, f"Dangerous shell/eval call found in {path}")
        assert_true(bare_mb_re.search(stripped) is None, f"Unprotected bare mb_* call found in {path}")

        rel = path.relative_to(ROOT)
        if rel.parts[0] == "application" and len(rel.parts) == 4 and rel.parts[2] == "controller":
            module = rel.parts[1].lower()
            ctrl = path.stem.lower()
            expected_ns = f"namespace app\\{rel.parts[1]}\\controller;"
            assert_true(expected_ns in content, f"Missing {expected_ns} in {path}")
            methods = {m.lower() for m in re.findall(r"public\s+function\s+(\w+)\s*\(", content)}
            controller_methods[(module, ctrl)] = methods

            if module == "admin" and ctrl not in ("auth", "baseadmin"):
                assert_true(
                    "extends BaseAdmin" in content,
                    f"Admin controller {path} must extend BaseAdmin",
                )

    app_cfg = (ROOT / "config/app.php").read_text(encoding="utf-8")
    cookie_cfg = (ROOT / "config/cookie.php").read_text(encoding="utf-8")
    session_cfg = (ROOT / "config/session.php").read_text(encoding="utf-8")
    assert_true("Asia/Kuala_Lumpur" in app_cfg, "config/app.php must set Asia/Kuala_Lumpur timezone")
    assert_true("'samesite'" in cookie_cfg and "Lax" in cookie_cfg, "config/cookie.php missing samesite Lax")
    assert_true("'samesite'" in session_cfg and "Lax" in session_cfg, "config/session.php missing samesite Lax")

    api_ctrl_src = (ROOT / "application/common/controller/ApiController.php").read_text(encoding="utf-8")
    for helper_sig in (
        "function parsePositiveInt(",
        "function parseFiniteFloat(",
        "function rawStrParam(",
        "function isValidIsoDate(",
        "function optionalIdWithDefault(",
        "function applyDateWindow(",
        "function sanitizeCsvCell(",
        "function formatCsvRow(",
        "function verifySameOrigin(",
        "function roundCents(",
    ):
        assert_true(helper_sig in api_ctrl_src, f"ApiController.php missing {helper_sig}")
    assert_true(re.search(r"MAX_PASSWORD_BYTES\s*=\s*72", api_ctrl_src) is not None, "ApiController.php missing MAX_PASSWORD_BYTES = 72")
    assert_true("function textSub(" not in api_ctrl_src, "Dead ApiController::textSub helper should remain removed")

    base_admin_src = (ROOT / "application/admin/controller/BaseAdmin.php").read_text(encoding="utf-8")
    assert_true(
        "$clientToken === '' ||" not in base_admin_src and "hash_equals($sessionToken, $clientToken)" in base_admin_src,
        "BaseAdmin.php CSRF short-circuit vulnerability not remediated!",
    )
    for admin_helper in (
        "function resolveValidIds(",
        "function queryRelationIds(",
        "function mapRelationIds(",
        "function syncScheduleRows(",
        "function syncMovieOfferRows(",
        "function mergeExistingPayload(",
        "function csvResponse(",
    ):
        assert_true(admin_helper in base_admin_src, f"BaseAdmin.php missing shared {admin_helper}")

    for admin_ctrl_name in ("Movie.php", "Theater.php", "Offer.php"):
        ctrl_src = (ROOT / "application/admin/controller" / admin_ctrl_name).read_text(encoding="utf-8")
        assert_true(
            "$this->resolveValidIds(" in ctrl_src and "$this->mapRelationIds(" in ctrl_src,
            f"{admin_ctrl_name} must delegate relation handling to BaseAdmin helpers",
        )
        assert_true(
            "function syncMovieOffers(" not in ctrl_src and "function syncOfferMovies(" not in ctrl_src,
            f"{admin_ctrl_name} retains duplicate private movie_offer sync method",
        )

    admin_user_src = (ROOT / "application/admin/controller/User.php").read_text(encoding="utf-8")
    safe_match = re.search(r"SAFE_FIELDS\s*=\s*'([^']+)'", admin_user_src)
    assert_true(safe_match is not None and "login_pwd" not in safe_match.group(1), "Admin User leaked login_pwd!")

    seat_src = (ROOT / "application/movie/controller/Seat.php").read_text(encoding="utf-8")
    assert_true(
        "?: $this->idParam('user_code')" not in seat_src and "$this->idParam('user_code') ?:" not in seat_src,
        "Seat.php still trusts client-supplied user_code fallback!",
    )

    # Verify 3-way route & helper parity: Frontend <-> PHP Controllers <-> mock_thinkphp_server.py
    mock_src = (ROOT / "tests/mock_thinkphp_server.py").read_text(encoding="utf-8")
    for mock_sig in (
        "def is_valid_iso_date(",
        "def parse_positive_int(",
        "def scalar_str(",
        "def sanitize_csv_cell(",
        "def round_cents(",
        "def _verify_same_origin(",
        "def _rotate_session(",
    ):
        assert_true(mock_sig in mock_src, f"mock_thinkphp_server.py missing 1:1 {mock_sig} parity")
    assert_true(re.search(r"MAX_PASSWORD_BYTES\s*=\s*72", mock_src) is not None, "mock_thinkphp_server.py missing MAX_PASSWORD_BYTES = 72")
    assert_true("(4300, 4399)" in mock_src, "mock_thinkphp_server.py must bind strictly within 4300-4399")
    mock_routes = set(re.findall(r'route\s*==\s*"([a-z0-9_]+/[a-z0-9_]+/[a-z0-9_]+)"', mock_src))

    all_php_routes = {
        f"{mod}/{ctrl}/{m}"
        for (mod, ctrl), methods in controller_methods.items()
        if (mod, ctrl) not in (("common", "apicontroller"), ("admin", "baseadmin"), ("index", "index"))
        for m in methods
        if not m.startswith("__") and (mod, ctrl, m) not in (("admin", "baseadmin", "checksession"), ("admin", "baseadmin", "hasadminsession"))
    }
    assert_true(
        all_php_routes == mock_routes,
        f"PHP <-> Mock server route mismatch! Only in PHP: {all_php_routes - mock_routes}, Only in Mock: {mock_routes - all_php_routes}",
    )

    frontend_files = sorted(list((ROOT / "public").rglob("*.js")) + list((ROOT / "public").rglob("*.html")))
    endpoint_re = re.compile(r"/index\.php/([a-zA-Z0-9_]+)/([a-zA-Z0-9_]+)/([a-zA-Z0-9_]+)")
    referenced_endpoints = set()
    for fpath in frontend_files:
        txt = fpath.read_text(encoding="utf-8")
        assert_true("888888" not in txt, f"Hardcoded 888888 reference found in {fpath}!")
        for mod, ctrl, act in endpoint_re.findall(txt):
            referenced_endpoints.add((mod.lower(), ctrl.lower(), act.lower(), fpath.relative_to(ROOT)))

    assert_true(len(referenced_endpoints) >= 20, "Too few API endpoints discovered")
    for mod, ctrl, act, src_file in sorted(referenced_endpoints):
        methods = controller_methods.get((mod, ctrl), set())
        assert_true(
            act in methods,
            f"Broken API route /index.php/{mod}/{ctrl}/{act} referenced in {src_file} (available: {methods})",
        )

    print(
        f"[PASS] {len(php_files)} PHP files (22 .php + think CLI), {len(all_php_routes)} 1:1 PHP<->Mock routes & "
        f"{len(referenced_endpoints)} frontend->backend contracts verified"
    )


def verify_js_html_css_and_binaries() -> None:
    js_files = sorted((ROOT / "public" / "js").rglob("*.js"))
    used_fa_icons: set[str] = set()
    fa_token_re = re.compile(r"\bfa-([a-z0-9-]+)\b")
    allowed_window_exports = {
        "CineTicket",
        "AdminApp",
        "toggleDarkMode",
        "showToast",
        "showNotification",
        "clickEmailUs",
        "clickCallUs",
        "clickLink",
    }

    common_js_src = (ROOT / "public/js/common.js").read_text(encoding="utf-8")
    for common_fn in (
        "function sanitizeRedirectPath(",
        "function isValidPasswordBytes(",
        "function parseSeatCodes(",
        "function activatePill(",
        "function bindTabList(",
        "function renderStateCard(",
    ):
        assert_true(common_fn in common_js_src, f"public/js/common.js missing {common_fn}")

    admin_js_src = (ROOT / "public/js/admin/admin.js").read_text(encoding="utf-8")
    assert_true("function sanitizeCsvCell(" in admin_js_src, "public/js/admin/admin.js missing sanitizeCsvCell")
    assert_true("function getQueryId(" in admin_js_src, "public/js/admin/admin.js missing getQueryId")

    for jf in js_files:
        proc = subprocess.run(["node", "--check", str(jf)], capture_output=True, text=True)
        assert_true(proc.returncode == 0, f"JS syntax error in {jf}: {proc.stderr}")
        js_txt = jf.read_text(encoding="utf-8")
        assert_true(re.search(r'href=["\']#["\']', js_txt) is None, f"Dead href='#' link found in {jf}")
        for win_prop in re.findall(r"\bwindow\.([A-Za-z0-9_$]+)\s*=(?!=)", js_txt):
            assert_true(
                win_prop in allowed_window_exports,
                f"Unused/leaked global window.{win_prop} assignment found in {jf.relative_to(ROOT)}",
            )
        for tok in fa_token_re.findall(js_txt):
            if tok != "spin":
                used_fa_icons.add(f"fa-{tok}")

    html_files = sorted((ROOT / "public").rglob("*.html"))
    assert_true(len(html_files) == 32, f"Expected 32 HTML pages, found {len(html_files)}")
    inline_script_count = 0
    local_ref_count = 0
    ext_asset_re = re.compile(r"<(?:link|script)\b[^>]*(?:href|src)=[\"']https?://", re.I)

    for hf in html_files:
        txt = hf.read_text(encoding="utf-8")
        assert_true(re.search(r'href=["\']#["\']', txt) is None, f"Dead href='#' link found in {hf}")
        assert_true(
            ext_asset_re.search(txt) is None,
            f"External CDN stylesheet/script tag found in offline build: {hf}",
        )
        for tok in fa_token_re.findall(txt):
            if tok != "spin":
                used_fa_icons.add(f"fa-{tok}")

        for script_match in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", txt, re.S | re.I):
            code = script_match.group(1).strip()
            if not code:
                continue
            inline_script_count += 1
            with tempfile.NamedTemporaryFile(
                "w", prefix="cinetix_inline_", suffix=".js", dir="/tmp", delete=False, encoding="utf-8"
            ) as tmp:
                tmp.write(code)
                tmp_path = tmp.name
            try:
                proc = subprocess.run(["node", "--check", tmp_path], capture_output=True, text=True)
                assert_true(proc.returncode == 0, f"Inline JS syntax error in {hf}:\n{proc.stderr}")
            finally:
                os.unlink(tmp_path)

        for attr_val in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', txt):
            val = attr_val.strip()
            if (
                not val
                or val.startswith("#")
                or val.startswith("http://")
                or val.startswith("https://")
                or val.startswith("mailto:")
                or val.startswith("tel:")
                or val.startswith("javascript:")
                or "${" in val
                or "' +" in val
            ):
                continue
            clean_target = val.split("?")[0].split("#")[0]
            if not clean_target:
                continue
            resolved = (hf.parent / clean_target).resolve()
            local_ref_count += 1
            assert_case_exact_path(resolved, f"'{val}' in {hf.relative_to(ROOT)}")

    header_css_txt = (ROOT / "public/css/common/header.css").read_text(encoding="utf-8")
    defined_fa_icons = {f"fa-{m}" for m in re.findall(r"\.fa-([a-z0-9-]+)::before", header_css_txt)}
    missing_icons = sorted(used_fa_icons - defined_fa_icons)
    assert_true(
        len(missing_icons) == 0,
        f"Icon classes used in HTML/JS but missing offline CSS glyph rules in header.css: {missing_icons}",
    )
    assert_true(":focus-visible" in header_css_txt, "Missing :focus-visible rules in header.css")
    assert_true("prefers-reduced-motion" in header_css_txt, "Missing prefers-reduced-motion media query in header.css")

    theater_css_txt = (ROOT / "public/css/theater/theater.css").read_text(encoding="utf-8")
    assert_true(".theater-distance-pill" in theater_css_txt, "Missing .theater-distance-pill rule in theater.css")

    admin_css_txt = (ROOT / "public/css/admin/admin.css").read_text(encoding="utf-8")
    assert_true("position: sticky" in admin_css_txt and "@media print" in admin_css_txt, "Missing sticky thead or @media print in admin.css")

    for scroll_css in ("public/css/booking3/booking3.css", "public/css/pay/pay.css", "public/css/about/about.css"):
        sc_txt = (ROOT / scroll_css).read_text(encoding="utf-8")
        assert_true("max-height: calc(100vh -" in sc_txt, f"Missing viewport-safe max-height in {scroll_css}")

    css_files = sorted((ROOT / "public" / "css").rglob("*.css"))
    assert_true(len(css_files) == 14, f"Expected 14 CSS files, found {len(css_files)}")
    defined_css_vars: set[str] = set()
    used_css_vars: set[str] = set()
    for cf in css_files:
        raw = cf.read_text(encoding="utf-8")
        no_comments = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
        defined_css_vars.update(re.findall(r"(--[a-zA-Z0-9_-]+)\s*:", no_comments))
        used_css_vars.update(re.findall(r"var\((--[a-zA-Z0-9_-]+)", no_comments))
        assert_true(
            no_comments.count("{") == no_comments.count("}"),
            f"Unbalanced CSS braces in {cf}",
        )
        assert_true(
            "background-color: transparent !important" not in no_comments,
            f"Destructive universal transparent background override found in {cf}",
        )
        if cf.name not in ("dark-mode.css", "header.css"):
            assert_true(
                "body.dark-mode" not in no_comments,
                f"Unconsolidated duplicate body.dark-mode rule found in {cf}",
            )

    assert_true(
        len(used_css_vars - defined_css_vars) == 0,
        f"Undefined CSS custom properties referenced: {sorted(used_css_vars - defined_css_vars)}",
    )
    assert_true(
        len(defined_css_vars - used_css_vars) == 0,
        f"Unused dead CSS custom properties defined: {sorted(defined_css_vars - used_css_vars)}",
    )

    binary_files = [ROOT / "public" / "favicon.ico"] + sorted(
        p for p in (ROOT / "public" / "img").rglob("*") if p.is_file()
    )
    assert_true(len(binary_files) == 39, f"Expected 39 binary assets, found {len(binary_files)}")
    for bf in binary_files:
        assert_true(bf.stat().st_size > 0, f"Zero-byte binary asset: {bf}")
        with Image.open(bf) as img:
            img.verify()

    # Verify zero __pycache__, .pyc, temporary .db, or log artifacts inside repository
    stray_artifacts = (
        list(ROOT.rglob("__pycache__"))
        + list(ROOT.rglob("*.pyc"))
        + list(ROOT.rglob("*.db"))
        + list(ROOT.rglob("*.sqlite*"))
    )
    assert_true(len(stray_artifacts) == 0, f"Temporary/bytecode artifacts found inside repo: {stray_artifacts}")

    print(
        f"[PASS] {len(js_files)} JS modules, {inline_script_count} inline scripts, "
        f"{len(html_files)} HTML pages ({local_ref_count} case-exact refs, 0 CDN links, 0 href='#'), "
        f"{len(css_files)} CSS stylesheets ({len(defined_css_vars)} clean tokens, {len(defined_fa_icons)} offline icon glyphs), "
        f"and {len(binary_files)} binary images verified"
    )


def main() -> int:
    verify_sql_schema_and_seed_assets()
    verify_php_and_security_contracts()
    verify_js_html_css_and_binaries()
    print("ALL STATIC, SECURITY & CONTRACT AUDITS PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
