#!/usr/bin/env python3
"""
1:1 SQLite-Backed ThinkPHP 5.1 Contract Server for End-to-End & Concurrency Verification.
Mirrors every PHP controller in `application/` line-for-line:
- Bcrypt ($2y$10$) password & reset-code hashing, session rotation, and full logout destruction
- Strict non-empty constant-time X-Admin-Token / Bearer CSRF enforcement (401 unauthenticated vs 403 CSRF missing/invalid)
- Authoritative Session::get('user_id') enforcement in Seat (401 guest view/cancel, 403 IDOR/guest ticket cancel, NULL guest user_code)
- Thread-safe transactional seat locking (`BEGIN IMMEDIATE` + `uk_seat_booking` IntegrityError -> rollback -> 409 with conflict_seats)
- Unified promo validation (`offer_validity`, `user_code` ownership, `movie_offer` applicability & date range) and authoritative checkout pricing
- Full Admin CRUD across Movie, Theater, Offer, Seat, and User with exact UTF-8 field length, calendar date, numeric range, and 409 conflict parity
"""

from __future__ import annotations

import crypt
import datetime as dt
import hmac
import json
import math
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.parse
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from static_audit import ROOT, translate_mysql_to_sqlite

PUBLIC_DIR = ROOT / "public"
SERVICE_FEE = 2.50
GROUP_DISCOUNT_MIN_SEATS = 5
GROUP_DISCOUNT_RATE = 0.30
MAX_SEATS_PER_ORDER = 10
MAX_RESET_ATTEMPTS = 5
ALLOWED_PAYMENT_METHODS = {"card", "paypal", "applepay", "googlepay"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def hash_password_bcrypt(password: str) -> str:
    salt = crypt.mksalt(crypt.METHOD_BLOWFISH, rounds=1024).replace("$2b$", "$2y$", 1)
    return crypt.crypt(password, salt)


def verify_password_bcrypt(password: str, stored_hash: str) -> bool:
    if not stored_hash:
        return False
    if stored_hash.startswith(("$2y$", "$2b$", "$2a$")):
        computed = crypt.crypt(password, stored_hash)
        return hmac.compare_digest(computed, stored_hash)
    return hmac.compare_digest(stored_hash, password)


def escape_like(keyword: str) -> str:
    return keyword.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def is_valid_iso_date(val: str) -> bool:
    s = str(val or "").strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return False
    try:
        dt.date.fromisoformat(s)
        return True
    except ValueError:
        return False


def parse_finite_float(raw) -> float | None:
    if raw is None or isinstance(raw, (bool, list, dict)):
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        v = float(s)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def normalize_id_array(raw) -> list[int]:
    if isinstance(raw, str):
        raw = [] if not raw.strip() else raw.split(",")
    if not isinstance(raw, list):
        return []
    seen: dict[int, int] = {}
    for item in raw:
        if isinstance(item, bool):
            continue
        try:
            val = int(str(item).strip())
            if val > 0:
                seen[val] = val
        except (TypeError, ValueError):
            continue
    return list(seen.values())


def resolve_valid_ids(db: sqlite3.Connection, table: str, pk: str, raw) -> list[int]:
    cand = normalize_id_array(raw)
    if not cand:
        return []
    ph = ",".join("?" for _ in cand)
    rows = db.execute(f"SELECT {pk} FROM {table} WHERE {pk} IN ({ph}) ORDER BY {pk} ASC", cand).fetchall()
    return [int(r[pk]) for r in rows]


def calculate_pricing(unit_price: float, seat_count: int, promo_money: float = 0.0) -> dict:
    count = max(0, int(seat_count))
    unit = round(max(0.0, float(unit_price)), 2)
    subtotal = round(unit * count, 2)
    group_discount = round(subtotal * GROUP_DISCOUNT_RATE, 2) if count >= GROUP_DISCOUNT_MIN_SEATS else 0.0
    promo_discount = round(max(0.0, float(promo_money)), 2)
    total_discount = round(group_discount + promo_discount, 2)
    service_fee = SERVICE_FEE if count > 0 else 0.0
    total_amount = max(0.0, round(subtotal - total_discount + service_fee, 2))
    return {
        "unit_price": unit,
        "seat_count": count,
        "subtotal": subtotal,
        "group_discount": group_discount,
        "promo_discount": promo_discount,
        "total_discount": total_discount,
        "service_fee": service_fee,
        "total_amount": total_amount,
    }


class ContractState:
    def __init__(self) -> None:
        self.db_lock = threading.RLock()
        self.session_lock = threading.RLock()
        self.conn = sqlite3.connect(":memory:", check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON;")
        sql_text = (ROOT / "movies.sql").read_text(encoding="utf-8")
        self.conn.executescript(translate_mysql_to_sqlite(sql_text))
        self.sessions: dict[str, dict] = {}
        # Simulated server-side mail delivery sink (not exposed via HTTP unless CINETIX_EXPOSE_RESET_CODE=1)
        self.mail_outbox: dict[str, str] = {}


def rows_to_dicts(rows) -> list[dict]:
    return [dict(r) for r in rows]


def validate_promo_for_context(
    db: sqlite3.Connection,
    raw_code: str,
    movie_code: int = 0,
    session_user_id: int = 0,
    screening_date: str = "",
) -> dict:
    code = str(raw_code or "").strip().upper()
    if not code:
        return {"valid": False, "status": 200, "message": "Promo code is required", "offer": None}

    offer_row = db.execute(
        "SELECT offer_code, offer_title, offer_type, promo_code, offer_validity, badge, money, user_code "
        "FROM t_offer WHERE promo_code = ?",
        (code,),
    ).fetchone()
    if not offer_row:
        return {"valid": False, "status": 200, "message": "Invalid promo code", "offer": None}

    offer = dict(offer_row)
    today = dt.date.today().isoformat()
    validity = str(offer.get("offer_validity") or "").strip()
    if is_valid_iso_date(validity) and validity < today:
        return {"valid": False, "status": 200, "message": "This promo code has expired", "offer": None}

    owner_uid = int(offer["user_code"]) if offer.get("user_code") is not None else 0
    caller_uid = int(session_user_id or 0)
    if owner_uid > 0:
        if caller_uid <= 0:
            return {
                "valid": False,
                "status": 401,
                "message": "Please sign in to redeem this member-exclusive promo code",
                "offer": None,
            }
        if caller_uid != owner_uid:
            return {
                "valid": False,
                "status": 403,
                "message": "This promo code belongs to another member account",
                "offer": None,
            }

    target_mid = int(movie_code or 0)
    if target_mid > 0:
        link = db.execute(
            "SELECT * FROM movie_offer WHERE movie_code = ? AND offer_code = ?",
            (target_mid, int(offer["offer_code"])),
        ).fetchone()
        if not link:
            return {
                "valid": False,
                "status": 200,
                "message": "This promo code is not applicable to the selected movie",
                "offer": None,
            }
        check_date = screening_date if is_valid_iso_date(screening_date or "") else today
        if link["valid_from"] and check_date < link["valid_from"]:
            return {
                "valid": False,
                "status": 200,
                "message": "This promo code is not yet active for the selected date",
                "offer": None,
            }
        if link["valid_to"] and check_date > link["valid_to"]:
            return {
                "valid": False,
                "status": 200,
                "message": "This promo code is not valid for the selected screening date",
                "offer": None,
            }

    safe_offer = {
        "offer_code": int(offer["offer_code"]),
        "offer_title": offer["offer_title"],
        "offer_type": offer["offer_type"],
        "promo_code": offer["promo_code"],
        "offer_validity": offer["offer_validity"],
        "badge": offer["badge"],
        "money": round(float(offer["money"]), 2),
        "user_code": owner_uid if owner_uid > 0 else None,
    }
    return {"valid": True, "status": 200, "message": "Promo code applied", "offer": safe_offer}


def prepare_movie_data(p: dict) -> tuple[dict | None, str | None]:
    def s(k: str) -> str:
        v = p.get(k)
        return "" if v is None or isinstance(v, (list, dict)) else str(v).strip()

    mname = s("movie_name")
    mtype = s("movie_type")
    mimg = s("img")
    mtimes = s("times")
    mtag = s("tag")

    if not mname or len(mname) > 200:
        return None, "Movie title (1-200 characters) is required"
    if not mtype or len(mtype) > 50:
        return None, "Movie genre (1-50 characters) is required"
    if not mimg or len(mimg) > 500:
        return None, "Poster image path or URL (1-500 characters) is required"
    if not mtimes or len(mtimes) > 50:
        return None, "Movie duration (1-50 characters) is required"
    if len(mtag) > 50:
        return None, "Highlight badge must be 50 characters or fewer"

    star_val = parse_finite_float(p.get("star"))
    if star_val is None or star_val < 0 or star_val > 5:
        return None, "Rating must be between 0.0 and 5.0"

    money_val = parse_finite_float(p.get("money"))
    if money_val is None or money_val < 0:
        return None, "Ticket price must be a non-negative number"

    return {
        "movie_name": mname,
        "tag": mtag if mtag != "" else None,
        "star": round(star_val, 1),
        "movie_type": mtype,
        "img": mimg,
        "money": round(money_val, 2),
        "times": mtimes,
    }, None


def prepare_theater_data(p: dict) -> tuple[dict | None, str | None]:
    def s(k: str) -> str:
        v = p.get(k)
        return "" if v is None or isinstance(v, (list, dict)) else str(v).strip()

    tname = s("theater_name")
    taddr = s("address")
    timg = s("img")
    tam = s("amenity")
    trev = s("reviews")
    tdist = s("distance")
    tid_str = s("theater_id")

    if not tname or len(tname) > 200:
        return None, "Theater name (1-200 characters) is required"
    if not taddr or len(taddr) > 500:
        return None, "Theater address (1-500 characters) is required"
    if not timg or len(timg) > 500:
        return None, "Theater image path or URL (1-500 characters) is required"
    if len(tam) > 500:
        return None, "Amenities list must be 500 characters or fewer"
    if len(trev) > 50:
        return None, "Reviews label must be 50 characters or fewer"
    if len(tdist) > 50:
        return None, "Distance label must be 50 characters or fewer"
    if len(tid_str) > 100:
        return None, "Theater code label must be 100 characters or fewer"

    raw_star = p.get("star")
    star_val = 4.8 if (raw_star is None or str(raw_star).strip() == "") else parse_finite_float(raw_star)
    if star_val is None or star_val < 0 or star_val > 5:
        return None, "Rating must be between 0.0 and 5.0"

    return {
        "theater_name": tname,
        "address": taddr,
        "amenity": tam or None,
        "star": round(star_val, 1),
        "img": timg,
        "reviews": trev or None,
        "distance": tdist or None,
        "theater_id": tid_str or None,
    }, None


def prepare_offer_data(db: sqlite3.Connection, p: dict, exclude_offer_id: int) -> tuple[dict | None, str | None]:
    def s(k: str) -> str:
        v = p.get(k)
        return "" if v is None or isinstance(v, (list, dict)) else str(v).strip()

    otitle = s("offer_title")
    otype = s("offer_type")
    odesc = s("offer_description")
    ocode = s("promo_code")
    oval = s("offer_validity")
    oimg = s("img")
    obadge = s("badge")

    if not otitle or len(otitle) > 200:
        return None, "Offer title (1-200 characters) is required"
    if not otype or len(otype) > 100:
        return None, "Offer category (1-100 characters) is required"
    if not odesc or len(odesc) > 500:
        return None, "Offer description (1-500 characters) is required"
    if not ocode or len(ocode) > 100:
        return None, "Promo code (1-100 characters) is required"
    if not oval or not is_valid_iso_date(oval):
        return None, "Validity date must use YYYY-MM-DD format"
    if not oimg or len(oimg) > 500:
        return None, "Offer image path or URL (1-500 characters) is required"
    if len(obadge) > 50:
        return None, "Highlight badge must be 50 characters or fewer"

    money_val = parse_finite_float(p.get("money"))
    if money_val is None or money_val < 0:
        return None, "Discount amount must be a non-negative number"

    owner_uid = None
    raw_uc = s("user_code")
    if raw_uc:
        try:
            cand_uid = int(raw_uc)
        except ValueError:
            cand_uid = 0
        if cand_uid > 0:
            if not db.execute("SELECT 1 FROM t_user WHERE user_code = ?", (cand_uid,)).fetchone():
                return None, "Selected exclusive member account does not exist"
            owner_uid = cand_uid

    upper_code = ocode.upper()
    dup = (
        db.execute("SELECT 1 FROM t_offer WHERE promo_code = ? AND offer_code <> ?", (upper_code, exclude_offer_id)).fetchone()
        if exclude_offer_id > 0
        else db.execute("SELECT 1 FROM t_offer WHERE promo_code = ?", (upper_code,)).fetchone()
    )
    if dup:
        return None, "Promo code is already in use by another offer"

    return {
        "offer_title": otitle,
        "offer_type": otype,
        "offer_description": odesc,
        "promo_code": upper_code,
        "offer_validity": oval,
        "img": oimg,
        "badge": obadge or None,
        "money": round(money_val, 2),
        "user_code": owner_uid,
    }, None


def validate_admin_user_input(
    db: sqlite3.Connection,
    name: str,
    email: str,
    password: str,
    require_password: bool,
    exclude_user_id: int,
) -> str | None:
    if not name or len(name) > 50:
        return "Valid username (1-50 characters) is required"
    if not email or not EMAIL_RE.match(email) or len(email) > 100:
        return "Valid email address is required"
    if require_password and len(password) < 6:
        return "Password must be at least 6 characters"
    if not require_password and password != "" and len(password) < 6:
        return "New password must be at least 6 characters"

    dup = (
        db.execute("SELECT 1 FROM t_user WHERE email = ? AND user_code <> ?", (email, exclude_user_id)).fetchone()
        if exclude_user_id > 0
        else db.execute("SELECT 1 FROM t_user WHERE email = ?", (email,)).fetchone()
    )
    if dup:
        return "Email is already registered to another user" if exclude_user_id > 0 else "Email is already registered"
    return None


def make_handler(state: ContractState):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def _get_session(self) -> tuple[str, dict]:
            jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
            sid = jar["PHPSESSID"].value if "PHPSESSID" in jar else ""
            with state.session_lock:
                if not sid or sid not in state.sessions:
                    sid = secrets.token_hex(16)
                    state.sessions[sid] = {}
                return sid, state.sessions[sid]

        def _rotate_session(self, old_sid: str, preserved: dict | None = None) -> tuple[str, dict]:
            with state.session_lock:
                state.sessions.pop(old_sid, None)
                new_sid = secrets.token_hex(16)
                new_sess = dict(preserved) if preserved else {}
                state.sessions[new_sid] = new_sess
                return new_sid, new_sess

        def _destroy_session(self, sid: str) -> None:
            with state.session_lock:
                state.sessions.pop(sid, None)

        def _send_json(self, body: dict, status: int = 200, sid: str | None = None, clear_cookie: bool = False) -> None:
            raw = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            if clear_cookie:
                self.send_header("Set-Cookie", "PHPSESSID=; Path=/; Max-Age=0; HttpOnly")
            elif sid:
                self.send_header("Set-Cookie", f"PHPSESSID={sid}; Path=/; HttpOnly")
            self.end_headers()
            self.wfile.write(raw)

        def _parse_payload(self, query_str: str, path_params: dict | None = None) -> dict:
            params: dict = dict(path_params or {})
            params.update({k: v[-1] for k, v in urllib.parse.parse_qs(query_str, keep_blank_values=True).items()})
            length = int(self.headers.get("Content-Length", "0") or "0")
            if length > 0:
                raw_body = self.rfile.read(length).decode("utf-8", errors="replace")
                ctype = self.headers.get("Content-Type", "")
                if "application/json" in ctype or raw_body.strip().startswith("{"):
                    try:
                        decoded = json.loads(raw_body)
                        if isinstance(decoded, dict):
                            params.update(decoded)
                    except json.JSONDecodeError:
                        pass
                else:
                    form = {k: v[-1] for k, v in urllib.parse.parse_qs(raw_body, keep_blank_values=True).items()}
                    params.update(form)
            return params

        def _has_admin_session(self, session: dict) -> bool:
            tok = str(session.get("admin_token") or "")
            return session.get("admin_auth") is True and tok != ""

        def _extract_admin_token(self) -> str:
            hdr = self.headers.get("X-Admin-Token")
            if hdr and hdr.strip():
                return hdr.strip()
            auth = self.headers.get("Authorization", "")
            if auth.lower().startswith("bearer ") and auth[7:].strip():
                return auth[7:].strip()
            return ""

        def _check_admin_csrf(self, session: dict) -> bool:
            if not self._has_admin_session(session):
                return False
            client_tok = self._extract_admin_token()
            if not client_tok:
                return False
            return hmac.compare_digest(str(session["admin_token"]), client_tok)

        def do_GET(self):
            self._dispatch()

        def do_POST(self):
            self._dispatch()

        def _dispatch(self):
            parsed = urllib.parse.urlparse(self.path)
            path = urllib.parse.unquote(parsed.path)

            if path == "/index.php" or path.startswith("/index.php/"):
                sid, session = self._get_session()
                raw_tail = path[len("/index.php"):]
                if raw_tail.lower().endswith(".html"):
                    raw_tail = raw_tail[:-5]
                parts = [seg for seg in raw_tail.split("/") if seg]
                path_params: dict[str, str] = {}
                if len(parts) > 3:
                    extra = parts[3:]
                    for idx in range(0, len(extra) - 1, 2):
                        path_params[extra[idx]] = extra[idx + 1]
                    if len(extra) == 1:
                        path_params["__direct_arg__"] = extra[0]
                payload = self._parse_payload(parsed.query, path_params)
                self._handle_api(parts, payload, sid, session)
                return

            if path == "/router.php":
                self.send_error(404, "Not found")
                return

            rel = "index.html" if path == "/" else path.lstrip("/")
            file_path = (PUBLIC_DIR / rel).resolve()
            if not str(file_path).startswith(str(PUBLIC_DIR.resolve())) or not file_path.is_file():
                self.send_error(404, f"Not found: {path}")
                return

            mime, _ = mimetypes.guess_type(str(file_path))
            data = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mime or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _id_param(self, p: dict, key: str, default: int = 0, allow_direct: bool = False) -> int:
            raw = p.get("__direct_arg__") if (allow_direct and "__direct_arg__" in p) else p.get(key)
            if raw is None or raw == "" or isinstance(raw, bool):
                return default
            try:
                return int(str(raw).strip())
            except (TypeError, ValueError):
                return 0

        def _optional_id_with_default(self, p: dict, key: str, default_id: int = 1) -> int:
            if key not in p or p[key] is None or p[key] == "":
                return default_id
            raw = p[key]
            if isinstance(raw, (bool, list, dict)):
                return 0
            try:
                return int(str(raw).strip())
            except (TypeError, ValueError):
                return 0

        def _str_param(self, p: dict, key: str, default: str = "") -> str:
            val = p.get(key)
            if val is None or isinstance(val, (list, dict)):
                return default
            return str(val).strip()

        def _handle_api(self, parts: list[str], p: dict, sid: str, session: dict) -> None:
            if not parts:
                raw = b"CineTicket API is running."
                self.send_response(200)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
                return

            route = "/".join(parts[:3]).lower()
            db = state.conn
            now_str = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            today_str = dt.date.today().isoformat()

            # 1. Admin Auth
            if route == "admin/auth/login":
                u = self._str_param(p, "username")
                pw = str(p.get("password") or "")
                if not u or not pw:
                    return self._send_json({"success": False, "message": "Username and password are required"}, 200, sid)
                exp_user = os.environ.get("ADMIN_USERNAME", "admin")
                exp_hash = os.environ.get("ADMIN_PASSWORD_HASH", "")
                exp_pass = os.environ.get("ADMIN_PASSWORD", "admin")
                user_ok = hmac.compare_digest(exp_user, u)
                pass_ok = verify_password_bcrypt(pw, exp_hash) if exp_hash else hmac.compare_digest(exp_pass, pw)
                if not user_ok or not pass_ok:
                    return self._send_json({"success": False, "message": "Invalid username or password"}, 401, sid)

                tok = secrets.token_hex(32)
                new_sid, _ = self._rotate_session(sid, {"admin_auth": True, "admin_token": tok, "admin_user": u})
                return self._send_json(
                    {"success": True, "message": "Login successful", "token": tok, "data": {"admin_id": 1, "username": u, "role": "admin"}},
                    200,
                    new_sid,
                )

            if route == "admin/auth/logout":
                if self._has_admin_session(session) and not self._check_admin_csrf(session):
                    return self._send_json({"success": False, "message": "Forbidden: valid X-Admin-Token header is required"}, 403, sid)
                self._destroy_session(sid)
                return self._send_json({"success": True, "message": "Logout successful", "data": None}, 200, clear_cookie=True)

            if route == "admin/auth/checkauth":
                if not self._has_admin_session(session):
                    return self._send_json({"success": False, "message": "Authentication required"}, 401, sid)
                if not self._check_admin_csrf(session):
                    return self._send_json({"success": False, "message": "Forbidden: valid X-Admin-Token header is required"}, 403, sid)
                return self._send_json(
                    {"success": True, "message": "Authentication valid", "data": {"admin_id": 1, "username": session.get("admin_user", "admin"), "role": "admin"}},
                    200,
                    sid,
                )

            # Enforce BaseAdmin (401 without session, 403 without valid X-Admin-Token)
            if route.startswith("admin/"):
                if not self._has_admin_session(session):
                    return self._send_json({"success": False, "message": "Unauthorized: admin login required"}, 401, sid)
                if not self._check_admin_csrf(session):
                    return self._send_json({"success": False, "message": "Forbidden: valid X-Admin-Token header is required"}, 403, sid)

            # 2. Public Movies
            if route == "movie/movies/getmovielist":
                genre = self._str_param(p, "genre", "all")
                with state.db_lock:
                    if genre and genre.lower() != "all":
                        rows = db.execute(
                            "SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies WHERE movie_type = ? ORDER BY movie_code ASC",
                            (genre,),
                        ).fetchall()
                    else:
                        rows = db.execute(
                            "SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies ORDER BY movie_code ASC"
                        ).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "movie/movies/searchmovies":
                kw = self._str_param(p, "keyword")
                with state.db_lock:
                    if not kw:
                        rows = db.execute("SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies ORDER BY movie_code ASC").fetchall()
                    else:
                        like = f"%{escape_like(kw)}%"
                        rows = db.execute(
                            "SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies "
                            "WHERE movie_name LIKE ? ESCAPE '\\' OR movie_type LIKE ? ESCAPE '\\' OR COALESCE(tag,'') LIKE ? ESCAPE '\\' ORDER BY movie_code ASC",
                            (like, like, like),
                        ).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "movie/movies/getmoviebycode":
                mid = self._id_param(p, "movie_code", allow_direct=True)
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code parameter is required"}, 200, sid)
                with state.db_lock:
                    row = db.execute("SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies WHERE movie_code = ?", (mid,)).fetchone()
                    if not row:
                        return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                    mdata = dict(row)
                    trows = db.execute(
                        "SELECT theater_code FROM theater_movie WHERE movie_code = ? "
                        "AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?) ORDER BY theater_code ASC",
                        (mid, today_str, today_str),
                    ).fetchall()
                    mdata["theater_codes"] = [int(r["theater_code"]) for r in trows]
                return self._send_json({"success": True, "message": "OK", "data": mdata}, 200, sid)

            # 3. Public Theaters
            if route == "theater/theater/gettheaterlist":
                kw = self._str_param(p, "address")
                am = self._str_param(p, "amenity")
                mc = self._id_param(p, "movie_code")
                with state.db_lock:
                    sql = "SELECT theater_code, theater_name, address, amenity, star, img, reviews, distance FROM t_theater WHERE 1=1"
                    args: list = []
                    if mc > 0:
                        t_ids = [
                            int(r["theater_code"])
                            for r in db.execute(
                                "SELECT theater_code FROM theater_movie WHERE movie_code = ? "
                                "AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)",
                                (mc, today_str, today_str),
                            ).fetchall()
                        ]
                        if not t_ids:
                            return self._send_json({"success": True, "message": "OK", "data": []}, 200, sid)
                        placeholders = ",".join("?" for _ in t_ids)
                        sql += f" AND theater_code IN ({placeholders})"
                        args.extend(t_ids)
                    if kw:
                        like_kw = f"%{escape_like(kw)}%"
                        sql += " AND (theater_name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')"
                        args.extend([like_kw, like_kw])
                    if am and am.lower() != "all":
                        sql += " AND amenity LIKE ? ESCAPE '\\'"
                        args.append(f"%{escape_like(am)}%")
                    sql += " ORDER BY theater_code ASC"
                    rows = db.execute(sql, args).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "theater/theater/gettheaterdetails":
                tid = self._id_param(p, "theater_code")
                if tid <= 0:
                    return self._send_json({"success": False, "message": "Valid theater_code parameter is required"}, 200, sid)
                with state.db_lock:
                    trow = db.execute("SELECT * FROM t_theater WHERE theater_code = ?", (tid,)).fetchone()
                    if not trow:
                        return self._send_json({"success": False, "message": "Theater does not exist"}, 404, sid)
                    tdata = dict(trow)
                    mrows = db.execute(
                        "SELECT m.movie_code, m.movie_name, m.star, m.tag, m.money, m.movie_type, m.img, m.times, tm.daily_showtimes "
                        "FROM theater_movie tm JOIN t_movies m ON tm.movie_code = m.movie_code "
                        "WHERE tm.theater_code = ? AND (tm.start_date IS NULL OR tm.start_date <= ?) "
                        "AND (tm.end_date IS NULL OR tm.end_date >= ?) ORDER BY m.movie_code ASC",
                        (tid, today_str, today_str),
                    ).fetchall()
                    tdata["movies"] = rows_to_dicts(mrows)
                return self._send_json({"success": True, "message": "OK", "data": tdata}, 200, sid)

            # 4. Public Offers
            if route == "offer/offer/getofferlist":
                otype = self._str_param(p, "offer_type")
                mc = self._id_param(p, "movie_code")
                sess_uid = int(session.get("user_id") or 0)
                with state.db_lock:
                    sql = "SELECT offer_code, offer_title, offer_description, promo_code, offer_validity, img, badge, money, offer_type, user_code FROM t_offer WHERE "
                    args = []
                    if sess_uid > 0:
                        sql += "(user_code IS NULL OR user_code = ?)"
                        args.append(sess_uid)
                    else:
                        sql += "user_code IS NULL"
                    if otype and otype.lower() != "all":
                        sql += " AND offer_type = ?"
                        args.append(otype)
                    sql += " ORDER BY offer_code ASC"
                    offers = rows_to_dicts(db.execute(sql, args).fetchall())
                    if not offers:
                        return self._send_json({"success": True, "message": "OK", "data": []}, 200, sid)
                    oids = [int(o["offer_code"]) for o in offers]
                    ph = ",".join("?" for _ in oids)
                    links = db.execute(f"SELECT offer_code, movie_code FROM movie_offer WHERE offer_code IN ({ph})", oids).fetchall()
                    mmap: dict[int, list[int]] = {}
                    for lr in links:
                        mmap.setdefault(int(lr["offer_code"]), []).append(int(lr["movie_code"]))
                    filtered = []
                    for o in offers:
                        oid = int(o["offer_code"])
                        linked = sorted(mmap.get(oid, []))
                        o["movie_codes"] = linked
                        o["is_exclusive"] = bool(o.get("user_code"))
                        o.pop("user_code", None)
                        if mc > 0 and mc not in linked:
                            continue
                        filtered.append(o)
                return self._send_json({"success": True, "message": "OK", "data": filtered}, 200, sid)

            if route == "offer/offer/getmoneybybadge":
                code = (self._str_param(p, "badge") or self._str_param(p, "promo_code")).upper()
                mc = self._id_param(p, "movie_code")
                sc = self._id_param(p, "seat_count")
                d = self._str_param(p, "date")
                sess_uid = int(session.get("user_id") or 0)
                with state.db_lock:
                    res = validate_promo_for_context(db, code, mc, sess_uid, d)
                    if not res["valid"]:
                        return self._send_json({"success": False, "message": res["message"]}, res["status"], sid)
                    offer = dict(res["offer"])
                    if mc > 0 and sc > 0:
                        mrow = db.execute("SELECT money FROM t_movies WHERE movie_code = ?", (mc,)).fetchone()
                        if mrow:
                            offer["pricing"] = calculate_pricing(float(mrow["money"]), sc, float(offer["money"]))
                return self._send_json({"success": True, "message": "Promo code applied", "data": offer}, 200, sid)

            # 5. Public Seats (Concurrency-Safe Transaction + Strict Session Identity)
            if route == "movie/seat/getseatlist":
                mc = self._id_param(p, "movie_code")
                tc = self._optional_id_with_default(p, "theater_code", 1)
                d = self._str_param(p, "date")
                t = self._str_param(p, "time")
                if mc <= 0 or tc <= 0 or not is_valid_iso_date(d) or not t:
                    return self._send_json({"success": False, "message": "Valid movie_code, theater_code, date (YYYY-MM-DD), and time are required"}, 200, sid)
                with state.db_lock:
                    rows = db.execute(
                        "SELECT seat_num, seat_zone, theater_code FROM t_seat WHERE movie_code = ? AND theater_code = ? AND date = ? AND time = ? ORDER BY seat_num ASC",
                        (mc, tc, d, t),
                    ).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "movie/seat/saveseats":
                mc = self._id_param(p, "movie_code")
                tc = self._optional_id_with_default(p, "theater_code", 1)
                d = self._str_param(p, "date")
                t = self._str_param(p, "time")
                promo_code = self._str_param(p, "promo_code").upper()
                pay_method = self._str_param(p, "payment_method", "card").lower()
                if pay_method not in ALLOWED_PAYMENT_METHODS:
                    pay_method = "card"

                raw_seats = p.get("seat_nums", [])
                if mc <= 0 or tc <= 0 or not is_valid_iso_date(d) or not t or len(t) > 30 or not raw_seats:
                    return self._send_json({"success": False, "message": "Complete screening and seat parameters are required"}, 200, sid)

                seat_list = raw_seats if isinstance(raw_seats, list) else str(raw_seats).split(",")
                seats: list[str] = []
                for s in seat_list:
                    code = str(s).strip().upper()
                    if not code:
                        continue
                    if not re.match(r"^[A-H](?:[1-9]|1[0-2])$", code):
                        return self._send_json({"success": False, "message": f"Invalid seat coordinate: {code}"}, 200, sid)
                    if code not in seats:
                        seats.append(code)

                if not seats:
                    return self._send_json({"success": False, "message": "At least one valid seat must be selected"}, 200, sid)
                if len(seats) > MAX_SEATS_PER_ORDER:
                    return self._send_json({"success": False, "message": f"Maximum {MAX_SEATS_PER_ORDER} seats allowed per transaction"}, 200, sid)

                # Strictly trust server session user_id ONLY (never client user_code)
                sess_uid = int(session.get("user_id") or 0)

                with state.db_lock:
                    user_code = None
                    if sess_uid > 0:
                        urow = db.execute("SELECT user_code FROM t_user WHERE user_code = ?", (sess_uid,)).fetchone()
                        if urow:
                            user_code = int(urow["user_code"])

                    db.execute("BEGIN IMMEDIATE")
                    try:
                        mrow = db.execute("SELECT movie_code, movie_name, money FROM t_movies WHERE movie_code = ?", (mc,)).fetchone()
                        if not mrow:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Selected movie does not exist"}, 404, sid)

                        trow = db.execute("SELECT theater_code, theater_name FROM t_theater WHERE theater_code = ?", (tc,)).fetchone()
                        if not trow:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Selected theater does not exist"}, 404, sid)

                        sched = db.execute("SELECT * FROM theater_movie WHERE theater_code = ? AND movie_code = ?", (tc, mc)).fetchone()
                        if not sched:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Selected movie is not scheduled at this theater"}, 200, sid)
                        if (sched["start_date"] and d < sched["start_date"]) or (sched["end_date"] and d > sched["end_date"]):
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Selected screening date is outside the theater schedule window"}, 200, sid)

                        promo_money = 0.0
                        applied_promo = None
                        if promo_code:
                            pcheck = validate_promo_for_context(db, promo_code, mc, user_code or 0, d)
                            if not pcheck["valid"]:
                                db.execute("ROLLBACK")
                                return self._send_json({"success": False, "message": pcheck["message"]}, pcheck["status"], sid)
                            promo_money = float(pcheck["offer"]["money"])
                            applied_promo = pcheck["offer"]["promo_code"]

                        pricing = calculate_pricing(float(mrow["money"]), len(seats), promo_money)

                        ph = ",".join("?" for _ in seats)
                        conflicts = [
                            r["seat_num"]
                            for r in db.execute(
                                f"SELECT seat_num FROM t_seat WHERE movie_code=? AND theater_code=? AND date=? AND time=? AND seat_num IN ({ph})",
                                [mc, tc, d, t, *seats],
                            ).fetchall()
                        ]
                        if conflicts:
                            db.execute("ROLLBACK")
                            return self._send_json(
                                {"success": False, "message": "Seats already booked: " + ", ".join(conflicts), "data": {"conflict_seats": conflicts}},
                                409,
                                sid,
                            )

                        for code in seats:
                            zone = 2 if code[0] in ("D", "E") else 1
                            db.execute(
                                "INSERT INTO t_seat (movie_code, theater_code, user_code, date, time, seat_num, seat_zone, create_time) VALUES (?,?,?,?,?,?,?,?)",
                                (mc, tc, user_code, d, t, code, zone, now_str),
                            )
                        db.execute("COMMIT")
                    except sqlite3.IntegrityError:
                        db.execute("ROLLBACK")
                        ph = ",".join("?" for _ in seats)
                        actual_conflicts = [
                            r["seat_num"]
                            for r in db.execute(
                                f"SELECT seat_num FROM t_seat WHERE movie_code=? AND theater_code=? AND date=? AND time=? AND seat_num IN ({ph})",
                                [mc, tc, d, t, *seats],
                            ).fetchall()
                        ] or seats
                        return self._send_json(
                            {"success": False, "message": "Seats already booked: " + ", ".join(actual_conflicts), "data": {"conflict_seats": actual_conflicts}},
                            409,
                            sid,
                        )
                    except Exception:
                        db.execute("ROLLBACK")
                        raise

                receipt_no = f"BK-{d.replace('-', '')}-{secrets.token_hex(3).upper()}"
                return self._send_json(
                    {
                        "success": True,
                        "message": "Booking confirmed",
                        "data": {
                            "receipt_no": receipt_no,
                            "booked_count": len(seats),
                            "seats": seats,
                            "movie_code": mc,
                            "movie_name": mrow["movie_name"],
                            "theater_code": tc,
                            "theater_name": trow["theater_name"],
                            "date": d,
                            "time": t,
                            "promo_code": applied_promo,
                            "payment_method": pay_method,
                            "pricing": pricing,
                        },
                    },
                    200,
                    sid,
                )

            if route == "movie/seat/getseatlistbyusercode":
                sess_uid = int(session.get("user_id") or 0)
                if sess_uid <= 0:
                    return self._send_json({"success": False, "message": "Authentication required to view tickets"}, 401, sid)
                req_uid = self._id_param(p, "user_code")
                if req_uid > 0 and req_uid != sess_uid:
                    return self._send_json({"success": False, "message": "Forbidden: cannot access another user's tickets"}, 403, sid)
                with state.db_lock:
                    srows = rows_to_dicts(
                        db.execute(
                            "SELECT seat_code, movie_code, theater_code, date, time, seat_num, seat_zone, create_time FROM t_seat WHERE user_code = ? ORDER BY seat_code DESC",
                            (sess_uid,),
                        ).fetchall()
                    )
                    for s in srows:
                        mrow = db.execute("SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies WHERE movie_code = ?", (s["movie_code"],)).fetchone()
                        trow = db.execute("SELECT theater_code, theater_name, address FROM t_theater WHERE theater_code = ?", (s["theater_code"] or 1,)).fetchone()
                        s["movie_info"] = dict(mrow) if mrow else None
                        s["theater_info"] = dict(trow) if trow else None
                return self._send_json({"success": True, "message": "OK", "data": srows}, 200, sid)

            if route == "movie/seat/delete":
                sess_uid = int(session.get("user_id") or 0)
                if sess_uid <= 0:
                    return self._send_json({"success": False, "message": "Authentication required to cancel a booking"}, 401, sid)
                seat_id = self._id_param(p, "seat_code", allow_direct=True)
                if seat_id <= 0:
                    return self._send_json({"success": False, "message": "Valid seat_code is required"}, 200, sid)
                with state.db_lock:
                    srow = db.execute("SELECT * FROM t_seat WHERE seat_code = ?", (seat_id,)).fetchone()
                    if not srow:
                        return self._send_json({"success": False, "message": "Ticket record not found"}, 404, sid)
                    owner_uid = int(srow["user_code"]) if srow["user_code"] is not None else 0
                    if owner_uid <= 0 or owner_uid != sess_uid:
                        return self._send_json({"success": False, "message": "Not authorized to cancel this booking"}, 403, sid)
                    db.execute("DELETE FROM t_seat WHERE seat_code = ? AND user_code = ?", (seat_id, sess_uid))
                return self._send_json({"success": True, "message": "Booking cancelled", "data": {"seat_code": seat_id}}, 200, sid)

            # 6. Customer Auth & Password Security
            if route == "user/user/reg":
                name = self._str_param(p, "name")
                email = self._str_param(p, "email").lower()
                pw = str(p.get("password") or "")
                if not name or len(name) > 50:
                    return self._send_json({"success": False, "message": "Please enter a valid name (1-50 characters)"}, 200, sid)
                if not email or not EMAIL_RE.match(email) or len(email) > 100:
                    return self._send_json({"success": False, "message": "Please enter a valid email address"}, 200, sid)
                if len(pw) < 6:
                    return self._send_json({"success": False, "message": "Password must be at least 6 characters"}, 200, sid)
                with state.db_lock:
                    if db.execute("SELECT 1 FROM t_user WHERE email = ?", (email,)).fetchone():
                        return self._send_json({"success": False, "message": "This email has already been registered"}, 200, sid)
                    try:
                        cur = db.execute(
                            "INSERT INTO t_user (user_name, email, login_pwd, create_time) VALUES (?,?,?,?)",
                            (name, email, hash_password_bcrypt(pw), now_str),
                        )
                        uid = int(cur.lastrowid)
                    except sqlite3.IntegrityError:
                        return self._send_json({"success": False, "message": "This email has already been registered"}, 409, sid)
                new_sid, _ = self._rotate_session(sid, {"user_id": uid, "user_email": email})
                return self._send_json(
                    {"success": True, "message": "Registration successful", "data": {"user_id": uid, "user_name": name, "email": email}},
                    200,
                    new_sid,
                )

            if route == "user/user/login":
                email = self._str_param(p, "email").lower()
                pw = str(p.get("password") or "")
                if not email or not pw:
                    return self._send_json({"success": False, "message": "Email and password are required"}, 200, sid)
                with state.db_lock:
                    urow = db.execute("SELECT * FROM t_user WHERE email = ?", (email,)).fetchone()
                    if not urow or not verify_password_bcrypt(pw, urow["login_pwd"]):
                        return self._send_json({"success": False, "message": "Invalid email or password"}, 200, sid)
                    if not str(urow["login_pwd"]).startswith(("$2y$", "$2b$", "$2a$")):
                        db.execute("UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?", (hash_password_bcrypt(pw), now_str, urow["user_code"]))
                    uid = int(urow["user_code"])
                    uname = urow["user_name"]
                    uemail = urow["email"]
                new_sid, _ = self._rotate_session(sid, {"user_id": uid, "user_email": uemail})
                return self._send_json(
                    {"success": True, "message": "Login successful", "data": {"user_id": uid, "user_name": uname, "email": uemail}},
                    200,
                    new_sid,
                )

            if route == "user/user/logout":
                self._destroy_session(sid)
                return self._send_json({"success": True, "message": "Logout successful", "data": None}, 200, clear_cookie=True)

            if route == "user/user/session":
                sess_uid = int(session.get("user_id") or 0)
                if sess_uid <= 0:
                    return self._send_json({"success": True, "message": "OK", "data": {"authenticated": False, "user_id": 0, "user_name": "Guest", "email": ""}}, 200, sid)
                with state.db_lock:
                    urow = db.execute("SELECT user_code, user_name, email FROM t_user WHERE user_code = ?", (sess_uid,)).fetchone()
                if not urow:
                    session.pop("user_id", None)
                    session.pop("user_email", None)
                    return self._send_json({"success": True, "message": "OK", "data": {"authenticated": False, "user_id": 0, "user_name": "Guest", "email": ""}}, 200, sid)
                return self._send_json(
                    {"success": True, "message": "OK", "data": {"authenticated": True, "user_id": int(urow["user_code"]), "user_name": urow["user_name"], "email": urow["email"]}},
                    200,
                    sid,
                )

            if route == "user/user/sendresetcode":
                email = self._str_param(p, "email").lower()
                if not email or not EMAIL_RE.match(email) or len(email) > 100:
                    return self._send_json({"success": False, "message": "Please enter a valid email address"}, 200, sid)
                cooldown = int(os.environ.get("AUTH_RESET_COOLDOWN", "2"))
                now_ts = int(time.time())
                last_sent = int(session.get("reset_sent_at") or 0)
                if cooldown > 0 and last_sent > 0 and (now_ts - last_sent) < cooldown:
                    return self._send_json({"success": False, "message": "Please wait before requesting another verification code"}, 429, sid)
                with state.db_lock:
                    urow = db.execute("SELECT user_code, email FROM t_user WHERE email = ?", (email,)).fetchone()
                if not urow:
                    return self._send_json({"success": False, "message": "Account not found for this email"}, 200, sid)

                code = f"{secrets.randbelow(1_000_000):06d}"
                ttl = max(60, int(os.environ.get("AUTH_RESET_TTL", "600")))
                session["reset_email"] = email
                session["reset_code_hash"] = hash_password_bcrypt(code)
                session["reset_expires_at"] = now_ts + ttl
                session["reset_attempts"] = 0
                session["reset_sent_at"] = now_ts
                state.mail_outbox[email] = code

                expose = os.environ.get("CINETIX_EXPOSE_RESET_CODE", "0").strip().lower() in ("1", "true", "yes", "on")
                resp_data = {"email": email, "expires_in": ttl}
                if expose:
                    resp_data["debug_code"] = code
                return self._send_json({"success": True, "message": "Verification code generated and sent", "data": resp_data}, 200, sid)

            if route == "user/user/changepassword":
                sess_uid = int(session.get("user_id") or 0)
                old_pw = str(p.get("old_password") or "")
                new_pw = str(p.get("pwd") or "")
                vcode = self._str_param(p, "verification_code")

                if len(new_pw) < 6:
                    return self._send_json({"success": False, "message": "New password must be at least 6 characters"}, 200, sid)

                # Path A: Signed-in user changing password with old_password
                if old_pw and not vcode:
                    if sess_uid <= 0:
                        return self._send_json({"success": False, "message": "Please sign in to change your password using current password"}, 401, sid)
                    with state.db_lock:
                        urow = db.execute("SELECT * FROM t_user WHERE user_code = ?", (sess_uid,)).fetchone()
                        if not urow:
                            self._destroy_session(sid)
                            return self._send_json({"success": False, "message": "Account session is no longer valid"}, 401, clear_cookie=True)
                        if not verify_password_bcrypt(old_pw, urow["login_pwd"]):
                            return self._send_json({"success": False, "message": "Current password is incorrect"}, 401, sid)
                        if hmac.compare_digest(old_pw, new_pw):
                            return self._send_json({"success": False, "message": "New password must be different from your current password"}, 200, sid)
                        db.execute("UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?", (hash_password_bcrypt(new_pw), now_str, sess_uid))
                        uemail = urow["email"]
                    new_sid, _ = self._rotate_session(sid, {"user_id": sess_uid, "user_email": uemail})
                    return self._send_json({"success": True, "message": "Password changed successfully", "data": None}, 200, new_sid)

                # Path B: Dynamic 6-digit verification code reset
                email = self._str_param(p, "email").lower()
                if not email or not EMAIL_RE.match(email) or len(email) > 100:
                    return self._send_json({"success": False, "message": "Please enter a valid email address"}, 200, sid)
                if not re.match(r"^\d{6}$", vcode):
                    return self._send_json({"success": False, "message": "Please enter the 6-digit verification code"}, 200, sid)

                r_email = str(session.get("reset_email") or "")
                r_hash = str(session.get("reset_code_hash") or "")
                r_exp = int(session.get("reset_expires_at") or 0)
                r_att = int(session.get("reset_attempts") or 0)

                def clear_challenge():
                    for k in ("reset_email", "reset_code_hash", "reset_expires_at", "reset_attempts", "reset_sent_at"):
                        session.pop(k, None)

                if not r_email or not r_hash or r_exp <= 0:
                    return self._send_json({"success": False, "message": "Please request a verification code first"}, 200, sid)
                if int(time.time()) > r_exp:
                    clear_challenge()
                    return self._send_json({"success": False, "message": "Verification code has expired. Please request a new code."}, 200, sid)
                if r_att >= MAX_RESET_ATTEMPTS:
                    clear_challenge()
                    return self._send_json({"success": False, "message": "Too many failed verification attempts. Please request a new code."}, 429, sid)

                if not hmac.compare_digest(r_email, email) or not verify_password_bcrypt(vcode, r_hash):
                    r_att += 1
                    if r_att >= MAX_RESET_ATTEMPTS:
                        clear_challenge()
                        return self._send_json({"success": False, "message": "Too many failed verification attempts. Please request a new code."}, 429, sid)
                    session["reset_attempts"] = r_att
                    return self._send_json({"success": False, "message": "Verification code is incorrect"}, 200, sid)

                with state.db_lock:
                    urow = db.execute("SELECT user_code, email FROM t_user WHERE email = ?", (email,)).fetchone()
                    if not urow:
                        clear_challenge()
                        return self._send_json({"success": False, "message": "Account not found for this email"}, 200, sid)
                    db.execute("UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?", (hash_password_bcrypt(new_pw), now_str, urow["user_code"]))

                preserved = {"user_id": sess_uid, "user_email": urow["email"]} if sess_uid > 0 and sess_uid == int(urow["user_code"]) else {}
                new_sid, _ = self._rotate_session(sid, preserved)
                return self._send_json({"success": True, "message": "Password changed successfully", "data": None}, 200, new_sid)

            # 7. Admin Cascading CRUD
            if route == "admin/movie/index":
                with state.db_lock:
                    movies = rows_to_dicts(db.execute("SELECT * FROM t_movies ORDER BY movie_code ASC").fetchall())
                    links = db.execute("SELECT movie_code, theater_code FROM theater_movie").fetchall()
                    tmap: dict[int, list[int]] = {}
                    for lr in links:
                        tmap.setdefault(int(lr["movie_code"]), []).append(int(lr["theater_code"]))
                    for m in movies:
                        tcodes = sorted(tmap.get(int(m["movie_code"]), []))
                        m["theater_codes"] = tcodes
                        m["theater_count"] = len(tcodes)
                return self._send_json({"success": True, "message": "OK", "data": movies}, 200, sid)

            if route == "admin/movie/getmoviebycode":
                mid = self._id_param(p, "movie_code", allow_direct=True)
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code is required"}, 200, sid)
                with state.db_lock:
                    row = db.execute("SELECT * FROM t_movies WHERE movie_code = ?", (mid,)).fetchone()
                    if not row:
                        return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                    mdata = dict(row)
                    mdata["theater_codes"] = [
                        int(r["theater_code"])
                        for r in db.execute("SELECT theater_code FROM theater_movie WHERE movie_code = ? ORDER BY theater_code ASC", (mid,)).fetchall()
                    ]
                    mdata["offer_codes"] = [
                        int(r["offer_code"])
                        for r in db.execute("SELECT offer_code FROM movie_offer WHERE movie_code = ? ORDER BY offer_code ASC", (mid,)).fetchall()
                    ]
                return self._send_json({"success": True, "message": "OK", "data": mdata}, 200, sid)

            if route == "admin/movie/create":
                data, err = prepare_movie_data(p)
                if err is not None or data is None:
                    return self._send_json({"success": False, "message": err or "Invalid movie fields"}, 200, sid)

                with state.db_lock:
                    valid_t = (
                        resolve_valid_ids(db, "t_theater", "theater_code", p["theater_codes"])
                        if "theater_codes" in p
                        else [int(r["theater_code"]) for r in db.execute("SELECT theater_code FROM t_theater ORDER BY theater_code ASC").fetchall()]
                    )
                    valid_o = (
                        resolve_valid_ids(db, "t_offer", "offer_code", p["offer_codes"])
                        if "offer_codes" in p
                        else [int(r["offer_code"]) for r in db.execute("SELECT offer_code FROM t_offer WHERE user_code IS NULL ORDER BY offer_code ASC").fetchall()]
                    )

                    db.execute("BEGIN IMMEDIATE")
                    try:
                        cur = db.execute(
                            "INSERT INTO t_movies (movie_name, tag, star, movie_type, img, money, times, create_time) VALUES (?,?,?,?,?,?,?,?)",
                            (data["movie_name"], data["tag"], data["star"], data["movie_type"], data["img"], data["money"], data["times"], now_str),
                        )
                        mid = int(cur.lastrowid)
                        for tid in valid_t:
                            db.execute(
                                "INSERT INTO theater_movie (theater_code, movie_code, start_date, end_date, daily_showtimes, created_time) VALUES (?,?,?,?,?,?)",
                                (tid, mid, "2026-01-01", "2027-12-31", 4, now_str),
                            )
                        for oid in valid_o:
                            orow = db.execute("SELECT offer_validity FROM t_offer WHERE offer_code = ?", (oid,)).fetchone()
                            vto = orow["offer_validity"] if orow and is_valid_iso_date(orow["offer_validity"] or "") else "2027-12-31"
                            db.execute(
                                "INSERT INTO movie_offer (movie_code, offer_code, discount_percent, valid_from, valid_to, created_time) VALUES (?,?,?,?,?,?)",
                                (mid, oid, 0.0, "2026-01-01", vto, now_str),
                            )
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Movie created successfully", "data": {"movie_code": mid, "theater_codes": valid_t}}, 200, sid)

            if route == "admin/movie/update":
                mid = self._id_param(p, "movie_code", allow_direct=True)
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code is required"}, 200, sid)
                with state.db_lock:
                    if not db.execute("SELECT 1 FROM t_movies WHERE movie_code = ?", (mid,)).fetchone():
                        return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                    data, err = prepare_movie_data(p)
                    if err is not None or data is None:
                        return self._send_json({"success": False, "message": err or "Invalid movie fields"}, 200, sid)

                    valid_t = resolve_valid_ids(db, "t_theater", "theater_code", p["theater_codes"]) if "theater_codes" in p else None
                    valid_o = resolve_valid_ids(db, "t_offer", "offer_code", p["offer_codes"]) if "offer_codes" in p else None

                    db.execute("BEGIN IMMEDIATE")
                    try:
                        db.execute(
                            "UPDATE t_movies SET movie_name=?, tag=?, star=?, movie_type=?, img=?, money=?, times=?, update_time=? WHERE movie_code=?",
                            (data["movie_name"], data["tag"], data["star"], data["movie_type"], data["img"], data["money"], data["times"], now_str, mid),
                        )
                        if valid_t is not None:
                            db.execute("DELETE FROM theater_movie WHERE movie_code = ?", (mid,))
                            for tid in valid_t:
                                db.execute(
                                    "INSERT INTO theater_movie (theater_code, movie_code, start_date, end_date, daily_showtimes, created_time) VALUES (?,?,?,?,?,?)",
                                    (tid, mid, "2026-01-01", "2027-12-31", 4, now_str),
                                )
                        if valid_o is not None:
                            db.execute("DELETE FROM movie_offer WHERE movie_code = ?", (mid,))
                            for oid in valid_o:
                                orow = db.execute("SELECT offer_validity FROM t_offer WHERE offer_code = ?", (oid,)).fetchone()
                                vto = orow["offer_validity"] if orow and is_valid_iso_date(orow["offer_validity"] or "") else "2027-12-31"
                                db.execute(
                                    "INSERT INTO movie_offer (movie_code, offer_code, discount_percent, valid_from, valid_to, created_time) VALUES (?,?,?,?,?,?)",
                                    (mid, oid, 0.0, "2026-01-01", vto, now_str),
                                )
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Movie updated successfully", "data": {"movie_code": mid}}, 200, sid)

            if route == "admin/movie/delete":
                mid = self._id_param(p, "movie_code", allow_direct=True)
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code is required"}, 200, sid)
                with state.db_lock:
                    if not db.execute("SELECT 1 FROM t_movies WHERE movie_code = ?", (mid,)).fetchone():
                        return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        db.execute("DELETE FROM theater_movie WHERE movie_code = ?", (mid,))
                        db.execute("DELETE FROM movie_offer WHERE movie_code = ?", (mid,))
                        db.execute("DELETE FROM t_seat WHERE movie_code = ?", (mid,))
                        db.execute("DELETE FROM t_movies WHERE movie_code = ?", (mid,))
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Movie deleted successfully", "data": {"movie_code": mid}}, 200, sid)

            # Admin Theaters CRUD
            if route == "admin/theater/index":
                with state.db_lock:
                    theaters = rows_to_dicts(db.execute("SELECT * FROM t_theater ORDER BY theater_code ASC").fetchall())
                    links = db.execute("SELECT theater_code, movie_code FROM theater_movie").fetchall()
                    mmap: dict[int, list[int]] = {}
                    for lr in links:
                        mmap.setdefault(int(lr["theater_code"]), []).append(int(lr["movie_code"]))
                    for t in theaters:
                        mcodes = sorted(mmap.get(int(t["theater_code"]), []))
                        t["movie_codes"] = mcodes
                        t["movie_count"] = len(mcodes)
                return self._send_json({"success": True, "message": "OK", "data": theaters}, 200, sid)

            if route == "admin/theater/gettheaterbycode":
                tid = self._id_param(p, "theater_code", allow_direct=True)
                if tid <= 0:
                    return self._send_json({"success": False, "message": "Valid theater_code is required"}, 200, sid)
                with state.db_lock:
                    trow = db.execute("SELECT * FROM t_theater WHERE theater_code = ?", (tid,)).fetchone()
                    if not trow:
                        return self._send_json({"success": False, "message": "Theater not found"}, 404, sid)
                    tdata = dict(trow)
                    tdata["movie_codes"] = [
                        int(r["movie_code"])
                        for r in db.execute("SELECT movie_code FROM theater_movie WHERE theater_code = ? ORDER BY movie_code ASC", (tid,)).fetchall()
                    ]
                return self._send_json({"success": True, "message": "OK", "data": tdata}, 200, sid)

            if route == "admin/theater/create":
                data, err = prepare_theater_data(p)
                if err is not None or data is None:
                    return self._send_json({"success": False, "message": err or "Invalid theater fields"}, 200, sid)
                with state.db_lock:
                    valid_m = (
                        resolve_valid_ids(db, "t_movies", "movie_code", p["movie_codes"])
                        if "movie_codes" in p
                        else [int(r["movie_code"]) for r in db.execute("SELECT movie_code FROM t_movies ORDER BY movie_code ASC").fetchall()]
                    )
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        cur = db.execute(
                            "INSERT INTO t_theater (theater_name, address, amenity, star, img, reviews, distance, theater_id, create_time) VALUES (?,?,?,?,?,?,?,?,?)",
                            (
                                data["theater_name"],
                                data["address"],
                                data["amenity"],
                                data["star"],
                                data["img"],
                                data["reviews"],
                                data["distance"],
                                data["theater_id"],
                                now_str,
                            ),
                        )
                        new_tid = int(cur.lastrowid)
                        if not data["theater_id"]:
                            db.execute("UPDATE t_theater SET theater_id = ? WHERE theater_code = ?", (f"TH-{new_tid:03d}", new_tid))
                        for mid in valid_m:
                            db.execute(
                                "INSERT INTO theater_movie (theater_code, movie_code, start_date, end_date, daily_showtimes, created_time) VALUES (?,?,?,?,?,?)",
                                (new_tid, mid, "2026-01-01", "2027-12-31", 4, now_str),
                            )
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Theater created successfully", "data": {"theater_code": new_tid, "movie_codes": valid_m}}, 200, sid)

            if route == "admin/theater/update":
                tid = self._id_param(p, "theater_code", allow_direct=True)
                if tid <= 0:
                    return self._send_json({"success": False, "message": "Valid theater_code is required"}, 200, sid)
                with state.db_lock:
                    if not db.execute("SELECT 1 FROM t_theater WHERE theater_code = ?", (tid,)).fetchone():
                        return self._send_json({"success": False, "message": "Theater not found"}, 404, sid)
                    data, err = prepare_theater_data(p)
                    if err is not None or data is None:
                        return self._send_json({"success": False, "message": err or "Invalid theater fields"}, 200, sid)
                    valid_m = resolve_valid_ids(db, "t_movies", "movie_code", p["movie_codes"]) if "movie_codes" in p else None
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        db.execute(
                            "UPDATE t_theater SET theater_name=?, address=?, amenity=?, star=?, img=?, reviews=?, distance=?, theater_id=?, update_time=? WHERE theater_code=?",
                            (
                                data["theater_name"],
                                data["address"],
                                data["amenity"],
                                data["star"],
                                data["img"],
                                data["reviews"],
                                data["distance"],
                                data["theater_id"],
                                now_str,
                                tid,
                            ),
                        )
                        if valid_m is not None:
                            db.execute("DELETE FROM theater_movie WHERE theater_code = ?", (tid,))
                            for mid in valid_m:
                                db.execute(
                                    "INSERT INTO theater_movie (theater_code, movie_code, start_date, end_date, daily_showtimes, created_time) VALUES (?,?,?,?,?,?)",
                                    (tid, mid, "2026-01-01", "2027-12-31", 4, now_str),
                                )
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Theater updated successfully", "data": {"theater_code": tid}}, 200, sid)

            if route == "admin/theater/delete":
                tid = self._id_param(p, "theater_code", allow_direct=True)
                if tid <= 0:
                    return self._send_json({"success": False, "message": "Valid theater_code is required"}, 200, sid)
                with state.db_lock:
                    if not db.execute("SELECT 1 FROM t_theater WHERE theater_code = ?", (tid,)).fetchone():
                        return self._send_json({"success": False, "message": "Theater not found"}, 404, sid)
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        db.execute("DELETE FROM theater_movie WHERE theater_code = ?", (tid,))
                        db.execute("DELETE FROM t_seat WHERE theater_code = ?", (tid,))
                        db.execute("DELETE FROM t_theater WHERE theater_code = ?", (tid,))
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Theater deleted successfully", "data": {"theater_code": tid}}, 200, sid)

            # Admin Offers CRUD
            if route == "admin/offer/index":
                with state.db_lock:
                    offers = rows_to_dicts(db.execute("SELECT * FROM t_offer ORDER BY offer_code ASC").fetchall())
                    links = db.execute("SELECT offer_code, movie_code FROM movie_offer").fetchall()
                    mmap: dict[int, list[int]] = {}
                    for lr in links:
                        mmap.setdefault(int(lr["offer_code"]), []).append(int(lr["movie_code"]))
                    users = {
                        int(r["user_code"]): dict(r)
                        for r in db.execute("SELECT user_code, user_name, email FROM t_user").fetchall()
                    }
                    for o in offers:
                        mcodes = sorted(mmap.get(int(o["offer_code"]), []))
                        o["movie_codes"] = mcodes
                        o["movie_count"] = len(mcodes)
                        ucode = int(o["user_code"]) if o.get("user_code") else 0
                        o["owner"] = users.get(ucode) if ucode > 0 else None
                return self._send_json({"success": True, "message": "OK", "data": offers}, 200, sid)

            if route == "admin/offer/getofferbycode":
                oid = self._id_param(p, "offer_code", allow_direct=True)
                if oid <= 0:
                    return self._send_json({"success": False, "message": "Valid offer_code is required"}, 200, sid)
                with state.db_lock:
                    row = db.execute("SELECT * FROM t_offer WHERE offer_code = ?", (oid,)).fetchone()
                    if not row:
                        return self._send_json({"success": False, "message": "Offer not found"}, 404, sid)
                    odata = dict(row)
                    odata["movie_codes"] = [
                        int(r["movie_code"])
                        for r in db.execute("SELECT movie_code FROM movie_offer WHERE offer_code = ? ORDER BY movie_code ASC", (oid,)).fetchall()
                    ]
                return self._send_json({"success": True, "message": "OK", "data": odata}, 200, sid)

            if route == "admin/offer/create":
                with state.db_lock:
                    data, err = prepare_offer_data(db, p, 0)
                    if err is not None or data is None:
                        return self._send_json({"success": False, "message": err or "Invalid offer fields"}, 200, sid)
                    valid_m = (
                        resolve_valid_ids(db, "t_movies", "movie_code", p["movie_codes"])
                        if "movie_codes" in p
                        else [int(r["movie_code"]) for r in db.execute("SELECT movie_code FROM t_movies ORDER BY movie_code ASC").fetchall()]
                    )
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        cur = db.execute(
                            "INSERT INTO t_offer (offer_title, offer_type, offer_description, promo_code, offer_validity, img, badge, money, user_code, create_time) VALUES (?,?,?,?,?,?,?,?,?,?)",
                            (
                                data["offer_title"],
                                data["offer_type"],
                                data["offer_description"],
                                data["promo_code"],
                                data["offer_validity"],
                                data["img"],
                                data["badge"],
                                data["money"],
                                data["user_code"],
                                now_str,
                            ),
                        )
                        oid = int(cur.lastrowid)
                        for mid in valid_m:
                            db.execute(
                                "INSERT INTO movie_offer (movie_code, offer_code, discount_percent, valid_from, valid_to, created_time) VALUES (?,?,?,?,?,?)",
                                (mid, oid, 0.0, "2026-01-01", data["offer_validity"], now_str),
                            )
                        db.execute("COMMIT")
                    except sqlite3.IntegrityError:
                        db.execute("ROLLBACK")
                        return self._send_json({"success": False, "message": "Promo code is already in use by another offer"}, 409, sid)
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Offer created successfully", "data": {"offer_code": oid, "movie_codes": valid_m}}, 200, sid)

            if route == "admin/offer/update":
                oid = self._id_param(p, "offer_code", allow_direct=True)
                if oid <= 0:
                    return self._send_json({"success": False, "message": "Valid offer_code is required"}, 200, sid)
                with state.db_lock:
                    if not db.execute("SELECT 1 FROM t_offer WHERE offer_code = ?", (oid,)).fetchone():
                        return self._send_json({"success": False, "message": "Offer not found"}, 404, sid)
                    data, err = prepare_offer_data(db, p, oid)
                    if err is not None or data is None:
                        return self._send_json({"success": False, "message": err or "Invalid offer fields"}, 200, sid)
                    valid_m = resolve_valid_ids(db, "t_movies", "movie_code", p["movie_codes"]) if "movie_codes" in p else None
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        db.execute(
                            "UPDATE t_offer SET offer_title=?, offer_type=?, offer_description=?, promo_code=?, offer_validity=?, img=?, badge=?, money=?, user_code=?, update_time=? WHERE offer_code=?",
                            (
                                data["offer_title"],
                                data["offer_type"],
                                data["offer_description"],
                                data["promo_code"],
                                data["offer_validity"],
                                data["img"],
                                data["badge"],
                                data["money"],
                                data["user_code"],
                                now_str,
                                oid,
                            ),
                        )
                        if valid_m is not None:
                            db.execute("DELETE FROM movie_offer WHERE offer_code = ?", (oid,))
                            for mid in valid_m:
                                db.execute(
                                    "INSERT INTO movie_offer (movie_code, offer_code, discount_percent, valid_from, valid_to, created_time) VALUES (?,?,?,?,?,?)",
                                    (mid, oid, 0.0, "2026-01-01", data["offer_validity"], now_str),
                                )
                        else:
                            db.execute("UPDATE movie_offer SET valid_to = ? WHERE offer_code = ?", (data["offer_validity"], oid))
                        db.execute("COMMIT")
                    except sqlite3.IntegrityError:
                        db.execute("ROLLBACK")
                        return self._send_json({"success": False, "message": "Promo code is already in use by another offer"}, 409, sid)
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Offer updated successfully", "data": {"offer_code": oid}}, 200, sid)

            if route == "admin/offer/delete":
                oid = self._id_param(p, "offer_code", allow_direct=True)
                if oid <= 0:
                    return self._send_json({"success": False, "message": "Valid offer_code is required"}, 200, sid)
                with state.db_lock:
                    if not db.execute("SELECT 1 FROM t_offer WHERE offer_code = ?", (oid,)).fetchone():
                        return self._send_json({"success": False, "message": "Offer not found"}, 404, sid)
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        db.execute("DELETE FROM movie_offer WHERE offer_code = ?", (oid,))
                        db.execute("DELETE FROM t_offer WHERE offer_code = ?", (oid,))
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Offer deleted successfully", "data": {"offer_code": oid}}, 200, sid)

            # Admin Seats
            if route == "admin/seat/index":
                with state.db_lock:
                    srows = rows_to_dicts(db.execute("SELECT * FROM t_seat ORDER BY seat_code DESC").fetchall())
                    for s in srows:
                        mrow = db.execute("SELECT * FROM t_movies WHERE movie_code = ?", (s["movie_code"],)).fetchone()
                        urow = db.execute("SELECT user_code, user_name, email FROM t_user WHERE user_code = ?", (s["user_code"],)).fetchone() if s["user_code"] else None
                        trow = db.execute("SELECT theater_code, theater_name, address FROM t_theater WHERE theater_code = ?", (s["theater_code"] or 1,)).fetchone()
                        s["movie"] = dict(mrow) if mrow else None
                        s["user"] = dict(urow) if urow else None
                        s["theater"] = dict(trow) if trow else None
                return self._send_json({"success": True, "message": "OK", "data": srows}, 200, sid)

            if route == "admin/seat/delete":
                seat_id = self._id_param(p, "seat_code", allow_direct=True)
                if seat_id <= 0:
                    return self._send_json({"success": False, "message": "Valid seat_code is required"}, 200, sid)
                with state.db_lock:
                    cur = db.execute("DELETE FROM t_seat WHERE seat_code = ?", (seat_id,))
                    if cur.rowcount == 0:
                        return self._send_json({"success": False, "message": "Seat booking not found"}, 404, sid)
                return self._send_json({"success": True, "message": "Seat booking deleted", "data": {"seat_code": seat_id}}, 200, sid)

            # Admin Users
            if route == "admin/user/index":
                with state.db_lock:
                    rows = db.execute("SELECT user_code, user_name, email, create_time, update_time FROM t_user ORDER BY user_code ASC").fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "admin/user/getuserbycode":
                uid = self._id_param(p, "user_code", allow_direct=True)
                if uid <= 0:
                    return self._send_json({"success": False, "message": "Valid user_code is required"}, 200, sid)
                with state.db_lock:
                    row = db.execute("SELECT user_code, user_name, email, create_time, update_time FROM t_user WHERE user_code = ?", (uid,)).fetchone()
                if not row:
                    return self._send_json({"success": False, "message": "User not found"}, 404, sid)
                return self._send_json({"success": True, "message": "OK", "data": dict(row)}, 200, sid)

            if route == "admin/user/create":
                uname = self._str_param(p, "user_name")
                uemail = self._str_param(p, "email").lower()
                upw = str(p.get("login_pwd") or "")
                with state.db_lock:
                    err = validate_admin_user_input(db, uname, uemail, upw, True, 0)
                    if err is not None:
                        return self._send_json({"success": False, "message": err}, 200, sid)
                    try:
                        cur = db.execute(
                            "INSERT INTO t_user (user_name, email, login_pwd, create_time) VALUES (?,?,?,?)",
                            (uname, uemail, hash_password_bcrypt(upw), now_str),
                        )
                        uid = int(cur.lastrowid)
                    except sqlite3.IntegrityError:
                        return self._send_json({"success": False, "message": "Email is already registered"}, 409, sid)
                return self._send_json({"success": True, "message": "User created successfully", "data": {"user_code": uid}}, 200, sid)

            if route == "admin/user/update":
                uid = self._id_param(p, "user_code", allow_direct=True)
                if uid <= 0:
                    return self._send_json({"success": False, "message": "Valid user_code is required"}, 200, sid)
                uname = self._str_param(p, "user_name")
                uemail = self._str_param(p, "email").lower()
                upw = str(p.get("login_pwd") or "")
                with state.db_lock:
                    if not db.execute("SELECT 1 FROM t_user WHERE user_code = ?", (uid,)).fetchone():
                        return self._send_json({"success": False, "message": "User not found"}, 404, sid)
                    err = validate_admin_user_input(db, uname, uemail, upw, False, uid)
                    if err is not None:
                        return self._send_json({"success": False, "message": err}, 200, sid)
                    try:
                        if upw:
                            db.execute("UPDATE t_user SET user_name=?, email=?, login_pwd=?, update_time=? WHERE user_code=?", (uname, uemail, hash_password_bcrypt(upw), now_str, uid))
                        else:
                            db.execute("UPDATE t_user SET user_name=?, email=?, update_time=? WHERE user_code=?", (uname, uemail, now_str, uid))
                    except sqlite3.IntegrityError:
                        return self._send_json({"success": False, "message": "Email is already registered to another user"}, 409, sid)
                return self._send_json({"success": True, "message": "User updated successfully", "data": {"user_code": uid}}, 200, sid)

            if route == "admin/user/delete":
                uid = self._id_param(p, "user_code", allow_direct=True)
                if uid <= 0:
                    return self._send_json({"success": False, "message": "Valid user_code is required"}, 200, sid)
                with state.db_lock:
                    if not db.execute("SELECT 1 FROM t_user WHERE user_code = ?", (uid,)).fetchone():
                        return self._send_json({"success": False, "message": "User not found"}, 404, sid)
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        db.execute("UPDATE t_seat SET user_code = NULL WHERE user_code = ?", (uid,))
                        db.execute("UPDATE t_offer SET user_code = NULL WHERE user_code = ?", (uid,))
                        db.execute("DELETE FROM t_user WHERE user_code = ?", (uid,))
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "User deleted successfully", "data": {"user_code": uid}}, 200, sid)

            self._send_json({"success": False, "message": f"Unknown route {route}"}, 404, sid)

    return Handler


def start_background_server() -> tuple[ThreadingHTTPServer, str]:
    state = ContractState()
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    server.state = state  # type: ignore[attr-defined]
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://127.0.0.1:{port}"
