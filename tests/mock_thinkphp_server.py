#!/usr/bin/env python3
"""
1:1 SQLite-Backed ThinkPHP 5.1 Contract Server for End-to-End & Concurrency Verification.
Mirrors every PHP controller in `application/` line-for-line:
- Bcrypt ($2y$10$) password & reset-code hashing (6–72 byte ceiling on both write and login), session rotation, and isolated logout
- Role-isolated brute-force login rate limiting (`user_login` / `admin_login`, 5 attempts -> HTTP 429 lockout with auto-expiry cleanup)
- Same-Origin CSRF verification (`Origin`/`Referer` host+port matching), `SameSite=Lax` cookies, and non-empty constant-time X-Admin-Token CSRF check
- Strict base-10 positive integer (`parse_positive_int`), scalar string (`scalar_str`), asset URI guard (`is_valid_asset_path`), CSV formula-injection guard (`sanitize_csv_cell`), and `"0"` preservation
- Partial-update field merging (`merge_existing_payload`), atomic batch deletion (`resolve_target_ids`), whitelisted sorting/filtering/pagination (`paginate_and_sort`), and non-destructive `theater_movie` / `movie_offer` syncing
- Authoritative Session::get('user_id') enforcement in Seat, past-date booking guard, screening start-time refund cutoff (`is_screening_cancelable`), atomic transactional seat locking & cancellation, and ROUND_HALF_UP cent math
- Strictly binds local HTTP listeners inside isolated port range 4300–4399 (or `CINETIX_PORT_RANGE` override)
"""

from __future__ import annotations

import crypt
import datetime as dt
from decimal import Decimal, ROUND_HALF_UP
from functools import cmp_to_key
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
MAX_PASSWORD_BYTES = 72
MAX_RESET_ATTEMPTS = 5
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 60
MAX_BATCH_IDS = 200
ALLOWED_PAYMENT_METHODS = {"card", "paypal", "applepay", "googlepay"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
POS_INT_RE = re.compile(r"^\d+$")
CSV_FORMULA_RE = re.compile(r"^(?:[\t\r\n ]*[=+\-@]|[\t\r])")
ASSET_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)
SAFE_ASSET_SCHEME_RE = re.compile(r"^(?:https?://|data:image/)", re.IGNORECASE)
CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")
AMPM_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$")
H24_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$")
SEAT_SPLIT_RE = re.compile(r"^([A-Z]+)(\d+)$")
MOVIE_ALLOWED_FIELDS = ("movie_name", "tag", "star", "movie_type", "img", "money", "times")
THEATER_ALLOWED_FIELDS = ("theater_name", "address", "amenity", "star", "img", "reviews", "distance", "theater_id")
OFFER_ALLOWED_FIELDS = ("offer_title", "offer_type", "offer_description", "promo_code", "offer_validity", "img", "badge", "money", "user_code")


