#!/usr/bin/env python3
"""
Local SQLite-Backed Contract Server for End-to-End Browser Verification.
Loads movies.sql directly into SQLite (with PRAGMA foreign_keys = ON), serves `public/`,
and implements exact 1-to-1 semantic parity with the ThinkPHP 5.1 controllers in `application/`
(including $2y$10$ bcrypt hashing, session rotation, strict session + X-Admin-Token CSRF auth,
OTP password reset challenges, movie_offer & theater_movie validation, server-side checkout pricing,
transactional seat locking, and cascade integrity) for environments without php-cli/mysqld.
"""

from __future__ import annotations

import crypt
import datetime as dt
import hmac
import json
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
from pathlib import Path

from static_audit import ROOT, translate_mysql_to_sqlite

PUBLIC_DIR = ROOT / "public"
ALLOWED_SHOWTIMES = [
    "09:30 AM",
    "12:00 PM",
    "02:30 PM",
    "05:15 PM",
    "08:00 PM",
    "10:30 PM",
]
MAX_SEATS_PER_ORDER = 10
SERVICE_FEE = 2.50
GROUP_DISCOUNT_MIN_SEATS = 5
GROUP_DISCOUNT_RATE = 0.30
RESET_TTL_SECONDS = 300
MAX_RESET_ATTEMPTS = 5
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


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


def is_scalar(val) -> bool:
    return isinstance(val, (str, int, float, bool))


def str_param(p: dict, key: str, default: str = "") -> str:
    val = p.get(key)
    if val is None or not is_scalar(val) or isinstance(val, bool):
        return default
    return str(val).replace("\x00", "").strip()


def id_param(p: dict, key: str) -> int:
    val = p.get(key)
    if val is None or not is_scalar(val) or isinstance(val, bool):
        return 0
    s = str(val).strip()
    if not re.match(r"^-?\d+$", s):
        return 0
    return int(s)


def int_list_param(p: dict, key: str):
    if key not in p:
        return None
    raw = p[key]
    items = raw if isinstance(raw, list) else (str(raw).split(",") if is_scalar(raw) else [])
    seen: list[int] = []
    for item in items:
        if not is_scalar(item) or isinstance(item, bool):
            continue
        s = str(item).strip()
        if not s:
            continue
        if not re.match(r"^\d+$", s) or int(s) <= 0:
            return False
        iv = int(s)
        if iv not in seen:
            seen.append(iv)
    return seen


def is_valid_date(val: str) -> bool:
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", (val or "").strip())
    if not m:
        return False
    try:
        dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        return True
    except ValueError:
        return False


def is_safe_asset_url(val: str) -> bool:
    if not isinstance(val, str):
        return False
    s = val.strip()
    if not s or len(s) > 500 or re.search(r"[\x00-\x1f\x7f]", s):
        return False
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", s):
        return bool(re.match(r"^(https?://|data:image/[a-zA-Z0-9.+-]+;base64,)", s, re.I))
    return True


def escape_like(kw: str) -> str:
    return kw.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def calculate_checkout_pricing(unit_price: float, seat_count: int, promo_discount: float = 0.0) -> dict:
    unit = round(max(0.0, float(unit_price)), 2)
    count = max(0, int(seat_count))
    subtotal = round(unit * count, 2)
    group_off = round(subtotal * GROUP_DISCOUNT_RATE, 2) if count >= GROUP_DISCOUNT_MIN_SEATS else 0.0
    promo_off = round(max(0.0, float(promo_discount)), 2)
    fee = SERVICE_FEE if count > 0 else 0.0
    total = max(0.0, round(subtotal - (group_off + promo_off) + fee, 2))
    return {
        "unit_price": unit,
        "seat_count": count,
        "subtotal": subtotal,
        "group_discount": group_off,
        "promo_discount": promo_off,
        "service_fee": fee,
        "total_paid": total,
    }


def validate_offer_for_booking(
    db: sqlite3.Connection,
    raw_code: str,
    today_str: str,
    movie_code: int = 0,
    screening_date: str = "",
    session_uid: int = 0,
) -> tuple[dict | None, str | None]:
    code = (raw_code or "").strip().upper()
    if not code:
        return None, "Promo code is required"

    orow = db.execute(
        "SELECT offer_code, offer_title, promo_code, offer_validity, badge, money, user_code FROM t_offer WHERE promo_code = ?",
        (code,),
    ).fetchone()
    if not orow:
        return None, "Invalid promo code"

    odata = dict(orow)
    validity = str(odata.get("offer_validity") or "").strip()
    if is_valid_date(validity):
        if validity < today_str:
            return None, "This promo code has expired"
        if is_valid_date(screening_date) and screening_date > validity:
            return None, "This promo code expires before the selected screening date"

    exclusive_owner = int(odata.get("user_code") or 0)
    if exclusive_owner > 0 and int(session_uid) != exclusive_owner:
        return None, "This promo code is exclusive to another member account"

    if movie_code > 0:
        link = db.execute(
            "SELECT valid_from, valid_to FROM movie_offer WHERE offer_code = ? AND movie_code = ?",
            (int(odata["offer_code"]), int(movie_code)),
        ).fetchone()
        if not link:
            return None, "This promo code is not valid for the selected movie"
        ref_date = screening_date if is_valid_date(screening_date) else today_str
        v_from = str(link["valid_from"] or "").strip()
        v_to = str(link["valid_to"] or "").strip()
        if is_valid_date(v_from) and ref_date < v_from:
            return None, "This promo code is not yet active for this movie"
        if is_valid_date(v_to) and ref_date > v_to:
            return None, "This promo code has expired for this movie"

    odata.pop("user_code", None)
    odata["money"] = round(float(odata["money"]), 2)
    return odata, None


