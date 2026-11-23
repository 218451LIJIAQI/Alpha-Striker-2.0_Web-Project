#!/usr/bin/env python3
"""
Static & Relational Contract Audit Suite for CineTicket (Alpha Striker 2.0).
Verifies:
1. movies.sql relational schema, foreign keys, unique constraints, and seed rows in SQLite (PRAGMA foreign_keys=ON).
2. PHP controller syntax structure, balanced delimiters, BaseAdmin inheritance, and 1-to-1 route/method mapping.
3. JavaScript syntax across all external .js files and inline HTML <script> blocks via `node --check`.
4. HTML local asset integrity (<img src>, <link href>, <script src>, <a href>) with zero broken local paths.
5. CSS brace balance and absence of destructive global !important overrides.
"""

from __future__ import annotations

import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

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


def verify_sql_schema() -> None:
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

    try:
        conn.execute(
            "INSERT INTO t_seat (movie_code, user_code, date, time, seat_num, seat_zone, theater_code) "
            "VALUES (2, NULL, '2026-11-23', '09:30 AM', 'A4', 1, 1)"
        )
        raise AssertionError("uk_seat_booking failed to reject duplicate seat!")
    except sqlite3.IntegrityError:
        pass

    conn.execute(
        "INSERT INTO t_seat (movie_code, user_code, date, time, seat_num, seat_zone, theater_code) "
        "VALUES (1, NULL, '2026-11-25', '08:00 PM', 'H12', 1, 1)"
    )

    conn.close()
    print(f"[PASS] SQL schema & relational constraints verified ({counts})")


def strip_php_comments_and_strings(code: str) -> str:
    pattern = re.compile(
        r"//.*?$|#.*?$|/\*.*?\*/|'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"",
        re.S | re.M,
    )
    return pattern.sub("''", code)


def verify_php_contracts() -> None:
    php_files = sorted(
        list((ROOT / "application").rglob("*.php"))
        + list((ROOT / "config").rglob("*.php"))
        + list((ROOT / "route").rglob("*.php"))
        + [ROOT / "public" / "index.php", ROOT / "public" / "router.php"]
    )
    assert_true(len(php_files) > 0, "No PHP files found")

    controller_methods: dict[tuple[str, str], set[str]] = {}

    for path in php_files:
        content = path.read_text(encoding="utf-8")
        assert_true(content.startswith("<?php"), f"{path} must start with <?php")
        stripped = strip_php_comments_and_strings(content)

        for open_ch, close_ch in (("{", "}"), ("(", ")"), ("[", "]")):
            assert_true(
                stripped.count(open_ch) == stripped.count(close_ch),
                f"Unbalanced {open_ch}{close_ch} in {path}",
            )

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

    admin_user_src = (ROOT / "application/admin/controller/User.php").read_text(encoding="utf-8")
    safe_match = re.search(r"SAFE_FIELDS\s*=\s*'([^']+)'", admin_user_src)
    assert_true(safe_match is not None and "login_pwd" not in safe_match.group(1), "Admin User leaked login_pwd!")

    frontend_files = sorted(list((ROOT / "public").rglob("*.js")) + list((ROOT / "public").rglob("*.html")))
    endpoint_re = re.compile(r"/index\.php/([a-zA-Z0-9_]+)/([a-zA-Z0-9_]+)/([a-zA-Z0-9_]+)")
    referenced_endpoints = set()
    for fpath in frontend_files:
        txt = fpath.read_text(encoding="utf-8")
        for mod, ctrl, act in endpoint_re.findall(txt):
            referenced_endpoints.add((mod.lower(), ctrl.lower(), act.lower(), fpath.relative_to(ROOT)))

    assert_true(len(referenced_endpoints) >= 15, "Too few API endpoints discovered")
    for mod, ctrl, act, src_file in sorted(referenced_endpoints):
        methods = controller_methods.get((mod, ctrl), set())
        assert_true(
            act in methods,
            f"Broken API route /index.php/{mod}/{ctrl}/{act} referenced in {src_file} (available: {methods})",
        )

    print(f"[PASS] {len(php_files)} PHP files & {len(referenced_endpoints)} frontend->backend route contracts verified")


def verify_js_and_html_assets() -> None:
    js_files = sorted((ROOT / "public" / "js").rglob("*.js"))
    for jf in js_files:
        proc = subprocess.run(["node", "--check", str(jf)], capture_output=True, text=True)
        assert_true(proc.returncode == 0, f"JS syntax error in {jf}: {proc.stderr}")

    html_files = sorted((ROOT / "public").rglob("*.html"))
    inline_script_count = 0
    local_ref_count = 0

    for hf in html_files:
        txt = hf.read_text(encoding="utf-8")
        for script_match in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", txt, re.S | re.I):
            code = script_match.group(1).strip()
            if not code:
                continue
            inline_script_count += 1
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as tmp:
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
            assert_true(resolved.is_file(), f"Broken local asset/link '{val}' in {hf.relative_to(ROOT)} -> {resolved}")

    css_files = sorted((ROOT / "public" / "css").rglob("*.css"))
    for cf in css_files:
        raw = cf.read_text(encoding="utf-8")
        no_comments = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
        assert_true(
            no_comments.count("{") == no_comments.count("}"),
            f"Unbalanced CSS braces in {cf}",
        )
        assert_true(
            "background-color: transparent !important" not in no_comments,
            f"Destructive universal transparent background override found in {cf}",
        )

    print(
        f"[PASS] {len(js_files)} JS modules, {inline_script_count} inline scripts, "
        f"{len(html_files)} HTML pages ({local_ref_count} local refs), and {len(css_files)} CSS stylesheets verified"
    )


def main() -> int:
    verify_sql_schema()
    verify_php_contracts()
    verify_js_and_html_assets()
    print("ALL STATIC & CONTRACT AUDITS PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