def round_cents(val: float) -> float:
    return float(Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def sanitize_csv_cell(value) -> str:
    if value is None or isinstance(value, (bool, list, dict)):
        return ""
    if isinstance(value, (int, float)):
        return str(value) if math.isfinite(float(value)) else ""
    s = str(value)
    if s and CSV_FORMULA_RE.match(s):
        return "'" + s
    return s


def format_csv_row(cells: list) -> str:
    encoded: list[str] = []
    for cell in cells:
        safe = sanitize_csv_cell(cell)
        if any(ch in safe for ch in ('"', ',', '\r', '\n')):
            encoded.append('"' + safe.replace('"', '""') + '"')
        else:
            encoded.append(safe)
    return ",".join(encoded)


def hash_password_bcrypt(password: str) -> str:
    salt = crypt.mksalt(crypt.METHOD_BLOWFISH, rounds=1024).replace("$2b$", "$2y$", 1)
    return crypt.crypt(password, salt)


def verify_password_bcrypt(password: str, stored_hash: str) -> bool:
    if not stored_hash or not password or len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return False
    if stored_hash.startswith(("$2y$", "$2b$", "$2a$")):
        computed = crypt.crypt(password, stored_hash)
        return hmac.compare_digest(computed, stored_hash)
    return hmac.compare_digest(stored_hash, password)


def escape_like(keyword: str) -> str:
    return keyword.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def is_valid_iso_date(val) -> bool:
    if isinstance(val, (bool, list, dict)) or val is None:
        return False
    s = str(val).strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return False
    try:
        dt.date.fromisoformat(s)
        return True
    except ValueError:
        return False


def is_valid_asset_path(val) -> bool:
    if not isinstance(val, str):
        return False
    trimmed = val.strip()
    if not trimmed or len(trimmed) > 500 or CONTROL_CHAR_RE.search(trimmed):
        return False
    if ASSET_SCHEME_RE.match(trimmed):
        return bool(SAFE_ASSET_SCHEME_RE.match(trimmed))
    return True


def parse_screening_minutes(time_val) -> int:
    if time_val is None or isinstance(time_val, (bool, list, dict)):
        return -1
    s = str(time_val).strip()
    m12 = AMPM_TIME_RE.match(s)
    if m12:
        hour = int(m12.group(1))
        minute = int(m12.group(2))
        if hour < 1 or hour > 12 or minute > 59:
            return -1
        hour24 = (hour % 12) + (12 if m12.group(3).upper() == "PM" else 0)
        return hour24 * 60 + minute
    m24 = H24_TIME_RE.match(s)
    if m24:
        return int(m24.group(1)) * 60 + int(m24.group(2))
    return -1


def is_screening_cancelable(date_val, time_val) -> bool:
    iso_date = str(date_val or "").strip()
    if not is_valid_iso_date(iso_date):
        return False
    now_dt = dt.datetime.now()
    today_iso = now_dt.strftime("%Y-%m-%d")
    if iso_date < today_iso:
        return False
    if iso_date > today_iso:
        return True
    mins = parse_screening_minutes(time_val)
    if mins < 0:
        return False
    now_mins = now_dt.hour * 60 + now_dt.minute
    return mins > now_mins


def compare_seat_codes(a, b) -> int:
    sa = str(a or "").strip().upper()
    sb = str(b or "").strip().upper()
    if sa == sb:
        return 0
    ma = SEAT_SPLIT_RE.match(sa)
    mb = SEAT_SPLIT_RE.match(sb)
    if ma and mb:
        if ma.group(1) == mb.group(1):
            na, nb = int(ma.group(2)), int(mb.group(2))
            return -1 if na < nb else (1 if na > nb else 0)
        return -1 if ma.group(1) < mb.group(1) else 1
    return -1 if sa < sb else 1


def compare_screening_rows(a: dict, b: dict) -> int:
    da = str(a.get("date") or "")
    db = str(b.get("date") or "")
    if da != db:
        return -1 if da < db else 1
    ma = parse_screening_minutes(a.get("time") or "")
    mb = parse_screening_minutes(b.get("time") or "")
    if ma != mb:
        return -1 if ma < mb else 1
    ia = int(a.get("seat_code") or 0)
    ib = int(b.get("seat_code") or 0)
    return -1 if ia < ib else (1 if ia > ib else 0)


def parse_positive_int(raw) -> int:
    if isinstance(raw, bool) or raw is None or isinstance(raw, (list, dict, float)):
        return 0
    if isinstance(raw, int):
        return raw if raw > 0 else 0
    s = str(raw).strip()
    if not POS_INT_RE.match(s):
        return 0
    val = int(s)
    return val if val > 0 else 0


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


def scalar_str(val, trim: bool = True, default: str = "") -> str:
    if val is None or isinstance(val, (bool, list, dict)):
        return default
    s = str(val)
    return s.strip() if trim else s


def merge_existing_payload(existing: dict, payload: dict, allowed_fields: tuple[str, ...]) -> dict:
    merged: dict = {}
    for field in allowed_fields:
        if field in payload:
            merged[field] = payload[field]
        elif field in existing:
            merged[field] = existing[field]
    return merged


def normalize_id_array(raw) -> list[int]:
    if isinstance(raw, str):
        raw = [] if not raw.strip() else raw.split(",")
    if not isinstance(raw, list):
        return []
    seen: dict[int, int] = {}
    for item in raw:
        val = parse_positive_int(item)
        if val > 0:
            seen[val] = val
    return list(seen.values())


def resolve_target_ids(payload: dict, single_key: str, batch_key: str, allow_direct: bool = False) -> list[int]:
    if allow_direct and "__direct_arg__" in payload and payload["__direct_arg__"] not in ("", None):
        one = parse_positive_int(payload["__direct_arg__"])
        return [one] if one > 0 else []
    if batch_key in payload:
        return normalize_id_array(payload[batch_key])[:MAX_BATCH_IDS]
    if single_key in payload:
        raw_single = payload[single_key]
        if isinstance(raw_single, list):
            return normalize_id_array(raw_single)[:MAX_BATCH_IDS]
        one = parse_positive_int(raw_single)
        return [one] if one > 0 else []
    return []


def paginate_and_sort(
    rows: list[dict],
    sort_map: dict,
    default_sort: str,
    payload: dict,
    filter_fn=None,
) -> tuple[list[dict], dict]:
    total_count = len(rows)
    if filter_fn is not None:
        rows = [r for r in rows if filter_fn(r)]
    else:
        rows = list(rows)
    filtered_count = len(rows)

    req_sort = scalar_str(payload.get("sort"), default=default_sort) or default_sort
    sort_key = req_sort if req_sort in sort_map else default_sort
    sorter = sort_map.get(sort_key)
    if callable(sorter):
        rows = sorted(rows, key=sorter)

    raw_page = parse_positive_int(payload.get("page"))
    raw_page_size = parse_positive_int(payload.get("page_size"))
    if raw_page > 0 or raw_page_size > 0:
        page_size = min(100, max(1, raw_page_size if raw_page_size > 0 else 25))
        total_pages = max(1, math.ceil(filtered_count / page_size)) if filtered_count > 0 else 1
        page = min(total_pages, max(1, raw_page if raw_page > 0 else 1))
        start = (page - 1) * page_size
        rows = rows[start : start + page_size]
    else:
        page = 1
        page_size = max(1, filtered_count)
        total_pages = 1

    return rows, {
        "total": total_count,
        "filtered": filtered_count,
        "returned": len(rows),
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "sort": sort_key,
    }


def resolve_valid_ids(db: sqlite3.Connection, table: str, pk: str, raw) -> list[int]:
    cand = normalize_id_array(raw)
    if not cand:
        return []
    ph = ",".join("?" for _ in cand)
    rows = db.execute(f"SELECT {pk} FROM {table} WHERE {pk} IN ({ph}) ORDER BY {pk} ASC", cand).fetchall()
    return [int(r[pk]) for r in rows]


def map_relation_ids(db: sqlite3.Connection, table: str, group_col: str, val_col: str) -> dict[int, list[int]]:
    rows = db.execute(f"SELECT {group_col}, {val_col} FROM {table}").fetchall()
    grouped: dict[int, list[int]] = {}
    for row in rows:
        grouped.setdefault(int(row[group_col]), []).append(int(row[val_col]))
    return {k: sorted(v) for k, v in grouped.items()}


def sync_schedule_rows(db: sqlite3.Connection, where_col: str, where_id: int, target_ids: list[int], target_col: str, now_str: str) -> None:
    if not target_ids:
        db.execute(f"DELETE FROM theater_movie WHERE {where_col} = ?", (where_id,))
        return
    ph = ",".join("?" for _ in target_ids)
    db.execute(f"DELETE FROM theater_movie WHERE {where_col} = ? AND {target_col} NOT IN ({ph})", [where_id, *target_ids])
    existing = {
        int(r[target_col])
        for r in db.execute(f"SELECT {target_col} FROM theater_movie WHERE {where_col} = ?", (where_id,)).fetchall()
    }
    for tid in target_ids:
        if tid not in existing:
            db.execute(
                f"INSERT INTO theater_movie ({where_col}, {target_col}, start_date, end_date, daily_showtimes, created_time) VALUES (?,?,?,?,?,?)",
                (where_id, int(tid), "2026-01-01", "2027-12-31", 4, now_str),
            )


def sync_movie_offer_rows(
    db: sqlite3.Connection,
    where_col: str,
    where_id: int,
    target_ids: list[int],
    target_col: str,
    now_str: str,
    fixed_valid_to: str | None = None,
) -> None:
    if not target_ids:
        db.execute(f"DELETE FROM movie_offer WHERE {where_col} = ?", (where_id,))
        return
    ph = ",".join("?" for _ in target_ids)
    db.execute(f"DELETE FROM movie_offer WHERE {where_col} = ? AND {target_col} NOT IN ({ph})", [where_id, *target_ids])
    if fixed_valid_to and is_valid_iso_date(fixed_valid_to):
        db.execute(f"UPDATE movie_offer SET valid_to = ? WHERE {where_col} = ?", (fixed_valid_to, where_id))
    existing = {
        int(r[target_col])
        for r in db.execute(f"SELECT {target_col} FROM movie_offer WHERE {where_col} = ?", (where_id,)).fetchall()
    }
    for tid in target_ids:
        if tid in existing:
            continue
        if fixed_valid_to and is_valid_iso_date(fixed_valid_to):
            vto = fixed_valid_to
        elif target_col == "offer_code":
            orow = db.execute("SELECT offer_validity FROM t_offer WHERE offer_code = ?", (tid,)).fetchone()
            vto = orow["offer_validity"] if orow and is_valid_iso_date(orow["offer_validity"] or "") else "2027-12-31"
        else:
            vto = "2027-12-31"
        db.execute(
            f"INSERT INTO movie_offer ({where_col}, {target_col}, discount_percent, valid_from, valid_to, created_time) VALUES (?,?,?,?,?,?)",
            (where_id, int(tid), 0.0, "2026-01-01", vto, now_str),
        )


def calculate_pricing(unit_price: float, seat_count: int, promo_money: float = 0.0) -> dict:
    count = max(0, int(seat_count))
    unit = round_cents(max(0.0, float(unit_price)))
    subtotal = round_cents(unit * count)
    group_discount = round_cents(subtotal * GROUP_DISCOUNT_RATE) if count >= GROUP_DISCOUNT_MIN_SEATS else 0.0
    promo_discount = round_cents(max(0.0, float(promo_money)))
    total_discount = round_cents(group_discount + promo_discount)
    service_fee = SERVICE_FEE if count > 0 else 0.0
    total_amount = max(0.0, round_cents(subtotal - total_discount + service_fee))
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
    check_date = screening_date if is_valid_iso_date(screening_date or "") else today
    validity = str(offer.get("offer_validity") or "").strip()
    if is_valid_iso_date(validity):
        if validity < today:
            return {"valid": False, "status": 200, "message": "This promo code has expired", "offer": None}
        if validity < check_date:
            return {"valid": False, "status": 200, "message": "This promo code expires before the selected screening date", "offer": None}

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
        vfrom = str(link["valid_from"] or "").strip()
        vto = str(link["valid_to"] or "").strip()
        if vfrom and check_date < vfrom:
            return {
                "valid": False,
                "status": 200,
                "message": "This promo code is not yet active for the selected date",
                "offer": None,
            }
        if vto and check_date > vto:
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
        "money": round_cents(float(offer["money"])),
        "user_code": owner_uid if owner_uid > 0 else None,
    }
    return {"valid": True, "status": 200, "message": "Promo code applied", "offer": safe_offer}


def prepare_movie_data(p: dict) -> tuple[dict | None, str | None]:
    mname = scalar_str(p.get("movie_name"))
    mtype = scalar_str(p.get("movie_type"))
    mimg = scalar_str(p.get("img"))
    mtimes = scalar_str(p.get("times"))
    mtag = scalar_str(p.get("tag"))

    if mname == "" or len(mname) > 200:
        return None, "Movie title (1-200 characters) is required"
    if mtype == "" or len(mtype) > 50:
        return None, "Movie genre (1-50 characters) is required"
    if not is_valid_asset_path(mimg):
        return None, "Poster image path or URL (1-500 characters) is required"
    if mtimes == "" or len(mtimes) > 50:
        return None, "Movie duration (1-50 characters) is required"
    if mtag != "" and len(mtag) > 50:
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
        "money": round_cents(money_val),
        "times": mtimes,
    }, None