class ContractState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.conn = sqlite3.connect(":memory:", check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON;")
        sql_text = (ROOT / "movies.sql").read_text(encoding="utf-8")
        self.conn.executescript(translate_mysql_to_sqlite(sql_text))
        self.sessions: dict[str, dict] = {}


def rows_to_dicts(rows) -> list[dict]:
    return [dict(r) for r in rows]


def make_handler(state: ContractState):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def _get_session(self) -> tuple[str, dict]:
            jar = cookies.SimpleCookie(self.headers.get("Cookie", ""))
            sid = jar["PHPSESSID"].value if "PHPSESSID" in jar else ""
            if not sid or sid not in state.sessions:
                sid = secrets.token_hex(16)
                state.sessions[sid] = {}
            return sid, state.sessions[sid]

        def _rotate_session(self, old_sid: str) -> tuple[str, dict]:
            old_data = dict(state.sessions.pop(old_sid, {}))
            new_sid = secrets.token_hex(16)
            state.sessions[new_sid] = old_data
            return new_sid, old_data

        def _send_json(self, body: dict, status: int = 200, sid: str | None = None) -> None:
            raw = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            if sid:
                self.send_header("Set-Cookie", f"PHPSESSID={sid}; Path=/; HttpOnly; SameSite=Lax")
            self.end_headers()
            self.wfile.write(raw)

        def _parse_payload(self, query_str: str) -> dict:
            params: dict = {}
            for k, vals in urllib.parse.parse_qs(query_str, keep_blank_values=True).items():
                if k.endswith("[]"):
                    params[k[:-2]] = vals
                else:
                    params[k] = vals[-1]
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
                    for k, vals in urllib.parse.parse_qs(raw_body, keep_blank_values=True).items():
                        if k.endswith("[]"):
                            params[k[:-2]] = vals
                        else:
                            params[k] = vals[-1]
            return params

        def _require_admin(self, session: dict, payload: dict) -> bool:
            sess_tok = str(session.get("admin_token") or "")
            if session.get("admin_auth") is not True or not sess_tok:
                return False
            auth_hdr = self.headers.get("Authorization", "")
            bearer = auth_hdr[7:].strip() if auth_hdr.lower().startswith("bearer ") else ""
            body_tok = payload.get("token") if isinstance(payload.get("token"), str) else ""
            client_tok = (self.headers.get("X-Admin-Token") or bearer or body_tok or "").strip()
            return bool(client_tok) and hmac.compare_digest(sess_tok, client_tok)

        def do_GET(self):
            self._dispatch()

        def do_POST(self):
            self._dispatch()

        def _dispatch(self):
            parsed = urllib.parse.urlparse(self.path)
            path = urllib.parse.unquote(parsed.path)

            if path == "/index.php" or path.startswith("/index.php/"):
                sid, session = self._get_session()
                payload = self._parse_payload(parsed.query)
                with state.lock:
                    self._handle_api(path, payload, sid, session)
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

        def _prepare_movie_data(self, p: dict) -> tuple[dict | None, str | None]:
            name = str_param(p, "movie_name")
            mtype = str_param(p, "movie_type")
            img = str_param(p, "img")
            times = str_param(p, "times")
            tag = str_param(p, "tag")
            star_raw = p.get("star")
            money_raw = p.get("money")

            if not name or len(name) > 200:
                return None, "Movie title is required (1-200 characters)"
            if not mtype or len(mtype) > 50:
                return None, "Movie genre is required (1-50 characters)"
            if not img or not is_safe_asset_url(img):
                return None, "A valid poster image path or URL is required"
            if not times or len(times) > 50:
                return None, "Movie duration is required (1-50 characters)"
            try:
                if star_raw is None or isinstance(star_raw, bool) or not is_scalar(star_raw):
                    raise ValueError
                star = float(str(star_raw).strip())
                if star < 0 or star > 5:
                    raise ValueError
            except ValueError:
                return None, "Rating must be between 0.0 and 5.0"
            try:
                if money_raw is None or isinstance(money_raw, bool) or not is_scalar(money_raw):
                    raise ValueError
                money = float(str(money_raw).strip())
                if money <= 0 or money > 9999.99:
                    raise ValueError
            except ValueError:
                return None, "Ticket price must be greater than 0 and at most 9999.99"
            if len(tag) > 50:
                return None, "Highlight badge must be 50 characters or fewer"

            return {
                "movie_name": name,
                "movie_type": mtype,
                "img": img,
                "times": times,
                "tag": tag or None,
                "star": round(star, 1),
                "money": round(money, 2),
            }, None

        def _prepare_offer_data(self, db: sqlite3.Connection, p: dict, exclude_id: int) -> tuple[dict | None, str | None]:
            title = str_param(p, "offer_title")
            otype = str_param(p, "offer_type")
            desc = str_param(p, "offer_description")
            promo = str_param(p, "promo_code").upper()
            validity = str_param(p, "offer_validity")
            img = str_param(p, "img")
            badge = str_param(p, "badge")
            money_raw = p.get("money")

            if not title or len(title) > 200:
                return None, "Offer title is required (1-200 characters)"
            if not otype or len(otype) > 100:
                return None, "Offer category is required (1-100 characters)"
            if not desc or len(desc) > 500:
                return None, "Offer description is required (1-500 characters)"
            if not promo:
                return None, "Promo code is required"
            if not re.match(r"^[A-Z0-9_-]{3,50}$", promo):
                return None, "Promo code must be 3-50 alphanumeric characters, hyphens, or underscores"
            if not is_valid_date(validity):
                return None, "Validity date must be a valid YYYY-MM-DD calendar date"
            if not img or not is_safe_asset_url(img):
                return None, "A valid offer image path or URL is required"
            try:
                if money_raw is None or isinstance(money_raw, bool) or not is_scalar(money_raw):
                    raise ValueError
                money = float(str(money_raw).strip())
                if money <= 0 or money > 9999.99:
                    raise ValueError
            except ValueError:
                return None, "Discount amount must be greater than 0 and at most 9999.99"
            if len(badge) > 50:
                return None, "Highlight badge must be 50 characters or fewer"

            user_code = None
            if p.get("user_code") not in (None, ""):
                uid = id_param(p, "user_code")
                if uid <= 0 or not db.execute("SELECT 1 FROM t_user WHERE user_code = ?", (uid,)).fetchone():
                    return None, "Selected exclusive user does not exist"
                user_code = uid

            dup = db.execute(
                "SELECT 1 FROM t_offer WHERE promo_code = ? AND offer_code <> ?",
                (promo, exclude_id),
            ).fetchone()
            if dup:
                return None, "Promo code is already in use by another offer"

            return {
                "offer_title": title,
                "offer_type": otype,
                "offer_description": desc,
                "promo_code": promo,
                "offer_validity": validity,
                "img": img,
                "badge": badge or None,
                "money": round(money, 2),
                "user_code": user_code,
            }, None

        def _handle_api(self, path: str, p: dict, sid: str, session: dict) -> None:
            parts = [seg for seg in path[len("/index.php") :].split("/") if seg]
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

            # Admin Auth
            if route == "admin/auth/login":
                u = str_param(p, "username")
                pw = str(p["password"]) if is_scalar(p.get("password")) and not isinstance(p.get("password"), bool) else ""
                if not u or not pw:
                    return self._send_json({"success": False, "message": "Username and password are required"}, 200, sid)
                expected_u = os.environ.get("ADMIN_USERNAME", "admin")
                expected_pw = os.environ.get("ADMIN_PASSWORD", "admin")
                if hmac.compare_digest(expected_u, u) and hmac.compare_digest(expected_pw, pw):
                    sid, session = self._rotate_session(sid)
                    tok = secrets.token_hex(32)
                    session["admin_auth"] = True
                    session["admin_token"] = tok
                    session["admin_user"] = u
                    return self._send_json(
                        {"success": True, "message": "Login successful", "token": tok, "data": {"admin_id": 1, "username": u, "role": "admin"}},
                        200,
                        sid,
                    )
                return self._send_json({"success": False, "message": "Invalid username or password"}, 401, sid)

            if route == "admin/auth/logout":
                session.pop("admin_auth", None)
                session.pop("admin_token", None)
                session.pop("admin_user", None)
                return self._send_json({"success": True, "message": "Logout successful", "data": None}, 200, sid)

            if route == "admin/auth/checkauth":
                if not self._require_admin(session, p):
                    return self._send_json({"success": False, "message": "Authentication required"}, 401, sid)
                return self._send_json(
                    {"success": True, "message": "Authentication valid", "data": {"admin_id": 1, "username": session.get("admin_user", "admin"), "role": "admin"}},
                    200,
                    sid,
                )

            if route.startswith("admin/"):
                if not self._require_admin(session, p):
                    return self._send_json({"success": False, "message": "Unauthorized: admin login required"}, 401, sid)

            # Public Movies
            if route == "movie/movies/getmovielist":
                genre = str_param(p, "genre", "all")
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
                kw = str_param(p, "keyword")
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
                mid = id_param(p, "movie_code")
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code parameter is required"}, 200, sid)
                row = db.execute("SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies WHERE movie_code = ?", (mid,)).fetchone()
                if not row:
                    return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                return self._send_json({"success": True, "message": "OK", "data": dict(row)}, 200, sid)

            # Public Theaters
            if route == "theater/theater/gettheaterlist":
                kw = str_param(p, "address")
                am = str_param(p, "amenity")
                mc = id_param(p, "movie_code")
                if mc > 0:
                    sql = (
                        "SELECT t.theater_code, t.theater_name, t.address, t.amenity, t.star, t.img, t.reviews, t.distance, tm.daily_showtimes "
                        "FROM t_theater t JOIN theater_movie tm ON tm.theater_code = t.theater_code "
                        "WHERE tm.movie_code = ? AND (tm.start_date IS NULL OR tm.start_date <= ?) AND (tm.end_date IS NULL OR tm.end_date >= ?)"
                    )
                    args: list = [mc, today_str, today_str]
                    if kw:
                        esc_kw = f"%{escape_like(kw)}%"
                        sql += " AND (t.theater_name LIKE ? ESCAPE '\\' OR t.address LIKE ? ESCAPE '\\')"
                        args.extend([esc_kw, esc_kw])
                    if am and am.lower() != "all":
                        sql += " AND t.amenity LIKE ? ESCAPE '\\'"
                        args.append(f"%{escape_like(am)}%")
                    sql += " ORDER BY t.theater_code ASC"
                    rows = db.execute(sql, args).fetchall()
                    return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

                sql = "SELECT theater_code, theater_name, address, amenity, star, img, reviews, distance FROM t_theater WHERE 1=1"
                args = []
                if kw:
                    esc_kw = f"%{escape_like(kw)}%"
                    sql += " AND (theater_name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')"
                    args.extend([esc_kw, esc_kw])
                if am and am.lower() != "all":
                    sql += " AND amenity LIKE ? ESCAPE '\\'"
                    args.append(f"%{escape_like(am)}%")
                sql += " ORDER BY theater_code ASC"
                rows = db.execute(sql, args).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "theater/theater/gettheaterdetails":
                tid = id_param(p, "theater_code")
                if tid <= 0:
                    return self._send_json({"success": False, "message": "Valid theater_code parameter is required"}, 200, sid)
                trow = db.execute("SELECT * FROM t_theater WHERE theater_code = ?", (tid,)).fetchone()
                if not trow:
                    return self._send_json({"success": False, "message": "Theater does not exist"}, 404, sid)
                tdata = dict(trow)
                mrows = db.execute(
                    "SELECT m.movie_code, m.movie_name, m.star, m.tag, m.money, m.movie_type, m.img, m.times, tm.daily_showtimes "
                    "FROM theater_movie tm JOIN t_movies m ON tm.movie_code = m.movie_code "
                    "WHERE tm.theater_code = ? AND (tm.start_date IS NULL OR tm.start_date <= ?) AND (tm.end_date IS NULL OR tm.end_date >= ?) ORDER BY m.movie_code ASC",
                    (tid, today_str, today_str),
                ).fetchall()
                tdata["movies"] = rows_to_dicts(mrows)
                return self._send_json({"success": True, "message": "OK", "data": tdata}, 200, sid)

            # Public Offers
            if route == "offer/offer/getofferlist":
                otype = str_param(p, "offer_type")
                if otype and otype.lower() != "all":
                    rows = rows_to_dicts(
                        db.execute(
                            "SELECT offer_code, offer_title, offer_description, promo_code, offer_validity, img, badge, money, offer_type FROM t_offer WHERE offer_type = ? ORDER BY offer_code ASC",
                            (otype,),
                        ).fetchall()
                    )
                else:
                    rows = rows_to_dicts(
                        db.execute(
                            "SELECT offer_code, offer_title, offer_description, promo_code, offer_validity, img, badge, money, offer_type FROM t_offer ORDER BY offer_code ASC"
                        ).fetchall()
                    )
                for item in rows:
                    m_links = db.execute(
                        "SELECT movie_code FROM movie_offer WHERE offer_code = ? ORDER BY movie_code ASC",
                        (item["offer_code"],),
                    ).fetchall()
                    item["movie_codes"] = [int(r["movie_code"]) for r in m_links]
                return self._send_json({"success": True, "message": "OK", "data": rows}, 200, sid)

            if route == "offer/offer/getmoneybybadge":
                code = str_param(p, "badge") or str_param(p, "promo_code")
                mc = id_param(p, "movie_code")
                sc_date = str_param(p, "date")
                sess_uid = int(session.get("user_id") or 0)
                odata, err = validate_offer_for_booking(db, code, today_str, mc, sc_date, sess_uid)
                if err is not None:
                    return self._send_json({"success": False, "message": err}, 200, sid)
                return self._send_json({"success": True, "message": "Promo code applied", "data": odata}, 200, sid)

            # Public Seats
            if route == "movie/seat/getseatlist":
                mc = id_param(p, "movie_code")
                tc = 1 if ("theater_code" not in p or str_param(p, "theater_code") == "") else id_param(p, "theater_code")
                d = str_param(p, "date")
                t = str_param(p, "time")
                if mc <= 0 or tc <= 0 or not is_valid_date(d) or not t:
                    return self._send_json(
                        {"success": False, "message": "Valid movie_code, theater_code, date (YYYY-MM-DD), and time are required"},
                        200,
                        sid,
                    )
                rows = db.execute(
                    "SELECT seat_num, seat_zone, theater_code FROM t_seat WHERE movie_code = ? AND theater_code = ? AND date = ? AND time = ? ORDER BY seat_num ASC",
                    (mc, tc, d, t),
                ).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "movie/seat/saveseats":
                mc = id_param(p, "movie_code")
                tc = 1 if ("theater_code" not in p or str_param(p, "theater_code") == "") else id_param(p, "theater_code")
                d = str_param(p, "date")
                t = str_param(p, "time")
                promo_code = str_param(p, "promo_code") or str_param(p, "badge")
                raw_seats = p.get("seat_nums", [])

                if mc <= 0 or tc <= 0 or not d or not t or not raw_seats:
                    return self._send_json({"success": False, "message": "Complete screening and seat parameters are required"}, 200, sid)
                if not is_valid_date(d):
                    return self._send_json({"success": False, "message": "Screening date must be a valid YYYY-MM-DD date"}, 200, sid)
                earliest = (dt.date.today() - dt.timedelta(days=1)).isoformat()
                if d < earliest:
                    return self._send_json({"success": False, "message": "Cannot book seats for a past screening date"}, 200, sid)
                if t not in ALLOWED_SHOWTIMES:
                    return self._send_json({"success": False, "message": "Invalid screening showtime selected"}, 200, sid)
                if not isinstance(raw_seats, list) and (not is_scalar(raw_seats) or isinstance(raw_seats, bool)):
                    return self._send_json({"success": False, "message": "Invalid seat_nums format"}, 200, sid)

                seat_list = raw_seats if isinstance(raw_seats, list) else str(raw_seats).split(",")
                seats: list[str] = []
                for s in seat_list:
                    if not is_scalar(s) or isinstance(s, bool):
                        return self._send_json({"success": False, "message": "Invalid seat coordinate entry"}, 200, sid)
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
                    return self._send_json({"success": False, "message": f"Maximum {MAX_SEATS_PER_ORDER} seats per transaction"}, 200, sid)

                mrow = db.execute("SELECT * FROM t_movies WHERE movie_code = ?", (mc,)).fetchone()
                if not mrow:
                    return self._send_json({"success": False, "message": "Selected movie does not exist"}, 404, sid)
                trow = db.execute("SELECT * FROM t_theater WHERE theater_code = ?", (tc,)).fetchone()
                if not trow:
                    return self._send_json({"success": False, "message": "Selected theater does not exist"}, 404, sid)

                sched = db.execute("SELECT * FROM theater_movie WHERE theater_code = ? AND movie_code = ?", (tc, mc)).fetchone()
                if not sched:
                    return self._send_json({"success": False, "message": "This movie is not scheduled at the selected theater"}, 200, sid)
                if sched["start_date"] and is_valid_date(sched["start_date"]) and d < sched["start_date"]:
                    return self._send_json({"success": False, "message": "Selected date is before the screening schedule window"}, 200, sid)
                if sched["end_date"] and is_valid_date(sched["end_date"]) and d > sched["end_date"]:
                    return self._send_json({"success": False, "message": "Selected date is after the screening schedule window"}, 200, sid)
                daily_slots = max(1, min(len(ALLOWED_SHOWTIMES), int(sched["daily_showtimes"] or 6)))
                if ALLOWED_SHOWTIMES.index(t) >= daily_slots:
                    return self._send_json({"success": False, "message": "Selected showtime is not available for this theater schedule"}, 200, sid)

                sess_uid = int(session.get("user_id") or 0)
                user_code = None
                if sess_uid > 0:
                    urow = db.execute("SELECT user_code FROM t_user WHERE user_code = ?", (sess_uid,)).fetchone()
                    if urow:
                        user_code = int(urow["user_code"])
                    else:
                        session.pop("user_id", None)
                        session.pop("user_email", None)

                applied_offer = None
                promo_money = 0.0
                if promo_code:
                    applied_offer, oerr = validate_offer_for_booking(db, promo_code, today_str, mc, d, user_code or 0)
                    if oerr is not None:
                        return self._send_json({"success": False, "message": oerr}, 200, sid)
                    promo_money = float(applied_offer["money"])

                pricing = calculate_checkout_pricing(float(mrow["money"]), len(seats), promo_money)

                placeholders = ",".join("?" for _ in seats)
                conflicts = [
                    r["seat_num"]
                    for r in db.execute(
                        f"SELECT seat_num FROM t_seat WHERE movie_code=? AND theater_code=? AND date=? AND time=? AND seat_num IN ({placeholders})",
                        [mc, tc, d, t, *seats],
                    ).fetchall()
                ]
                if conflicts:
                    return self._send_json({"success": False, "message": "Seats already booked: " + ", ".join(conflicts)}, 409, sid)

                seat_codes: list[int] = []
                try:
                    for code in seats:
                        zone = 2 if code[0] in ("D", "E") else 1
                        cur = db.execute(
                            "INSERT INTO t_seat (movie_code, theater_code, user_code, date, time, seat_num, seat_zone, create_time) VALUES (?,?,?,?,?,?,?,?)",
                            (mc, tc, user_code, d, t, code, zone, now_str),
                        )
                        seat_codes.append(int(cur.lastrowid))
                    db.commit()
                except sqlite3.IntegrityError:
                    db.rollback()
                    return self._send_json(
                        {"success": False, "message": "One or more selected seats were just booked by another customer"},
                        409,
                        sid,
                    )

                first_id = seat_codes[0] if seat_codes else 0
                booking_ref = f"BK-{dt.date.today().strftime('%y%m%d')}-{first_id:04d}"
                return self._send_json(
                    {
                        "success": True,
                        "message": "Booking confirmed",
                        "data": {
                            "booking_ref": booking_ref,
                            "booked_count": len(seat_codes),
                            "seats": seats,
                            "seat_codes": seat_codes,
                            "movie_code": mc,
                            "movie_name": mrow["movie_name"],
                            "theater_code": tc,
                            "theater_name": trow["theater_name"],
                            "date": d,
                            "time": t,
                            "promo_code": applied_offer["promo_code"] if applied_offer else None,
                            "pricing": pricing,
                        },
                    },
                    200,
                    sid,
                )

            if route == "movie/seat/getseatlistbyusercode":
                is_admin = self._require_admin(session, p)
                sess_uid = int(session.get("user_id") or 0)
                req_uid = id_param(p, "user_code")

                if not is_admin:
                    if sess_uid <= 0:
                        return self._send_json({"success": False, "message": "Authentication required to view tickets"}, 401, sid)
                    if req_uid > 0 and req_uid != sess_uid:
                        return self._send_json({"success": False, "message": "Not authorized to access another user's tickets"}, 403, sid)
                    uid = sess_uid
                else:
                    uid = req_uid if req_uid > 0 else sess_uid
                    if uid <= 0:
                        return self._send_json({"success": False, "message": "Valid user_code parameter is required"}, 200, sid)

                if not db.execute("SELECT 1 FROM t_user WHERE user_code = ?", (uid,)).fetchone():
                    if not is_admin:
                        session.pop("user_id", None)
                        session.pop("user_email", None)
                        return self._send_json({"success": False, "message": "User account is no longer active"}, 401, sid)
                    return self._send_json({"success": False, "message": "User not found"}, 404, sid)

                srows = rows_to_dicts(
                    db.execute(
                        "SELECT seat_code, movie_code, theater_code, date, time, seat_num, seat_zone, create_time FROM t_seat WHERE user_code = ? ORDER BY seat_code DESC",
                        (uid,),
                    ).fetchall()
                )
                for s in srows:
                    mrow = db.execute("SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies WHERE movie_code = ?", (s["movie_code"],)).fetchone()
                    trow = db.execute("SELECT theater_code, theater_name, address FROM t_theater WHERE theater_code = ?", (s["theater_code"] or 1,)).fetchone()
                    s["movie_info"] = dict(mrow) if mrow else None
                    s["theater_info"] = dict(trow) if trow else None
                return self._send_json({"success": True, "message": "OK", "data": srows}, 200, sid)

            if route == "movie/seat/delete":
                seat_id = id_param(p, "seat_code")
                if seat_id <= 0:
                    return self._send_json({"success": False, "message": "Valid seat_code is required"}, 200, sid)
                srow = db.execute("SELECT * FROM t_seat WHERE seat_code = ?", (seat_id,)).fetchone()
                if not srow:
                    return self._send_json({"success": False, "message": "Ticket record not found"}, 404, sid)

                is_admin = self._require_admin(session, p)
                caller_uid = int(session.get("user_id") or 0)
                owner_uid = int(srow["user_code"] or 0)
                if not is_admin:
                    if caller_uid <= 0:
                        return self._send_json({"success": False, "message": "Authentication required to cancel bookings"}, 401, sid)
                    if owner_uid <= 0 or caller_uid != owner_uid:
                        return self._send_json({"success": False, "message": "Not authorized to cancel this booking"}, 403, sid)

                db.execute("DELETE FROM t_seat WHERE seat_code = ?", (seat_id,))
                db.commit()
                return self._send_json({"success": True, "message": "Booking cancelled", "data": {"seat_code": seat_id}}, 200, sid)

            # Users
            if route == "user/user/reg":
                name = str_param(p, "name")
                email = str_param(p, "email").lower()
                pw = str(p["password"]) if is_scalar(p.get("password")) and not isinstance(p.get("password"), bool) else ""
                if not name or len(name) > 50:
                    return self._send_json({"success": False, "message": "Please enter a valid name (1-50 characters)"}, 200, sid)
                if not email or not EMAIL_RE.match(email) or len(email) > 100:
                    return self._send_json({"success": False, "message": "Please enter a valid email address"}, 200, sid)
                if len(pw) < 6 or len(pw) > 128:
                    return self._send_json({"success": False, "message": "Password must be between 6 and 128 characters"}, 200, sid)
                if db.execute("SELECT 1 FROM t_user WHERE email = ?", (email,)).fetchone():
                    return self._send_json({"success": False, "message": "This email has already been registered"}, 200, sid)

                cur = db.execute(
                    "INSERT INTO t_user (user_name, email, login_pwd, create_time) VALUES (?,?,?,?)",
                    (name, email, hash_password_bcrypt(pw), now_str),
                )
                db.commit()
                uid = int(cur.lastrowid)
                sid, session = self._rotate_session(sid)
                session["user_id"] = uid
                session["user_email"] = email
                return self._send_json(
                    {"success": True, "message": "Registration successful", "data": {"user_id": uid, "user_name": name, "email": email}},
                    200,
                    sid,
                )

            if route == "user/user/login":
                email = str_param(p, "email").lower()
                pw = str(p["password"]) if is_scalar(p.get("password")) and not isinstance(p.get("password"), bool) else ""
                if not email or not pw:
                    return self._send_json({"success": False, "message": "Email and password are required"}, 200, sid)
                urow = db.execute("SELECT * FROM t_user WHERE email = ?", (email,)).fetchone()
                if not urow or not verify_password_bcrypt(pw, urow["login_pwd"]):
                    return self._send_json({"success": False, "message": "Invalid email or password"}, 200, sid)
                if not str(urow["login_pwd"] or "").startswith(("$2y$", "$2b$", "$2a$")):
                    db.execute(
                        "UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?",
                        (hash_password_bcrypt(pw), now_str, urow["user_code"]),
                    )
                    db.commit()
                uid = int(urow["user_code"])
                sid, session = self._rotate_session(sid)
                session["user_id"] = uid
                session["user_email"] = urow["email"]
                return self._send_json(
                    {"success": True, "message": "Login successful", "data": {"user_id": uid, "user_name": urow["user_name"], "email": urow["email"]}},
                    200,
                    sid,
                )

            if route == "user/user/session":
                uid = int(session.get("user_id") or 0)
                if uid <= 0:
                    return self._send_json({"success": True, "message": "OK", "data": {"authenticated": False}}, 200, sid)
                urow = db.execute("SELECT user_code, user_name, email FROM t_user WHERE user_code = ?", (uid,)).fetchone()
                if not urow:
                    session.pop("user_id", None)
                    session.pop("user_email", None)
                    return self._send_json({"success": True, "message": "OK", "data": {"authenticated": False}}, 200, sid)
                return self._send_json(
                    {
                        "success": True,
                        "message": "OK",
                        "data": {
                            "authenticated": True,
                            "user_id": int(urow["user_code"]),
                            "user_name": urow["user_name"],
                            "email": urow["email"],
                        },
                    },
                    200,
                    sid,
                )

            if route == "user/user/logout":
                session.pop("user_id", None)
                session.pop("user_email", None)
                session.pop("pwd_reset", None)
                return self._send_json({"success": True, "message": "Logout successful", "data": None}, 200, sid)

            if route == "user/user/sendresetcode":
                email = str_param(p, "email").lower()
                if not email or not EMAIL_RE.match(email):
                    return self._send_json({"success": False, "message": "Please enter a valid email address"}, 200, sid)
                urow = db.execute("SELECT user_code FROM t_user WHERE email = ?", (email,)).fetchone()
                if not urow:
                    return self._send_json({"success": False, "message": "Account not found for this email"}, 404, sid)

                otp = f"{secrets.randbelow(1_000_000):06d}"
                session["pwd_reset"] = {
                    "email": email,
                    "code_hash": hash_password_bcrypt(otp),
                    "expires_at": int(time.time()) + RESET_TTL_SECONDS,
                    "attempts": 0,
                }
                return self._send_json(
                    {"success": True, "message": "Verification code issued", "data": {"expires_in": RESET_TTL_SECONDS, "demo_code": otp}},
                    200,
                    sid,
                )

            if route == "user/user/changepassword":
                pw = str(p["pwd"]) if is_scalar(p.get("pwd")) and not isinstance(p.get("pwd"), bool) else ""
                cur_pw = str(p["current_password"]) if is_scalar(p.get("current_password")) and not isinstance(p.get("current_password"), bool) else ""
                if len(pw) < 6 or len(pw) > 128:
                    return self._send_json({"success": False, "message": "New password must be between 6 and 128 characters"}, 200, sid)

                sess_uid = int(session.get("user_id") or 0)
                if cur_pw and sess_uid > 0:
                    urow = db.execute("SELECT * FROM t_user WHERE user_code = ?", (sess_uid,)).fetchone()
                    if not urow:
                        session.pop("user_id", None)
                        session.pop("user_email", None)
                        return self._send_json({"success": False, "message": "Session expired, please sign in again"}, 401, sid)
                    email = str_param(p, "email").lower()
                    if email and email != str(urow["email"]).lower():
                        return self._send_json({"success": False, "message": "Email does not match your signed-in account"}, 403, sid)
                    if not verify_password_bcrypt(cur_pw, urow["login_pwd"]):
                        return self._send_json({"success": False, "message": "Current password is incorrect"}, 200, sid)
                    db.execute("UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?", (hash_password_bcrypt(pw), now_str, urow["user_code"]))
                    db.commit()
                    sid, session = self._rotate_session(sid)
                    return self._send_json({"success": True, "message": "Password updated successfully", "data": None}, 200, sid)

                email = str_param(p, "email").lower()
                vcode = str_param(p, "verification_code")
                if not email or not EMAIL_RE.match(email):
                    return self._send_json({"success": False, "message": "Please enter a valid email address"}, 200, sid)
                if not vcode:
                    return self._send_json({"success": False, "message": "Verification code is required"}, 200, sid)

                challenge = session.get("pwd_reset")
                if not isinstance(challenge, dict) or not challenge.get("email") or not challenge.get("code_hash"):
                    return self._send_json({"success": False, "message": "Please request a verification code first"}, 200, sid)
                if int(time.time()) > int(challenge.get("expires_at") or 0):
                    session.pop("pwd_reset", None)
                    return self._send_json({"success": False, "message": "Verification code has expired, please request a new one"}, 200, sid)
                if str(challenge["email"]).lower() != email:
                    return self._send_json({"success": False, "message": "Verification code does not match this email address"}, 200, sid)
                attempts = int(challenge.get("attempts") or 0)
                if attempts >= MAX_RESET_ATTEMPTS:
                    session.pop("pwd_reset", None)
                    return self._send_json({"success": False, "message": "Too many invalid attempts, please request a new code"}, 200, sid)
                if not verify_password_bcrypt(vcode, str(challenge["code_hash"])):
                    attempts += 1
                    if attempts >= MAX_RESET_ATTEMPTS:
                        session.pop("pwd_reset", None)
                        return self._send_json({"success": False, "message": "Too many invalid attempts, please request a new code"}, 200, sid)
                    challenge["attempts"] = attempts
                    return self._send_json({"success": False, "message": "Verification code is incorrect"}, 200, sid)

                urow = db.execute("SELECT user_code FROM t_user WHERE email = ?", (email,)).fetchone()
                if not urow:
                    session.pop("pwd_reset", None)
                    return self._send_json({"success": False, "message": "Account not found for this email"}, 404, sid)

                db.execute("UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?", (hash_password_bcrypt(pw), now_str, urow["user_code"]))
                db.commit()
                session.pop("pwd_reset", None)
                session.pop("user_id", None)
                session.pop("user_email", None)
                return self._send_json({"success": True, "message": "Password changed successfully", "data": None}, 200, sid)

            # Admin Movies CRUD
            if route == "admin/movie/index":
                rows = rows_to_dicts(db.execute("SELECT * FROM t_movies ORDER BY movie_code ASC").fetchall())
                for m in rows:
                    scheds = db.execute("SELECT theater_code, daily_showtimes FROM theater_movie WHERE movie_code = ? ORDER BY theater_code ASC", (m["movie_code"],)).fetchall()
                    m["theater_codes"] = [int(r["theater_code"]) for r in scheds]
                    m["daily_showtimes"] = int(scheds[0]["daily_showtimes"]) if scheds else 4
                return self._send_json({"success": True, "message": "OK", "data": rows}, 200, sid)

            if route == "admin/movie/getmoviebycode":
                mid = id_param(p, "movie_code")
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code is required"}, 200, sid)
                row = db.execute("SELECT * FROM t_movies WHERE movie_code = ?", (mid,)).fetchone()
                if not row:
                    return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                mdata = dict(row)
                scheds = db.execute("SELECT theater_code, daily_showtimes FROM theater_movie WHERE movie_code = ? ORDER BY theater_code ASC", (mid,)).fetchall()
                mdata["theater_codes"] = [int(r["theater_code"]) for r in scheds]
                mdata["daily_showtimes"] = int(scheds[0]["daily_showtimes"]) if scheds else 4
                return self._send_json({"success": True, "message": "OK", "data": mdata}, 200, sid)

            if route == "admin/movie/create":
                mdata, merr = self._prepare_movie_data(p)
                if merr is not None:
                    return self._send_json({"success": False, "message": merr}, 200, sid)

                ds = 4
                if "daily_showtimes" in p and str_param(p, "daily_showtimes") != "":
                    ds = id_param(p, "daily_showtimes")
                    if ds < 1 or ds > 6:
                        return self._send_json({"success": False, "message": "Daily showtimes must be between 1 and 6"}, 200, sid)

                tcodes = int_list_param(p, "theater_codes")
                if tcodes is False:
                    return self._send_json({"success": False, "message": "Invalid theater_codes parameter"}, 200, sid)
                all_tids = [int(r["theater_code"]) for r in db.execute("SELECT theater_code FROM t_theater ORDER BY theater_code ASC").fetchall()]
                if tcodes is None:
                    tcodes = all_tids
                elif any(tid not in all_tids for tid in tcodes):
                    return self._send_json({"success": False, "message": "One or more selected theaters do not exist"}, 200, sid)

                prev_count = int(db.execute("SELECT COUNT(*) FROM t_movies").fetchone()[0])
                if prev_count > 0:
                    universal_offers = [
                        int(r["offer_code"])
                        for r in db.execute("SELECT offer_code, COUNT(*) AS cnt FROM movie_offer GROUP BY offer_code").fetchall()
                        if int(r["cnt"]) >= prev_count
                    ]
                else:
                    universal_offers = [int(r["offer_code"]) for r in db.execute("SELECT offer_code FROM t_offer").fetchall()]

                cur = db.execute(
                    "INSERT INTO t_movies (movie_name, tag, star, movie_type, img, money, times, create_time) VALUES (?,?,?,?,?,?,?,?)",
                    (mdata["movie_name"], mdata["tag"], mdata["star"], mdata["movie_type"], mdata["img"], mdata["money"], mdata["times"], now_str),
                )
                mid = int(cur.lastrowid)
                for tid in tcodes:
                    db.execute(
                        "INSERT INTO theater_movie (theater_code, movie_code, start_date, end_date, daily_showtimes, created_time) VALUES (?,?,?,?,?,?)",
                        (tid, mid, today_str, "2027-12-31", ds, now_str),
                    )
                for oid in universal_offers:
                    vrow = db.execute("SELECT offer_validity FROM t_offer WHERE offer_code = ?", (oid,)).fetchone()
                    vto = vrow["offer_validity"] if vrow and is_valid_date(vrow["offer_validity"]) else "2027-12-31"
                    db.execute(
                        "INSERT INTO movie_offer (movie_code, offer_code, discount_percent, valid_from, valid_to, created_time) VALUES (?,?,?,?,?,?)",
                        (mid, oid, 0.0, today_str, vto, now_str),
                    )
                db.commit()
                return self._send_json({"success": True, "message": "Movie created successfully", "data": {"movie_code": mid}}, 200, sid)

            if route == "admin/movie/update":
                mid = id_param(p, "movie_code")
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code is required"}, 200, sid)
                if not db.execute("SELECT 1 FROM t_movies WHERE movie_code = ?", (mid,)).fetchone():
                    return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)

                mdata, merr = self._prepare_movie_data(p)
                if merr is not None:
                    return self._send_json({"success": False, "message": merr}, 200, sid)

                ds = 4
                if "daily_showtimes" in p and str_param(p, "daily_showtimes") != "":
                    ds = id_param(p, "daily_showtimes")
                    if ds < 1 or ds > 6:
                        return self._send_json({"success": False, "message": "Daily showtimes must be between 1 and 6"}, 200, sid)

                tcodes = int_list_param(p, "theater_codes")
                if tcodes is False:
                    return self._send_json({"success": False, "message": "Invalid theater_codes parameter"}, 200, sid)
                if tcodes is not None:
                    all_tids = [int(r["theater_code"]) for r in db.execute("SELECT theater_code FROM t_theater").fetchall()]
                    if any(tid not in all_tids for tid in tcodes):
                        return self._send_json({"success": False, "message": "One or more selected theaters do not exist"}, 200, sid)

                db.execute(
                    "UPDATE t_movies SET movie_name=?, tag=?, star=?, movie_type=?, img=?, money=?, times=?, update_time=? WHERE movie_code=?",
                    (mdata["movie_name"], mdata["tag"], mdata["star"], mdata["movie_type"], mdata["img"], mdata["money"], mdata["times"], now_str, mid),
                )
                if tcodes is not None:
                    db.execute("DELETE FROM theater_movie WHERE movie_code = ?", (mid,))
                    for tid in tcodes:
                        db.execute(
                            "INSERT INTO theater_movie (theater_code, movie_code, start_date, end_date, daily_showtimes, created_time) VALUES (?,?,?,?,?,?)",
                            (tid, mid, today_str, "2027-12-31", ds, now_str),
                        )
                elif "daily_showtimes" in p:
                    db.execute("UPDATE theater_movie SET daily_showtimes = ? WHERE movie_code = ?", (ds, mid))
                db.commit()
                return self._send_json({"success": True, "message": "Movie updated successfully", "data": {"movie_code": mid}}, 200, sid)

            if route == "admin/movie/delete":
                mid = id_param(p, "movie_code")
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code is required"}, 200, sid)
                if not db.execute("SELECT 1 FROM t_movies WHERE movie_code = ?", (mid,)).fetchone():
                    return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                db.execute("DELETE FROM theater_movie WHERE movie_code = ?", (mid,))
                db.execute("DELETE FROM movie_offer WHERE movie_code = ?", (mid,))
                db.execute("DELETE FROM t_seat WHERE movie_code = ?", (mid,))
                db.execute("DELETE FROM t_movies WHERE movie_code = ?", (mid,))
                db.commit()
                return self._send_json({"success": True, "message": "Movie deleted successfully", "data": {"movie_code": mid}}, 200, sid)

            # Admin Offers CRUD
            if route == "admin/offer/index":
                rows = rows_to_dicts(db.execute("SELECT * FROM t_offer ORDER BY offer_code ASC").fetchall())
                for o in rows:
                    mlinks = db.execute("SELECT movie_code FROM movie_offer WHERE offer_code = ? ORDER BY movie_code ASC", (o["offer_code"],)).fetchall()
                    o["movie_codes"] = [int(r["movie_code"]) for r in mlinks]
                return self._send_json({"success": True, "message": "OK", "data": rows}, 200, sid)

            if route == "admin/offer/getofferbycode":
                oid = id_param(p, "offer_code")
                if oid <= 0:
                    return self._send_json({"success": False, "message": "Valid offer_code is required"}, 200, sid)
                row = db.execute("SELECT * FROM t_offer WHERE offer_code = ?", (oid,)).fetchone()
                if not row:
                    return self._send_json({"success": False, "message": "Offer not found"}, 404, sid)
                odata = dict(row)
                mlinks = db.execute("SELECT movie_code FROM movie_offer WHERE offer_code = ? ORDER BY movie_code ASC", (oid,)).fetchall()
                odata["movie_codes"] = [int(r["movie_code"]) for r in mlinks]
                return self._send_json({"success": True, "message": "OK", "data": odata}, 200, sid)

            if route == "admin/offer/create":
                odata, oerr = self._prepare_offer_data(db, p, 0)
                if oerr is not None:
                    return self._send_json({"success": False, "message": oerr}, 200, sid)

                mcodes = int_list_param(p, "movie_codes")
                if mcodes is False:
                    return self._send_json({"success": False, "message": "Invalid movie_codes parameter"}, 200, sid)
                all_mids = [int(r["movie_code"]) for r in db.execute("SELECT movie_code FROM t_movies ORDER BY movie_code ASC").fetchall()]
                if mcodes is None:
                    mcodes = all_mids
                elif not mcodes and all_mids:
                    return self._send_json({"success": False, "message": "Please select at least one applicable movie for this offer"}, 200, sid)
                elif any(mid not in all_mids for mid in mcodes):
                    return self._send_json({"success": False, "message": "One or more selected movies do not exist"}, 200, sid)

                cur = db.execute(
                    "INSERT INTO t_offer (offer_title, offer_type, offer_description, promo_code, offer_validity, img, badge, money, user_code, create_time) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (odata["offer_title"], odata["offer_type"], odata["offer_description"], odata["promo_code"], odata["offer_validity"], odata["img"], odata["badge"], odata["money"], odata["user_code"], now_str),
                )
                oid = int(cur.lastrowid)
                for mid in mcodes:
                    db.execute(
                        "INSERT INTO movie_offer (movie_code, offer_code, discount_percent, valid_from, valid_to, created_time) VALUES (?,?,?,?,?,?)",
                        (mid, oid, 0.0, today_str, odata["offer_validity"], now_str),
                    )
                db.commit()
                return self._send_json({"success": True, "message": "Offer created successfully", "data": {"offer_code": oid}}, 200, sid)

            if route == "admin/offer/update":
                oid = id_param(p, "offer_code")
                if oid <= 0:
                    return self._send_json({"success": False, "message": "Valid offer_code is required"}, 200, sid)
                if not db.execute("SELECT 1 FROM t_offer WHERE offer_code = ?", (oid,)).fetchone():
                    return self._send_json({"success": False, "message": "Offer not found"}, 404, sid)

                odata, oerr = self._prepare_offer_data(db, p, oid)
                if oerr is not None:
                    return self._send_json({"success": False, "message": oerr}, 200, sid)

                mcodes = int_list_param(p, "movie_codes")
                if mcodes is False:
                    return self._send_json({"success": False, "message": "Invalid movie_codes parameter"}, 200, sid)
                all_mids = [int(r["movie_code"]) for r in db.execute("SELECT movie_code FROM t_movies ORDER BY movie_code ASC").fetchall()]
                if mcodes is not None:
                    if not mcodes and all_mids:
                        return self._send_json({"success": False, "message": "Please select at least one applicable movie for this offer"}, 200, sid)
                    if any(mid not in all_mids for mid in mcodes):
                        return self._send_json({"success": False, "message": "One or more selected movies do not exist"}, 200, sid)

                db.execute(
                    "UPDATE t_offer SET offer_title=?, offer_type=?, offer_description=?, promo_code=?, offer_validity=?, img=?, badge=?, money=?, user_code=?, update_time=? WHERE offer_code=?",
                    (odata["offer_title"], odata["offer_type"], odata["offer_description"], odata["promo_code"], odata["offer_validity"], odata["img"], odata["badge"], odata["money"], odata["user_code"], now_str, oid),
                )
                if mcodes is not None:
                    db.execute("DELETE FROM movie_offer WHERE offer_code = ?", (oid,))
                    for mid in mcodes:
                        db.execute(
                            "INSERT INTO movie_offer (movie_code, offer_code, discount_percent, valid_from, valid_to, created_time) VALUES (?,?,?,?,?,?)",
                            (mid, oid, 0.0, today_str, odata["offer_validity"], now_str),
                        )
                else:
                    db.execute("UPDATE movie_offer SET valid_to = ? WHERE offer_code = ?", (odata["offer_validity"], oid))
                db.commit()
                return self._send_json({"success": True, "message": "Offer updated successfully", "data": {"offer_code": oid}}, 200, sid)

            if route == "admin/offer/delete":
                oid = id_param(p, "offer_code")
                if oid <= 0:
                    return self._send_json({"success": False, "message": "Valid offer_code is required"}, 200, sid)
                if not db.execute("SELECT 1 FROM t_offer WHERE offer_code = ?", (oid,)).fetchone():
                    return self._send_json({"success": False, "message": "Offer not found"}, 404, sid)
                db.execute("DELETE FROM movie_offer WHERE offer_code = ?", (oid,))
                db.execute("DELETE FROM t_offer WHERE offer_code = ?", (oid,))
                db.commit()
                return self._send_json({"success": True, "message": "Offer deleted successfully", "data": {"offer_code": oid}}, 200, sid)

            # Admin Seats
            if route == "admin/seat/index":
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
                seat_id = id_param(p, "seat_code")
                if seat_id <= 0:
                    return self._send_json({"success": False, "message": "Valid seat_code is required"}, 200, sid)
                if not db.execute("SELECT 1 FROM t_seat WHERE seat_code = ?", (seat_id,)).fetchone():
                    return self._send_json({"success": False, "message": "Seat booking not found"}, 404, sid)
                db.execute("DELETE FROM t_seat WHERE seat_code = ?", (seat_id,))
                db.commit()
                return self._send_json({"success": True, "message": "Seat booking deleted", "data": {"seat_code": seat_id}}, 200, sid)

            # Admin Theaters CRUD
            if route == "admin/theater/index":
                rows = db.execute("SELECT * FROM t_theater ORDER BY theater_code ASC").fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "admin/theater/gettheaterbycode":
                tid = id_param(p, "theater_code")
                if tid <= 0:
                    return self._send_json({"success": False, "message": "Valid theater_code is required"}, 200, sid)
                row = db.execute("SELECT * FROM t_theater WHERE theater_code = ?", (tid,)).fetchone()
                if not row:
                    return self._send_json({"success": False, "message": "Theater not found"}, 404, sid)
                return self._send_json({"success": True, "message": "OK", "data": dict(row)}, 200, sid)

            if route in ("admin/theater/create", "admin/theater/update"):
                is_update = route.endswith("/update")
                tid = id_param(p, "theater_code") if is_update else 0
                if is_update:
                    if tid <= 0:
                        return self._send_json({"success": False, "message": "Valid theater_code is required"}, 200, sid)
                    if not db.execute("SELECT 1 FROM t_theater WHERE theater_code = ?", (tid,)).fetchone():
                        return self._send_json({"success": False, "message": "Theater not found"}, 404, sid)
                tname = str_param(p, "theater_name")
                addr = str_param(p, "address")
                img = str_param(p, "img")
                star_raw = p.get("star", 4.8)
                if not tname or len(tname) > 200:
                    return self._send_json({"success": False, "message": "Theater name is required (1-200 characters)"}, 200, sid)
                if not addr or len(addr) > 500:
                    return self._send_json({"success": False, "message": "Theater address is required (1-500 characters)"}, 200, sid)
                if not img or not is_safe_asset_url(img):
                    return self._send_json({"success": False, "message": "A valid theater image path or URL is required"}, 200, sid)
                try:
                    if isinstance(star_raw, bool) or (star_raw is not None and not is_scalar(star_raw)):
                        raise ValueError
                    star = float((str(star_raw).strip() if star_raw is not None else "") or "4.8")
                    if star < 0 or star > 5:
                        raise ValueError
                except ValueError:
                    return self._send_json({"success": False, "message": "Rating must be between 0.0 and 5.0"}, 200, sid)

                amenity = str_param(p, "amenity")[:500] or None
                reviews = str_param(p, "reviews")[:50] or None
                distance = str_param(p, "distance")[:50] or None
                theater_id = str_param(p, "theater_id")[:100] or None
                if is_update:
                    db.execute(
                        "UPDATE t_theater SET theater_name=?, address=?, amenity=?, star=?, img=?, reviews=?, distance=?, theater_id=?, update_time=? WHERE theater_code=?",
                        (tname, addr, amenity, round(star, 1), img, reviews, distance, theater_id, now_str, tid),
                    )
                    db.commit()
                    return self._send_json({"success": True, "message": "Theater updated successfully", "data": {"theater_code": tid}}, 200, sid)
                else:
                    cur = db.execute(
                        "INSERT INTO t_theater (theater_name, address, amenity, star, img, reviews, distance, theater_id, create_time) VALUES (?,?,?,?,?,?,?,?,?)",
                        (tname, addr, amenity, round(star, 1), img, reviews, distance, theater_id, now_str),
                    )
                    new_tid = int(cur.lastrowid)
                    for m in db.execute("SELECT movie_code FROM t_movies").fetchall():
                        db.execute(
                            "INSERT INTO theater_movie (theater_code, movie_code, start_date, end_date, daily_showtimes, created_time) VALUES (?,?,?,?,?,?)",
                            (new_tid, int(m["movie_code"]), today_str, "2027-12-31", 3, now_str),
                        )
                    db.commit()
                    return self._send_json({"success": True, "message": "Theater created successfully", "data": {"theater_code": new_tid}}, 200, sid)

            if route == "admin/theater/delete":
                tid = id_param(p, "theater_code")
                if tid <= 0:
                    return self._send_json({"success": False, "message": "Valid theater_code is required"}, 200, sid)
                if not db.execute("SELECT 1 FROM t_theater WHERE theater_code = ?", (tid,)).fetchone():
                    return self._send_json({"success": False, "message": "Theater not found"}, 404, sid)
                db.execute("DELETE FROM theater_movie WHERE theater_code = ?", (tid,))
                db.execute("DELETE FROM t_seat WHERE theater_code = ?", (tid,))
                db.execute("DELETE FROM t_theater WHERE theater_code = ?", (tid,))
                db.commit()
                return self._send_json({"success": True, "message": "Theater deleted successfully", "data": {"theater_code": tid}}, 200, sid)

            # Admin Users CRUD
            if route == "admin/user/index":
                rows = db.execute("SELECT user_code, user_name, email, create_time, update_time FROM t_user ORDER BY user_code ASC").fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "admin/user/getuserbycode":
                uid = id_param(p, "user_code")
                if uid <= 0:
                    return self._send_json({"success": False, "message": "Valid user_code is required"}, 200, sid)
                row = db.execute("SELECT user_code, user_name, email, create_time, update_time FROM t_user WHERE user_code = ?", (uid,)).fetchone()
                if not row:
                    return self._send_json({"success": False, "message": "User not found"}, 404, sid)
                return self._send_json({"success": True, "message": "OK", "data": dict(row)}, 200, sid)

            if route == "admin/user/create":
                uname = str_param(p, "user_name")
                email = str_param(p, "email").lower()
                pw = str(p["login_pwd"]) if is_scalar(p.get("login_pwd")) and not isinstance(p.get("login_pwd"), bool) else ""
                if not uname or len(uname) > 50:
                    return self._send_json({"success": False, "message": "Valid username (1-50 characters) is required"}, 200, sid)
                if not email or not EMAIL_RE.match(email) or len(email) > 100:
                    return self._send_json({"success": False, "message": "Valid email address is required"}, 200, sid)
                if len(pw) < 6 or len(pw) > 128:
                    return self._send_json({"success": False, "message": "Password must be between 6 and 128 characters"}, 200, sid)
                if db.execute("SELECT 1 FROM t_user WHERE email = ?", (email,)).fetchone():
                    return self._send_json({"success": False, "message": "Email is already registered"}, 200, sid)

                cur = db.execute(
                    "INSERT INTO t_user (user_name, email, login_pwd, create_time) VALUES (?,?,?,?)",
                    (uname, email, hash_password_bcrypt(pw), now_str),
                )
                db.commit()
                return self._send_json({"success": True, "message": "User created successfully", "data": {"user_code": int(cur.lastrowid)}}, 200, sid)

            if route == "admin/user/update":
                uid = id_param(p, "user_code")
                if uid <= 0:
                    return self._send_json({"success": False, "message": "Valid user_code is required"}, 200, sid)
                if not db.execute("SELECT 1 FROM t_user WHERE user_code = ?", (uid,)).fetchone():
                    return self._send_json({"success": False, "message": "User not found"}, 404, sid)

                uname = str_param(p, "user_name")
                email = str_param(p, "email").lower()
                pw = str(p["login_pwd"]) if is_scalar(p.get("login_pwd")) and not isinstance(p.get("login_pwd"), bool) else ""
                if not uname or len(uname) > 50:
                    return self._send_json({"success": False, "message": "Valid username (1-50 characters) is required"}, 200, sid)
                if not email or not EMAIL_RE.match(email) or len(email) > 100:
                    return self._send_json({"success": False, "message": "Valid email address is required"}, 200, sid)
                if pw and (len(pw) < 6 or len(pw) > 128):
                    return self._send_json({"success": False, "message": "New password must be between 6 and 128 characters"}, 200, sid)
                if db.execute("SELECT 1 FROM t_user WHERE email = ? AND user_code <> ?", (email, uid)).fetchone():
                    return self._send_json({"success": False, "message": "Email is already registered to another user"}, 200, sid)

                if pw:
                    db.execute(
                        "UPDATE t_user SET user_name=?, email=?, login_pwd=?, update_time=? WHERE user_code=?",
                        (uname, email, hash_password_bcrypt(pw), now_str, uid),
                    )
                else:
                    db.execute(
                        "UPDATE t_user SET user_name=?, email=?, update_time=? WHERE user_code=?",
                        (uname, email, now_str, uid),
                    )
                db.commit()
                return self._send_json({"success": True, "message": "User updated successfully", "data": {"user_code": uid}}, 200, sid)

            if route == "admin/user/delete":
                uid = id_param(p, "user_code")
                if uid <= 0:
                    return self._send_json({"success": False, "message": "Valid user_code is required"}, 200, sid)
                if not db.execute("SELECT 1 FROM t_user WHERE user_code = ?", (uid,)).fetchone():
                    return self._send_json({"success": False, "message": "User not found"}, 404, sid)
                db.execute("UPDATE t_seat SET user_code = NULL WHERE user_code = ?", (uid,))
                db.execute("UPDATE t_offer SET user_code = NULL WHERE user_code = ?", (uid,))
                db.execute("DELETE FROM t_user WHERE user_code = ?", (uid,))
                db.commit()
                return self._send_json({"success": True, "message": "User deleted successfully", "data": {"user_code": uid}}, 200, sid)

            self._send_json({"success": False, "message": f"Unknown route {route}"}, 404, sid)

    return Handler


def start_background_server() -> tuple[ThreadingHTTPServer, str]:
    state = ContractState()
    server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(state))
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://127.0.0.1:{port}"