def prepare_theater_data(p: dict) -> tuple[dict | None, str | None]:
    tname = scalar_str(p.get("theater_name"))
    taddr = scalar_str(p.get("address"))
    timg = scalar_str(p.get("img"))
    tam = scalar_str(p.get("amenity"))
    trev = scalar_str(p.get("reviews"))
    tdist = scalar_str(p.get("distance"))
    tid_str = scalar_str(p.get("theater_id"))

    if tname == "" or len(tname) > 200:
        return None, "Theater name (1-200 characters) is required"
    if taddr == "" or len(taddr) > 500:
        return None, "Theater address (1-500 characters) is required"
    if not is_valid_asset_path(timg):
        return None, "Theater image path or URL (1-500 characters) is required"
    if tam != "" and len(tam) > 500:
        return None, "Amenities list must be 500 characters or fewer"
    if trev != "" and len(trev) > 50:
        return None, "Reviews label must be 50 characters or fewer"
    if tdist != "" and len(tdist) > 50:
        return None, "Distance label must be 50 characters or fewer"
    if tid_str != "" and len(tid_str) > 100:
        return None, "Theater code label must be 100 characters or fewer"

    raw_star = p.get("star")
    star_val = 4.8 if (raw_star is None or (not isinstance(raw_star, (bool, list, dict)) and str(raw_star).strip() == "")) else parse_finite_float(raw_star)
    if star_val is None or star_val < 0 or star_val > 5:
        return None, "Rating must be between 0.0 and 5.0"

    return {
        "theater_name": tname,
        "address": taddr,
        "amenity": tam if tam != "" else None,
        "star": round(star_val, 1),
        "img": timg,
        "reviews": trev if trev != "" else None,
        "distance": tdist if tdist != "" else None,
        "theater_id": tid_str if tid_str != "" else None,
    }, None


def prepare_offer_data(db: sqlite3.Connection, p: dict, exclude_offer_id: int) -> tuple[dict | None, str | None]:
    otitle = scalar_str(p.get("offer_title"))
    otype = scalar_str(p.get("offer_type"))
    odesc = scalar_str(p.get("offer_description"))
    ocode = scalar_str(p.get("promo_code"))
    oval = scalar_str(p.get("offer_validity"))
    oimg = scalar_str(p.get("img"))
    obadge = scalar_str(p.get("badge"))

    if otitle == "" or len(otitle) > 200:
        return None, "Offer title (1-200 characters) is required"
    if otype == "" or len(otype) > 100:
        return None, "Offer category (1-100 characters) is required"
    if odesc == "" or len(odesc) > 500:
        return None, "Offer description (1-500 characters) is required"
    if ocode == "" or len(ocode) > 100:
        return None, "Promo code (1-100 characters) is required"
    if oval == "" or not is_valid_iso_date(oval):
        return None, "Validity date must use YYYY-MM-DD format"
    if not is_valid_asset_path(oimg):
        return None, "Offer image path or URL (1-500 characters) is required"
    if obadge != "" and len(obadge) > 50:
        return None, "Highlight badge must be 50 characters or fewer"

    money_val = parse_finite_float(p.get("money"))
    if money_val is None or money_val < 0:
        return None, "Discount amount must be a non-negative number"

    owner_uid = None
    if "user_code" in p and p["user_code"] is not None:
        raw_uc_val = p["user_code"]
        raw_uc = "" if isinstance(raw_uc_val, (bool, list, dict)) else str(raw_uc_val).strip()
        if raw_uc != "":
            cand_uid = parse_positive_int(raw_uc)
            if cand_uid <= 0 or not db.execute("SELECT 1 FROM t_user WHERE user_code = ?", (cand_uid,)).fetchone():
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
        "badge": obadge if obadge != "" else None,
        "money": round_cents(money_val),
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
    pw_bytes = len(password.encode("utf-8"))
    if name == "" or len(name) > 50:
        return "Valid username (1-50 characters) is required"
    if email == "" or not EMAIL_RE.match(email) or len(email) > 100:
        return "Valid email address is required"
    if require_password and (pw_bytes < 6 or pw_bytes > MAX_PASSWORD_BYTES):
        return "Password must be 6-72 characters"
    if not require_password and password != "" and (pw_bytes < 6 or pw_bytes > MAX_PASSWORD_BYTES):
        return "New password must be 6-72 characters"

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

        def _rotate_session(self, old_sid: str, updates: dict | None = None) -> tuple[str, dict]:
            with state.session_lock:
                existing = dict(state.sessions.pop(old_sid, None) or {})
                if updates:
                    existing.update(updates)
                new_sid = secrets.token_hex(16)
                state.sessions[new_sid] = existing
                return new_sid, existing

        def _destroy_session(self, sid: str) -> None:
            with state.session_lock:
                state.sessions.pop(sid, None)

        def _clear_login_throttle(self, session: dict, scope: str) -> None:
            with state.session_lock:
                session.pop(f"{scope}_attempts", None)
                session.pop(f"{scope}_lock_until", None)
                session.pop(f"{scope}_window_until", None)

        def _check_login_throttle(self, session: dict, scope: str) -> bool:
            now_ts = int(time.time())
            with state.session_lock:
                lock_until = int(session.get(f"{scope}_lock_until") or 0)
                window_until = int(session.get(f"{scope}_window_until") or 0)
                if lock_until > 0:
                    if now_ts < lock_until:
                        return False
                    self._clear_login_throttle(session, scope)
                    return True
                if window_until > 0 and now_ts > window_until:
                    self._clear_login_throttle(session, scope)
                return True

        def _record_login_failure(self, session: dict, scope: str) -> bool:
            now_ts = int(time.time())
            ttl = max(5, int(os.environ.get("AUTH_LOGIN_LOCKOUT", str(LOGIN_LOCKOUT_SECONDS))))
            with state.session_lock:
                window_until = int(session.get(f"{scope}_window_until") or 0)
                attempts = (int(session.get(f"{scope}_attempts") or 0) + 1) if (window_until > 0 and now_ts <= window_until) else 1
                session[f"{scope}_attempts"] = attempts
                session[f"{scope}_window_until"] = now_ts + ttl
                if attempts >= MAX_LOGIN_ATTEMPTS:
                    session[f"{scope}_lock_until"] = now_ts + ttl
                    return True
                return False

        def _verify_same_origin(self) -> bool:
            source = (self.headers.get("Origin") or "").strip()
            if not source:
                source = (self.headers.get("Referer") or "").strip()
            if not source:
                return True
            if source.lower() == "null":
                return False
            parsed = urllib.parse.urlparse(source)
            if not parsed.hostname:
                return False
            source_auth = parsed.hostname.lower() + (f":{parsed.port}" if parsed.port else "")
            expected_host = (self.headers.get("Host") or "").strip().lower()
            if not expected_host:
                return True
            if source_auth == expected_host:
                return True
            host_parts = expected_host.split(":", 1)
            expected_hostname_only = host_parts[0]
            expected_port = host_parts[1] if len(host_parts) > 1 else ""
            return parsed.port is None and expected_port in ("", "80", "443") and parsed.hostname.lower() == expected_hostname_only

        def _send_json(self, body: dict, status: int = 200, sid: str | None = None, clear_cookie: bool = False) -> None:
            raw = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            if clear_cookie:
                self.send_header("Set-Cookie", "PHPSESSID=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
            elif sid:
                self.send_header("Set-Cookie", f"PHPSESSID={sid}; Path=/; HttpOnly; SameSite=Lax")
            self.end_headers()
            self.wfile.write(raw)

        def _send_csv(self, filename: str, headers: list[str], rows: list[list], sid: str | None = None) -> None:
            clean_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename) or "export.csv"
            lines = [format_csv_row(headers), *(format_csv_row(r) for r in rows)]
            raw = ("\ufeff" + "\r\n".join(lines)).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=UTF-8")
            self.send_header("Content-Disposition", f'attachment; filename="{clean_name}"')
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(raw)))
            if sid:
                self.send_header("Set-Cookie", f"PHPSESSID={sid}; Path=/; HttpOnly; SameSite=Lax")
            self.end_headers()
            self.wfile.write(raw)

        def _parse_qs_into(self, qs_str: str, target: dict) -> None:
            for k, v in urllib.parse.parse_qs(qs_str, keep_blank_values=True).items():
                if k.endswith("[]"):
                    target[k[:-2]] = list(v)
                else:
                    target[k] = v[-1]

        def _parse_payload(self, query_str: str, path_params: dict | None = None) -> dict:
            params: dict = dict(path_params or {})
            self._parse_qs_into(query_str, params)
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
                    self._parse_qs_into(raw_body, params)
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

        def _id_param(self, p: dict, key: str, allow_direct: bool = False) -> int:
            raw = p.get("__direct_arg__") if (allow_direct and "__direct_arg__" in p) else p.get(key)
            return parse_positive_int(raw)

        def _optional_id_with_default(self, p: dict, key: str, default_id: int = 1) -> int:
            if key not in p or p[key] is None or p[key] == "":
                return default_id
            return parse_positive_int(p[key])

        def _str_param(self, p: dict, key: str, default: str = "") -> str:
            return scalar_str(p.get(key), trim=True, default=default)

        def _raw_str_param(self, p: dict, key: str, default: str = "") -> str:
            return scalar_str(p.get(key), trim=False, default=default)

        def _target_date_param(self, p: dict, key: str = "date") -> str:
            cand = self._str_param(p, key)
            return cand if (cand and is_valid_iso_date(cand)) else dt.date.today().isoformat()

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

            def clear_reset_challenge(sess: dict) -> None:
                with state.session_lock:
                    for k in ("reset_email", "reset_code_hash", "reset_expires_at", "reset_attempts", "reset_sent_at"):
                        sess.pop(k, None)

            def purge_expired_reset_challenge(sess: dict) -> None:
                with state.session_lock:
                    exp = int(sess.get("reset_expires_at") or 0)
                    if exp > 0 and int(time.time()) > exp:
                        clear_reset_challenge(sess)

            # 1. Admin Auth
            if route == "admin/auth/login":
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
                if not self._check_login_throttle(session, "admin_login"):
                    return self._send_json({"success": False, "message": "Too many failed sign-in attempts. Please wait before trying again."}, 429, sid)
                u = self._str_param(p, "username")
                pw = self._raw_str_param(p, "password")
                if not u or not pw:
                    return self._send_json({"success": False, "message": "Username and password are required"}, 200, sid)
                exp_user = os.environ.get("ADMIN_USERNAME", "admin")
                exp_hash = os.environ.get("ADMIN_PASSWORD_HASH", "")
                exp_pass = os.environ.get("ADMIN_PASSWORD", "admin")
                user_ok = hmac.compare_digest(exp_user, u)
                within_bytes = len(pw.encode("utf-8")) <= MAX_PASSWORD_BYTES
                pass_ok = within_bytes and (verify_password_bcrypt(pw, exp_hash) if exp_hash else hmac.compare_digest(exp_pass, pw))
                if not user_ok or not pass_ok:
                    if self._record_login_failure(session, "admin_login"):
                        return self._send_json({"success": False, "message": "Too many failed sign-in attempts. Please wait before trying again."}, 429, sid)
                    return self._send_json({"success": False, "message": "Invalid username or password"}, 401, sid)

                self._clear_login_throttle(session, "admin_login")
                tok = secrets.token_hex(32)
                new_sid, _ = self._rotate_session(sid, {"admin_auth": True, "admin_token": tok, "admin_user": u})
                return self._send_json(
                    {"success": True, "message": "Login successful", "token": tok, "data": {"admin_id": 1, "username": u, "role": "admin"}},
                    200,
                    new_sid,
                )

            if route == "admin/auth/logout":
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
                if self._has_admin_session(session) and not self._check_admin_csrf(session):
                    return self._send_json({"success": False, "message": "Forbidden: valid X-Admin-Token header is required"}, 403, sid)
                with state.session_lock:
                    for k in ("admin_auth", "admin_token", "admin_user"):
                        session.pop(k, None)
                    has_customer = int(session.get("user_id") or 0) > 0
                if has_customer:
                    new_sid, _ = self._rotate_session(sid)
                    return self._send_json({"success": True, "message": "Logout successful", "data": None}, 200, new_sid)
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

            # Enforce BaseAdmin (403 cross-origin, 401 without session, 403 without valid X-Admin-Token)
            if route.startswith("admin/"):
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
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
                paged, meta = paginate_and_sort(
                    rows_to_dicts(rows),
                    {
                        "id_asc": lambda r: int(r["movie_code"]),
                        "title_asc": lambda r: str(r.get("movie_name") or "").lower(),
                        "rating_desc": lambda r: -float(r.get("star") or 0),
                        "price_asc": lambda r: float(r.get("money") or 0),
                    },
                    "id_asc",
                    p,
                )
                return self._send_json({"success": True, "message": "OK", "data": paged, "meta": meta}, 200, sid)

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
                paged, meta = paginate_and_sort(
                    rows_to_dicts(rows),
                    {
                        "id_asc": lambda r: int(r["movie_code"]),
                        "title_asc": lambda r: str(r.get("movie_name") or "").lower(),
                        "rating_desc": lambda r: -float(r.get("star") or 0),
                    },
                    "id_asc",
                    p,
                )
                return self._send_json({"success": True, "message": "OK", "data": paged, "meta": meta}, 200, sid)

            if route == "movie/movies/getmoviebycode":
                mid = self._id_param(p, "movie_code", allow_direct=True)
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code parameter is required"}, 200, sid)
                target_date = self._target_date_param(p, "date")
                with state.db_lock:
                    row = db.execute("SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies WHERE movie_code = ?", (mid,)).fetchone()
                    if not row:
                        return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                    mdata = dict(row)
                    trows = db.execute(
                        "SELECT theater_code FROM theater_movie WHERE movie_code = ? "
                        "AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?) ORDER BY theater_code ASC",
                        (mid, target_date, target_date),
                    ).fetchall()
                    mdata["theater_codes"] = [int(r["theater_code"]) for r in trows]
                return self._send_json({"success": True, "message": "OK", "data": mdata}, 200, sid)

            # 3. Public Theaters
            if route == "theater/theater/gettheaterlist":
                kw = self._str_param(p, "address")
                am = self._str_param(p, "amenity")
                mc = self._id_param(p, "movie_code")
                target_date = self._target_date_param(p, "date")
                with state.db_lock:
                    sql = "SELECT theater_code, theater_name, address, amenity, star, img, reviews, distance FROM t_theater WHERE 1=1"
                    args: list = []
                    if mc > 0:
                        t_ids = [
                            int(r["theater_code"])
                            for r in db.execute(
                                "SELECT theater_code FROM theater_movie WHERE movie_code = ? "
                                "AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)",
                                (mc, target_date, target_date),
                            ).fetchall()
                        ]
                        if not t_ids:
                            empty, meta = paginate_and_sort([], {"id_asc": None}, "id_asc", p)
                            return self._send_json({"success": True, "message": "OK", "data": empty, "meta": meta}, 200, sid)
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
                paged, meta = paginate_and_sort(
                    rows_to_dicts(rows),
                    {
                        "id_asc": lambda r: int(r["theater_code"]),
                        "name_asc": lambda r: str(r.get("theater_name") or "").lower(),
                        "rating_desc": lambda r: -float(r.get("star") or 0),
                    },
                    "id_asc",
                    p,
                )
                return self._send_json({"success": True, "message": "OK", "data": paged, "meta": meta}, 200, sid)

            if route == "theater/theater/gettheaterdetails":
                tid = self._id_param(p, "theater_code")
                if tid <= 0:
                    return self._send_json({"success": False, "message": "Valid theater_code parameter is required"}, 200, sid)
                target_date = self._target_date_param(p, "date")
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
                        (tid, target_date, target_date),
                    ).fetchall()
                    tdata["movies"] = rows_to_dicts(mrows)
                return self._send_json({"success": True, "message": "OK", "data": tdata}, 200, sid)

            # 4. Public Offers
            if route == "offer/offer/getofferlist":
                otype = self._str_param(p, "offer_type")
                mc = self._id_param(p, "movie_code")
                sess_uid = int(session.get("user_id") or 0)
                target_date = self._target_date_param(p, "date")
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
                        empty, meta = paginate_and_sort([], {"id_asc": None}, "id_asc", p)
                        return self._send_json({"success": True, "message": "OK", "data": empty, "meta": meta}, 200, sid)
                    oids = [int(o["offer_code"]) for o in offers]
                    ph = ",".join("?" for _ in oids)
                    links = db.execute(
                        f"SELECT offer_code, movie_code FROM movie_offer WHERE offer_code IN ({ph}) "
                        "AND (valid_from IS NULL OR valid_from <= ?) AND (valid_to IS NULL OR valid_to >= ?)",
                        [*oids, target_date, target_date],
                    ).fetchall()
                    mmap: dict[int, list[int]] = {}
                    for lr in links:
                        mmap.setdefault(int(lr["offer_code"]), []).append(int(lr["movie_code"]))
                    filtered = []
                    for o in offers:
                        validity = str(o.get("offer_validity") or "").strip()
                        if is_valid_iso_date(validity) and (validity < today_str or validity < target_date):
                            continue
                        oid = int(o["offer_code"])
                        linked = sorted(mmap.get(oid, []))
                        o["movie_codes"] = linked
                        o["is_exclusive"] = bool(o.get("user_code"))
                        o.pop("user_code", None)
                        if mc > 0 and mc not in linked:
                            continue
                        filtered.append(o)
                paged, meta = paginate_and_sort(
                    filtered,
                    {
                        "id_asc": lambda r: int(r["offer_code"]),
                        "discount_desc": lambda r: -float(r.get("money") or 0),
                        "validity_asc": lambda r: str(r.get("offer_validity") or ""),
                    },
                    "id_asc",
                    p,
                )
                return self._send_json({"success": True, "message": "OK", "data": paged, "meta": meta}, 200, sid)

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
                        "SELECT seat_num, seat_zone, theater_code FROM t_seat WHERE movie_code = ? AND theater_code = ? AND date = ? AND time = ?",
                        (mc, tc, d, t),
                    ).fetchall()
                seat_rows = sorted(rows_to_dicts(rows), key=cmp_to_key(lambda a, b: compare_seat_codes(a.get("seat_num"), b.get("seat_num"))))
                return self._send_json({"success": True, "message": "OK", "data": seat_rows}, 200, sid)

            if route == "movie/seat/saveseats":
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
                mc = self._id_param(p, "movie_code")
                tc = self._optional_id_with_default(p, "theater_code", 1)
                d = self._str_param(p, "date")
                t = self._str_param(p, "time")
                promo_code = self._str_param(p, "promo_code").upper()
                pay_method = self._str_param(p, "payment_method", "card").lower()
                if pay_method not in ALLOWED_PAYMENT_METHODS:
                    pay_method = "card"

                raw_seats = p.get("seat_nums", [])
                if (
                    mc <= 0
                    or tc <= 0
                    or not is_valid_iso_date(d)
                    or not t
                    or len(t) > 30
                    or CONTROL_CHAR_RE.search(t)
                    or not raw_seats
                    or isinstance(raw_seats, (bool, dict))
                ):
                    return self._send_json({"success": False, "message": "Complete screening and seat parameters are required"}, 200, sid)

                if d < today_str:
                    return self._send_json({"success": False, "message": "Selected screening date has already passed"}, 400, sid)

                seat_list = raw_seats if isinstance(raw_seats, list) else str(raw_seats).split(",")
                seats_map: dict[str, str] = {}
                for s in seat_list:
                    if isinstance(s, (bool, list, dict)):
                        return self._send_json({"success": False, "message": "Invalid seat coordinate"}, 200, sid)
                    code = str(s).strip().upper()
                    if not code:
                        continue
                    if not re.match(r"^[A-H](?:[1-9]|1[0-2])$", code):
                        return self._send_json({"success": False, "message": f"Invalid seat coordinate: {code}"}, 200, sid)
                    seats_map[code] = code

                seats = sorted(seats_map.values(), key=cmp_to_key(compare_seat_codes))
                if not seats:
                    return self._send_json({"success": False, "message": "At least one valid seat must be selected"}, 200, sid)
                if len(seats) > MAX_SEATS_PER_ORDER:
                    return self._send_json({"success": False, "message": f"Maximum {MAX_SEATS_PER_ORDER} seats allowed per transaction"}, 200, sid)

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
                        s_start = str(sched["start_date"] or "").strip()
                        s_end = str(sched["end_date"] or "").strip()
                        if (s_start and d < s_start) or (s_end and d > s_end):
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
                        conflicts = sorted(
                            [
                                r["seat_num"]
                                for r in db.execute(
                                    f"SELECT seat_num FROM t_seat WHERE movie_code=? AND theater_code=? AND date=? AND time=? AND seat_num IN ({ph})",
                                    [mc, tc, d, t, *seats],
                                ).fetchall()
                            ],
                            key=cmp_to_key(compare_seat_codes),
                        )
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
                        actual_conflicts = sorted(
                            [
                                r["seat_num"]
                                for r in db.execute(
                                    f"SELECT seat_num FROM t_seat WHERE movie_code=? AND theater_code=? AND date=? AND time=? AND seat_num IN ({ph})",
                                    [mc, tc, d, t, *seats],
                                ).fetchall()
                            ]
                            or seats,
                            key=cmp_to_key(compare_seat_codes),
                        )
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
                        s["is_cancelable"] = is_screening_cancelable(s.get("date") or "", s.get("time") or "")
                return self._send_json({"success": True, "message": "OK", "data": srows}, 200, sid)

            if route == "movie/seat/delete":
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
                sess_uid = int(session.get("user_id") or 0)
                if sess_uid <= 0:
                    return self._send_json({"success": False, "message": "Authentication required to cancel a booking"}, 401, sid)
                seat_id = self._id_param(p, "seat_code", allow_direct=True)
                if seat_id <= 0:
                    return self._send_json({"success": False, "message": "Valid seat_code is required"}, 200, sid)
                with state.db_lock:
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        srow = db.execute("SELECT * FROM t_seat WHERE seat_code = ?", (seat_id,)).fetchone()
                        if not srow:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Ticket record not found"}, 404, sid)
                        owner_uid = int(srow["user_code"]) if srow["user_code"] is not None else 0
                        if owner_uid <= 0 or owner_uid != sess_uid:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Not authorized to cancel this booking"}, 403, sid)
                        if not is_screening_cancelable(srow["date"] or "", srow["time"] or ""):
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Cannot cancel a screening that has already started or passed"}, 400, sid)
                        cur = db.execute("DELETE FROM t_seat WHERE seat_code = ? AND user_code = ?", (seat_id, sess_uid))
                        if cur.rowcount == 0:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Ticket record not found"}, 404, sid)
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Booking cancelled", "data": {"seat_code": seat_id}}, 200, sid)

            # 6. Customer Auth & Password Security
            if route == "user/user/reg":
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
                name = self._str_param(p, "name")
                email = self._str_param(p, "email").lower()
                pw = self._raw_str_param(p, "password")
                pw_bytes = len(pw.encode("utf-8"))
                if name == "" or len(name) > 50:
                    return self._send_json({"success": False, "message": "Please enter a valid name (1-50 characters)"}, 200, sid)
                if email == "" or not EMAIL_RE.match(email) or len(email) > 100:
                    return self._send_json({"success": False, "message": "Please enter a valid email address"}, 200, sid)
                if pw_bytes < 6 or pw_bytes > MAX_PASSWORD_BYTES:
                    return self._send_json({"success": False, "message": "Password must be 6-72 characters"}, 200, sid)
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
                clear_reset_challenge(session)
                self._clear_login_throttle(session, "user_login")
                new_sid, _ = self._rotate_session(sid, {"user_id": uid, "user_email": email})
                return self._send_json(
                    {"success": True, "message": "Registration successful", "data": {"user_id": uid, "user_name": name, "email": email}},
                    200,
                    new_sid,
                )

            if route == "user/user/login":
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
                if not self._check_login_throttle(session, "user_login"):
                    return self._send_json({"success": False, "message": "Too many failed sign-in attempts. Please wait before trying again."}, 429, sid)
                email = self._str_param(p, "email").lower()
                pw = self._raw_str_param(p, "password")
                if not email or not pw:
                    return self._send_json({"success": False, "message": "Email and password are required"}, 200, sid)
                with state.db_lock:
                    urow = db.execute("SELECT * FROM t_user WHERE email = ?", (email,)).fetchone()
                    if not urow or not verify_password_bcrypt(pw, urow["login_pwd"]):
                        if self._record_login_failure(session, "user_login"):
                            return self._send_json({"success": False, "message": "Too many failed sign-in attempts. Please wait before trying again."}, 429, sid)
                        return self._send_json({"success": False, "message": "Invalid email or password"}, 200, sid)
                    if not str(urow["login_pwd"]).startswith(("$2y$", "$2b$", "$2a$")):
                        db.execute("UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?", (hash_password_bcrypt(pw), now_str, urow["user_code"]))
                    uid = int(urow["user_code"])
                    uname = urow["user_name"]
                    uemail = urow["email"]
                clear_reset_challenge(session)
                self._clear_login_throttle(session, "user_login")
                new_sid, _ = self._rotate_session(sid, {"user_id": uid, "user_email": uemail})
                return self._send_json(
                    {"success": True, "message": "Login successful", "data": {"user_id": uid, "user_name": uname, "email": uemail}},
                    200,
                    new_sid,
                )

            if route == "user/user/logout":
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
                with state.session_lock:
                    session.pop("user_id", None)
                    session.pop("user_email", None)
                clear_reset_challenge(session)
                if self._has_admin_session(session):
                    new_sid, _ = self._rotate_session(sid)
                    return self._send_json({"success": True, "message": "Logout successful", "data": None}, 200, new_sid)
                self._destroy_session(sid)
                return self._send_json({"success": True, "message": "Logout successful", "data": None}, 200, clear_cookie=True)

            if route == "user/user/session":
                purge_expired_reset_challenge(session)
                sess_uid = int(session.get("user_id") or 0)
                if sess_uid <= 0:
                    return self._send_json({"success": True, "message": "OK", "data": {"authenticated": False, "user_id": 0, "user_name": "Guest", "email": ""}}, 200, sid)
                with state.db_lock:
                    urow = db.execute("SELECT user_code, user_name, email FROM t_user WHERE user_code = ?", (sess_uid,)).fetchone()
                if not urow:
                    with state.session_lock:
                        session.pop("user_id", None)
                        session.pop("user_email", None)
                    return self._send_json({"success": True, "message": "OK", "data": {"authenticated": False, "user_id": 0, "user_name": "Guest", "email": ""}}, 200, sid)
                return self._send_json(
                    {"success": True, "message": "OK", "data": {"authenticated": True, "user_id": int(urow["user_code"]), "user_name": urow["user_name"], "email": urow["email"]}},
                    200,
                    sid,
                )

            if route == "user/user/sendresetcode":
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
                purge_expired_reset_challenge(session)
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
                with state.session_lock:
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
                if not self._verify_same_origin():
                    return self._send_json({"success": False, "message": "Forbidden: cross-origin request rejected"}, 403, sid)
                sess_uid = int(session.get("user_id") or 0)
                old_pw = self._raw_str_param(p, "old_password")
                new_pw = self._raw_str_param(p, "pwd")
                vcode = self._str_param(p, "verification_code")
                new_pw_bytes = len(new_pw.encode("utf-8"))

                if new_pw_bytes < 6 or new_pw_bytes > MAX_PASSWORD_BYTES:
                    return self._send_json({"success": False, "message": "New password must be 6-72 characters"}, 200, sid)

                # Path A: Signed-in user changing password with old_password
                if old_pw and not vcode:
                    if sess_uid <= 0:
                        return self._send_json({"success": False, "message": "Please sign in to change your password using current password"}, 401, sid)
                    with state.db_lock:
                        urow = db.execute("SELECT * FROM t_user WHERE user_code = ?", (sess_uid,)).fetchone()
                        if not urow:
                            with state.session_lock:
                                session.pop("user_id", None)
                                session.pop("user_email", None)
                            return self._send_json({"success": False, "message": "Account session is no longer valid"}, 401, sid)
                        if not verify_password_bcrypt(old_pw, urow["login_pwd"]):
                            return self._send_json({"success": False, "message": "Current password is incorrect"}, 401, sid)
                        if hmac.compare_digest(old_pw, new_pw):
                            return self._send_json({"success": False, "message": "New password must be different from your current password"}, 200, sid)
                        db.execute("UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?", (hash_password_bcrypt(new_pw), now_str, sess_uid))
                        uemail = urow["email"]
                    clear_reset_challenge(session)
                    self._clear_login_throttle(session, "user_login")
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

                if not r_email or not r_hash or r_exp <= 0:
                    return self._send_json({"success": False, "message": "Please request a verification code first"}, 200, sid)
                if int(time.time()) > r_exp:
                    clear_reset_challenge(session)
                    return self._send_json({"success": False, "message": "Verification code has expired. Please request a new code."}, 200, sid)
                if r_att >= MAX_RESET_ATTEMPTS:
                    clear_reset_challenge(session)
                    return self._send_json({"success": False, "message": "Too many failed verification attempts. Please request a new code."}, 429, sid)

                if not hmac.compare_digest(r_email, email) or not verify_password_bcrypt(vcode, r_hash):
                    r_att += 1
                    if r_att >= MAX_RESET_ATTEMPTS:
                        clear_reset_challenge(session)
                        return self._send_json({"success": False, "message": "Too many failed verification attempts. Please request a new code."}, 429, sid)
                    with state.session_lock:
                        session["reset_attempts"] = r_att
                    return self._send_json({"success": False, "message": "Verification code is incorrect"}, 200, sid)

                with state.db_lock:
                    urow = db.execute("SELECT user_code, email FROM t_user WHERE email = ?", (email,)).fetchone()
                    if not urow:
                        clear_reset_challenge(session)
                        return self._send_json({"success": False, "message": "Account not found for this email"}, 200, sid)
                    db.execute("UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?", (hash_password_bcrypt(new_pw), now_str, urow["user_code"]))

                with state.session_lock:
                    session.pop("user_id", None)
                    session.pop("user_email", None)
                clear_reset_challenge(session)
                self._clear_login_throttle(session, "user_login")
                new_sid, _ = self._rotate_session(sid)
                return self._send_json({"success": True, "message": "Password changed successfully", "data": None}, 200, new_sid)

            # 7. Admin Cascading CRUD
            if route == "admin/movie/index":
                with state.db_lock:
                    movies = rows_to_dicts(db.execute("SELECT * FROM t_movies ORDER BY movie_code ASC").fetchall())
                    tmap = map_relation_ids(db, "theater_movie", "movie_code", "theater_code")
                    omap = map_relation_ids(db, "movie_offer", "movie_code", "offer_code")
                    for m in movies:
                        mid = int(m["movie_code"])
                        tcodes = tmap.get(mid, [])
                        ocodes = omap.get(mid, [])
                        m["theater_codes"] = tcodes
                        m["theater_count"] = len(tcodes)
                        m["offer_codes"] = ocodes
                        m["offer_count"] = len(ocodes)
                kw = self._str_param(p, "keyword").lower()
                genre = self._str_param(p, "filter", "all").lower()
                paged, meta = paginate_and_sort(
                    movies,
                    {
                        "id_asc": lambda r: int(r["movie_code"]),
                        "id_desc": lambda r: -int(r["movie_code"]),
                        "title_asc": lambda r: str(r.get("movie_name") or "").lower(),
                        "rating_desc": lambda r: -float(r.get("star") or 0),
                        "price_desc": lambda r: -float(r.get("money") or 0),
                    },
                    "id_asc",
                    p,
                    lambda m: (
                        (not genre or genre == "all" or genre in str(m.get("movie_type") or "").lower())
                        and (
                            not kw
                            or kw in f"#{m['movie_code']} {m.get('movie_name') or ''} {m.get('movie_type') or ''} {m.get('tag') or ''}".lower()
                        )
                    ),
                )
                return self._send_json({"success": True, "message": "OK", "data": paged, "meta": meta}, 200, sid)

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
                        sync_schedule_rows(db, "movie_code", mid, valid_t, "theater_code", now_str)
                        sync_movie_offer_rows(db, "movie_code", mid, valid_o, "offer_code", now_str)
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json(
                    {"success": True, "message": "Movie created successfully", "data": {"movie_code": mid, "theater_codes": valid_t, "offer_codes": valid_o}},
                    200,
                    sid,
                )

            if route == "admin/movie/update":
                mid = self._id_param(p, "movie_code", allow_direct=True)
                if mid <= 0:
                    return self._send_json({"success": False, "message": "Valid movie_code is required"}, 200, sid)
                with state.db_lock:
                    existing_row = db.execute("SELECT * FROM t_movies WHERE movie_code = ?", (mid,)).fetchone()
                    if not existing_row:
                        return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                    merged = merge_existing_payload(dict(existing_row), p, MOVIE_ALLOWED_FIELDS)
                    data, err = prepare_movie_data(merged)
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
                            sync_schedule_rows(db, "movie_code", mid, valid_t, "theater_code", now_str)
                        if valid_o is not None:
                            sync_movie_offer_rows(db, "movie_code", mid, valid_o, "offer_code", now_str)
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Movie updated successfully", "data": {"movie_code": mid}}, 200, sid)

            if route == "admin/movie/delete":
                target_ids = resolve_target_ids(p, "movie_code", "movie_codes", allow_direct=True)
                if not target_ids:
                    return self._send_json({"success": False, "message": "Valid movie_code is required"}, 200, sid)
                with state.db_lock:
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        ph = ",".join("?" for _ in target_ids)
                        existing_ids = [
                            int(r["movie_code"])
                            for r in db.execute(f"SELECT movie_code FROM t_movies WHERE movie_code IN ({ph}) ORDER BY movie_code ASC", target_ids).fetchall()
                        ]
                        if not existing_ids:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                        eph = ",".join("?" for _ in existing_ids)
                        db.execute(f"DELETE FROM theater_movie WHERE movie_code IN ({eph})", existing_ids)
                        db.execute(f"DELETE FROM movie_offer WHERE movie_code IN ({eph})", existing_ids)
                        db.execute(f"DELETE FROM t_seat WHERE movie_code IN ({eph})", existing_ids)
                        db.execute(f"DELETE FROM t_movies WHERE movie_code IN ({eph})", existing_ids)
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json(
                    {
                        "success": True,
                        "message": "Movie deleted successfully",
                        "data": {"movie_code": existing_ids[0], "deleted_ids": existing_ids, "deleted_count": len(existing_ids)},
                    },
                    200,
                    sid,
                )

            # Admin Theaters CRUD
            if route == "admin/theater/index":
                with state.db_lock:
                    theaters = rows_to_dicts(db.execute("SELECT * FROM t_theater ORDER BY theater_code ASC").fetchall())
                    mmap = map_relation_ids(db, "theater_movie", "theater_code", "movie_code")
                    for t in theaters:
                        mcodes = mmap.get(int(t["theater_code"]), [])
                        t["movie_codes"] = mcodes
                        t["movie_count"] = len(mcodes)
                kw = self._str_param(p, "keyword").lower()
                fmt = self._str_param(p, "filter", "all").lower()
                paged, meta = paginate_and_sort(
                    theaters,
                    {
                        "id_asc": lambda r: int(r["theater_code"]),
                        "id_desc": lambda r: -int(r["theater_code"]),
                        "name_asc": lambda r: str(r.get("theater_name") or "").lower(),
                        "rating_desc": lambda r: -float(r.get("star") or 0),
                    },
                    "id_asc",
                    p,
                    lambda t: (
                        (not fmt or fmt == "all" or fmt in str(t.get("amenity") or "").lower())
                        and (
                            not kw
                            or kw
                            in f"#{t['theater_code']} {t.get('theater_name') or ''} {t.get('theater_id') or ''} {t.get('address') or ''} {t.get('amenity') or ''}".lower()
                        )
                    ),
                )
                return self._send_json({"success": True, "message": "OK", "data": paged, "meta": meta}, 200, sid)

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
                        if data["theater_id"] is None or data["theater_id"] == "":
                            db.execute("UPDATE t_theater SET theater_id = ? WHERE theater_code = ?", (f"TH-{new_tid:03d}", new_tid))
                        sync_schedule_rows(db, "theater_code", new_tid, valid_m, "movie_code", now_str)
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
                    existing_row = db.execute("SELECT * FROM t_theater WHERE theater_code = ?", (tid,)).fetchone()
                    if not existing_row:
                        return self._send_json({"success": False, "message": "Theater not found"}, 404, sid)
                    merged = merge_existing_payload(dict(existing_row), p, THEATER_ALLOWED_FIELDS)
                    data, err = prepare_theater_data(merged)
                    if err is not None or data is None:
                        return self._send_json({"success": False, "message": err or "Invalid theater fields"}, 200, sid)
                    if data["theater_id"] is None or data["theater_id"] == "":
                        data["theater_id"] = f"TH-{tid:03d}"
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
                            sync_schedule_rows(db, "theater_code", tid, valid_m, "movie_code", now_str)
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json({"success": True, "message": "Theater updated successfully", "data": {"theater_code": tid}}, 200, sid)

            if route == "admin/theater/delete":
                target_ids = resolve_target_ids(p, "theater_code", "theater_codes", allow_direct=True)
                if not target_ids:
                    return self._send_json({"success": False, "message": "Valid theater_code is required"}, 200, sid)
                with state.db_lock:
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        ph = ",".join("?" for _ in target_ids)
                        existing_ids = [
                            int(r["theater_code"])
                            for r in db.execute(f"SELECT theater_code FROM t_theater WHERE theater_code IN ({ph}) ORDER BY theater_code ASC", target_ids).fetchall()
                        ]
                        if not existing_ids:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Theater not found"}, 404, sid)
                        eph = ",".join("?" for _ in existing_ids)
                        db.execute(f"DELETE FROM theater_movie WHERE theater_code IN ({eph})", existing_ids)
                        db.execute(f"DELETE FROM t_seat WHERE theater_code IN ({eph})", existing_ids)
                        db.execute(f"DELETE FROM t_theater WHERE theater_code IN ({eph})", existing_ids)
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json(
                    {
                        "success": True,
                        "message": "Theater deleted successfully",
                        "data": {"theater_code": existing_ids[0], "deleted_ids": existing_ids, "deleted_count": len(existing_ids)},
                    },
                    200,
                    sid,
                )

            # Admin Offers CRUD
            if route == "admin/offer/index":
                with state.db_lock:
                    offers = rows_to_dicts(db.execute("SELECT * FROM t_offer ORDER BY offer_code ASC").fetchall())
                    mmap = map_relation_ids(db, "movie_offer", "offer_code", "movie_code")
                    users = {
                        int(r["user_code"]): dict(r)
                        for r in db.execute("SELECT user_code, user_name, email FROM t_user").fetchall()
                    }
                    for o in offers:
                        mcodes = mmap.get(int(o["offer_code"]), [])
                        o["movie_codes"] = mcodes
                        o["movie_count"] = len(mcodes)
                        ucode = int(o["user_code"]) if o.get("user_code") is not None else 0
                        o["owner"] = users.get(ucode) if ucode > 0 else None
                kw = self._str_param(p, "keyword").lower()
                flt = self._str_param(p, "filter", "all").lower()

                def filter_offer(o: dict) -> bool:
                    is_exp = bool(o.get("offer_validity")) and str(o["offer_validity"]) < today_str
                    if flt == "public" and o.get("user_code"):
                        return False
                    if flt == "member" and not o.get("user_code"):
                        return False
                    if flt == "active" and is_exp:
                        return False
                    if flt == "expired" and not is_exp:
                        return False
                    if kw:
                        owner_txt = (o.get("owner") or {}).get("user_name") or "public"
                        hay = f"#{o['offer_code']} {o.get('offer_title') or ''} {o.get('promo_code') or ''} {o.get('offer_type') or ''} {owner_txt}".lower()
                        if kw not in hay:
                            return False
                    return True

                paged, meta = paginate_and_sort(
                    offers,
                    {
                        "id_asc": lambda r: int(r["offer_code"]),
                        "id_desc": lambda r: -int(r["offer_code"]),
                        "discount_desc": lambda r: -float(r.get("money") or 0),
                        "validity_asc": lambda r: str(r.get("offer_validity") or ""),
                    },
                    "id_asc",
                    p,
                    filter_offer,
                )
                return self._send_json({"success": True, "message": "OK", "data": paged, "meta": meta}, 200, sid)

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
                        sync_movie_offer_rows(db, "offer_code", oid, valid_m, "movie_code", now_str, data["offer_validity"])
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
                    existing_row = db.execute("SELECT * FROM t_offer WHERE offer_code = ?", (oid,)).fetchone()
                    if not existing_row:
                        return self._send_json({"success": False, "message": "Offer not found"}, 404, sid)
                    merged = merge_existing_payload(dict(existing_row), p, OFFER_ALLOWED_FIELDS)
                    data, err = prepare_offer_data(db, merged, oid)
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
                            sync_movie_offer_rows(db, "offer_code", oid, valid_m, "movie_code", now_str, data["offer_validity"])
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
                target_ids = resolve_target_ids(p, "offer_code", "offer_codes", allow_direct=True)
                if not target_ids:
                    return self._send_json({"success": False, "message": "Valid offer_code is required"}, 200, sid)
                with state.db_lock:
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        ph = ",".join("?" for _ in target_ids)
                        existing_ids = [
                            int(r["offer_code"])
                            for r in db.execute(f"SELECT offer_code FROM t_offer WHERE offer_code IN ({ph}) ORDER BY offer_code ASC", target_ids).fetchall()
                        ]
                        if not existing_ids:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Offer not found"}, 404, sid)
                        eph = ",".join("?" for _ in existing_ids)
                        db.execute(f"DELETE FROM movie_offer WHERE offer_code IN ({eph})", existing_ids)
                        db.execute(f"DELETE FROM t_offer WHERE offer_code IN ({eph})", existing_ids)
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json(
                    {
                        "success": True,
                        "message": "Offer deleted successfully",
                        "data": {"offer_code": existing_ids[0], "deleted_ids": existing_ids, "deleted_count": len(existing_ids)},
                    },
                    200,
                    sid,
                )

            # Admin Seats
            def load_enriched_seats() -> list[dict]:
                srows = rows_to_dicts(db.execute("SELECT * FROM t_seat ORDER BY seat_code DESC").fetchall())
                for s in srows:
                    mrow = db.execute("SELECT * FROM t_movies WHERE movie_code = ?", (s["movie_code"],)).fetchone()
                    urow = db.execute("SELECT user_code, user_name, email FROM t_user WHERE user_code = ?", (s["user_code"],)).fetchone() if s["user_code"] else None
                    trow = db.execute("SELECT theater_code, theater_name, address FROM t_theater WHERE theater_code = ?", (s["theater_code"] or 1,)).fetchone()
                    s["movie"] = dict(mrow) if mrow else None
                    s["user"] = dict(urow) if urow else None
                    s["theater"] = dict(trow) if trow else None
                return srows

            if route == "admin/seat/index":
                with state.db_lock:
                    srows = load_enriched_seats()
                kw = self._str_param(p, "keyword").lower()
                flt = self._str_param(p, "filter", "all").lower()

                def filter_seat(s: dict) -> bool:
                    is_vip = int(s.get("seat_zone") or 1) == 2
                    has_member = bool((s.get("user") or {}).get("user_name"))
                    if flt == "vip" and not is_vip:
                        return False
                    if flt == "std" and is_vip:
                        return False
                    if flt == "member" and not has_member:
                        return False
                    if flt == "guest" and has_member:
                        return False
                    if kw:
                        m = (s.get("movie") or {}).get("movie_name") or f"Movie #{s['movie_code']}"
                        t = (s.get("theater") or {}).get("theater_name") or f"Theater #{s.get('theater_code') or 1}"
                        u = f"{s['user']['user_name']} {s['user'].get('email') or ''}" if has_member else "guest"
                        hay = f"#{s['seat_code']} {m} {t} {u} {s.get('date') or ''} {s.get('time') or ''} {s.get('seat_num') or ''}".lower()
                        if kw not in hay:
                            return False
                    return True

                paged, meta = paginate_and_sort(
                    srows,
                    {
                        "id_desc": lambda r: -int(r["seat_code"]),
                        "id_asc": lambda r: int(r["seat_code"]),
                        "date_asc": cmp_to_key(compare_screening_rows),
                        "seat_asc": cmp_to_key(lambda a, b: compare_seat_codes(a.get("seat_num"), b.get("seat_num"))),
                    },
                    "id_desc",
                    p,
                    filter_seat,
                )
                return self._send_json({"success": True, "message": "OK", "data": paged, "meta": meta}, 200, sid)

            if route == "admin/seat/exportcsv":
                with state.db_lock:
                    srows = load_enriched_seats()
                headers = ["Booking ID", "Movie", "Theater", "Date", "Time", "Seat", "Zone", "Customer", "Email", "Created At"]
                csv_rows = [
                    [
                        s["seat_code"],
                        (s["movie"] or {}).get("movie_name") or f"Movie #{s['movie_code']}",
                        (s["theater"] or {}).get("theater_name") or f"Theater #{s.get('theater_code') or 1}",
                        s.get("date") or "",
                        s.get("time") or "",
                        s.get("seat_num") or "",
                        "Prime VIP" if int(s.get("seat_zone") or 1) == 2 else "Standard",
                        (s["user"] or {}).get("user_name") or "Guest Checkout",
                        (s["user"] or {}).get("email") or "",
                        s.get("create_time") or "",
                    ]
                    for s in srows
                ]
                return self._send_csv("cinetix-seat-bookings.csv", headers, csv_rows, sid)

            if route == "admin/seat/delete":
                target_ids = resolve_target_ids(p, "seat_code", "seat_codes", allow_direct=True)
                if not target_ids:
                    return self._send_json({"success": False, "message": "Valid seat_code is required"}, 200, sid)
                with state.db_lock:
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        ph = ",".join("?" for _ in target_ids)
                        existing_ids = [
                            int(r["seat_code"])
                            for r in db.execute(f"SELECT seat_code FROM t_seat WHERE seat_code IN ({ph}) ORDER BY seat_code ASC", target_ids).fetchall()
                        ]
                        if not existing_ids:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "Seat booking not found"}, 404, sid)
                        eph = ",".join("?" for _ in existing_ids)
                        db.execute(f"DELETE FROM t_seat WHERE seat_code IN ({eph})", existing_ids)
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json(
                    {
                        "success": True,
                        "message": "Seat booking deleted",
                        "data": {"seat_code": existing_ids[0], "deleted_ids": existing_ids, "deleted_count": len(existing_ids)},
                    },
                    200,
                    sid,
                )

            # Admin Users
            if route == "admin/user/index":
                with state.db_lock:
                    rows = rows_to_dicts(
                        db.execute("SELECT user_code, user_name, email, create_time, update_time FROM t_user ORDER BY user_code ASC").fetchall()
                    )
                kw = self._str_param(p, "keyword").lower()
                paged, meta = paginate_and_sort(
                    rows,
                    {
                        "id_asc": lambda r: int(r["user_code"]),
                        "id_desc": lambda r: -int(r["user_code"]),
                        "name_asc": lambda r: str(r.get("user_name") or "").lower(),
                    },
                    "id_asc",
                    p,
                    lambda u: not kw or kw in f"#{u['user_code']} {u.get('user_name') or ''} {u.get('email') or ''}".lower(),
                )
                return self._send_json({"success": True, "message": "OK", "data": paged, "meta": meta}, 200, sid)

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
                upw = self._raw_str_param(p, "login_pwd")
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
                with state.db_lock:
                    existing_row = db.execute("SELECT * FROM t_user WHERE user_code = ?", (uid,)).fetchone()
                    if not existing_row:
                        return self._send_json({"success": False, "message": "User not found"}, 404, sid)
                    uname = self._str_param(p, "user_name") if "user_name" in p else str(existing_row["user_name"])
                    uemail = self._str_param(p, "email").lower() if "email" in p else str(existing_row["email"]).lower()
                    upw = self._raw_str_param(p, "login_pwd")
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
                target_ids = resolve_target_ids(p, "user_code", "user_codes", allow_direct=True)
                if not target_ids:
                    return self._send_json({"success": False, "message": "Valid user_code is required"}, 200, sid)
                with state.db_lock:
                    db.execute("BEGIN IMMEDIATE")
                    try:
                        ph = ",".join("?" for _ in target_ids)
                        existing_ids = [
                            int(r["user_code"])
                            for r in db.execute(f"SELECT user_code FROM t_user WHERE user_code IN ({ph}) ORDER BY user_code ASC", target_ids).fetchall()
                        ]
                        if not existing_ids:
                            db.execute("ROLLBACK")
                            return self._send_json({"success": False, "message": "User not found"}, 404, sid)
                        eph = ",".join("?" for _ in existing_ids)
                        db.execute(f"UPDATE t_seat SET user_code = NULL WHERE user_code IN ({eph})", existing_ids)
                        db.execute(f"UPDATE t_offer SET user_code = NULL WHERE user_code IN ({eph})", existing_ids)
                        db.execute(f"DELETE FROM t_user WHERE user_code IN ({eph})", existing_ids)
                        db.execute("COMMIT")
                    except Exception:
                        db.execute("ROLLBACK")
                        raise
                return self._send_json(
                    {
                        "success": True,
                        "message": "User deleted successfully",
                        "data": {"user_code": existing_ids[0], "deleted_ids": existing_ids, "deleted_count": len(existing_ids)},
                    },
                    200,
                    sid,
                )

            self._send_json({"success": False, "message": f"Unknown route {route}"}, 404, sid)

    return Handler


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def start_background_server(port_range: tuple[int, int] = (4300, 4399)) -> tuple[ThreadingHTTPServer, str]:
    env_range = os.environ.get("CINETIX_PORT_RANGE", "").strip()
    if env_range and "-" in env_range:
        lo_str, hi_str = env_range.split("-", 1)
        if lo_str.strip().isdigit() and hi_str.strip().isdigit():
            lo, hi = int(lo_str.strip()), int(hi_str.strip())
            if 1024 <= lo <= hi <= 65535:
                port_range = (lo, hi)

    state = ContractState()
    handler_cls = make_handler(state)
    server: ThreadingHTTPServer | None = None
    for candidate_port in range(port_range[0], port_range[1] + 1):
        try:
            server = ReusableThreadingHTTPServer(("127.0.0.1", candidate_port), handler_cls)
            break
        except OSError:
            continue
    if server is None:
        raise RuntimeError(f"No free port available in isolated range {port_range[0]}-{port_range[1]}")
    server.state = state  # type: ignore[attr-defined]
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://127.0.0.1:{port}"
