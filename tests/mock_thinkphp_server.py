#!/usr/bin/env python3
"""
Local SQLite-Backed Contract Server for End-to-End Browser Verification.
Loads movies.sql directly into SQLite (with PRAGMA foreign_keys = ON), serves `public/`,
and implements the exact `/index.php/<module>/<controller>/<action>` contracts of the
ThinkPHP 5.1 backend (including $2y$10$ bcrypt hashing, session + X-Admin-Token auth,
transactional seat locking, and relational joins) for environments without php-cli/mysqld.
"""

from __future__ import annotations

import crypt
import datetime as dt
import hmac
import json
import mimetypes
import re
import secrets
import sqlite3
import threading
import urllib.parse
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from static_audit import ROOT, translate_mysql_to_sqlite

PUBLIC_DIR = ROOT / "public"


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

        def _send_json(self, body: dict, status: int = 200, sid: str | None = None) -> None:
            raw = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            if sid:
                self.send_header("Set-Cookie", f"PHPSESSID={sid}; Path=/; HttpOnly")
            self.end_headers()
            self.wfile.write(raw)

        def _parse_payload(self, query_str: str) -> dict:
            params = {k: v[-1] for k, v in urllib.parse.parse_qs(query_str, keep_blank_values=True).items()}
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

        def _require_admin(self, session: dict, payload: dict) -> bool:
            if session.get("admin_auth") is not True or not session.get("admin_token"):
                return False
            client_tok = (
                self.headers.get("X-Admin-Token")
                or (
                    self.headers.get("Authorization", "")[7:]
                    if self.headers.get("Authorization", "").lower().startswith("bearer ")
                    else ""
                )
                or str(payload.get("token", ""))
            ).strip()
            if client_tok:
                return hmac.compare_digest(session["admin_token"], client_tok)
            return True

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

        def _handle_api(self, path: str, p: dict, sid: str, session: dict) -> None:
            parts = [seg for seg in path[len("/index.php"):].split("/") if seg]
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
                u = str(p.get("username", "")).strip()
                pw = str(p.get("password", ""))
                if not u or not pw:
                    return self._send_json({"success": False, "message": "Username and password are required"}, 200, sid)
                if u == "admin" and pw == "admin":
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

            # Enforce BaseAdmin on all other admin/* routes
            if route.startswith("admin/"):
                if not self._require_admin(session, p):
                    return self._send_json({"success": False, "message": "Unauthorized: admin login required"}, 401, sid)

            # Public Movies
            if route == "movie/movies/getmovielist":
                genre = str(p.get("genre", "all")).strip()
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
                kw = str(p.get("keyword", "")).strip()
                if not kw:
                    rows = db.execute("SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies ORDER BY movie_code ASC").fetchall()
                else:
                    like = f"%{kw}%"
                    rows = db.execute(
                        "SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies "
                        "WHERE movie_name LIKE ? OR movie_type LIKE ? OR COALESCE(tag,'') LIKE ? ORDER BY movie_code ASC",
                        (like, like, like),
                    ).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "movie/movies/getmoviebycode":
                mid = int(p.get("movie_code") or 0)
                row = db.execute("SELECT movie_code, movie_name, star, tag, money, movie_type, img, times FROM t_movies WHERE movie_code = ?", (mid,)).fetchone()
                if not row:
                    return self._send_json({"success": False, "message": "Movie not found"}, 404, sid)
                return self._send_json({"success": True, "message": "OK", "data": dict(row)}, 200, sid)

            # Public Theaters
            if route == "theater/theater/gettheaterlist":
                kw = str(p.get("address", "")).strip()
                am = str(p.get("amenity", "")).strip()
                sql = "SELECT theater_code, theater_name, address, amenity, star, img, reviews, distance FROM t_theater WHERE 1=1"
                args = []
                if kw:
                    sql += " AND (theater_name LIKE ? OR address LIKE ?)"
                    args.extend([f"%{kw}%", f"%{kw}%"])
                if am and am.lower() != "all":
                    sql += " AND amenity LIKE ?"
                    args.append(f"%{am}%")
                sql += " ORDER BY theater_code ASC"
                rows = db.execute(sql, args).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "theater/theater/gettheaterdetails":
                tid = int(p.get("theater_code") or 0)
                trow = db.execute("SELECT * FROM t_theater WHERE theater_code = ?", (tid,)).fetchone()
                if not trow:
                    return self._send_json({"success": False, "message": "Theater does not exist"}, 404, sid)
                tdata = dict(trow)
                mrows = db.execute(
                    "SELECT m.movie_code, m.movie_name, m.star, m.tag, m.money, m.movie_type, m.img, m.times, tm.daily_showtimes "
                    "FROM theater_movie tm JOIN t_movies m ON tm.movie_code = m.movie_code "
                    "WHERE tm.theater_code = ? AND (tm.end_date IS NULL OR tm.end_date >= ?) ORDER BY m.movie_code ASC",
                    (tid, today_str),
                ).fetchall()
                tdata["movies"] = rows_to_dicts(mrows)
                return self._send_json({"success": True, "message": "OK", "data": tdata}, 200, sid)

            # Public Offers
            if route == "offer/offer/getofferlist":
                otype = str(p.get("offer_type", "")).strip()
                if otype and otype.lower() != "all":
                    rows = db.execute(
                        "SELECT offer_code, offer_title, offer_description, promo_code, offer_validity, img, badge, money, offer_type FROM t_offer WHERE offer_type = ? ORDER BY offer_code ASC",
                        (otype,),
                    ).fetchall()
                else:
                    rows = db.execute(
                        "SELECT offer_code, offer_title, offer_description, promo_code, offer_validity, img, badge, money, offer_type FROM t_offer ORDER BY offer_code ASC"
                    ).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "offer/offer/getmoneybybadge":
                code = str(p.get("badge") or p.get("promo_code") or "").strip().upper()
                if not code:
                    return self._send_json({"success": False, "message": "Promo code is required"}, 200, sid)
                orow = db.execute(
                    "SELECT offer_code, offer_title, promo_code, offer_validity, badge, money FROM t_offer WHERE promo_code = ?",
                    (code,),
                ).fetchone()
                if not orow:
                    return self._send_json({"success": False, "message": "Invalid promo code"}, 200, sid)
                odata = dict(orow)
                if re.match(r"^\d{4}-\d{2}-\d{2}$", odata["offer_validity"] or "") and odata["offer_validity"] < today_str:
                    return self._send_json({"success": False, "message": "This promo code has expired"}, 200, sid)
                return self._send_json({"success": True, "message": "Promo code applied", "data": odata}, 200, sid)

            # Public Seats
            if route == "movie/seat/getseatlist":
                mc = int(p.get("movie_code") or 0)
                tc = int(p.get("theater_code") or 1)
                d = str(p.get("date", "")).strip()
                t = str(p.get("time", "")).strip()
                rows = db.execute(
                    "SELECT seat_num, seat_zone, theater_code FROM t_seat WHERE movie_code = ? AND theater_code = ? AND date = ? AND time = ? ORDER BY seat_num ASC",
                    (mc, tc, d, t),
                ).fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "movie/seat/saveseats":
                mc = int(p.get("movie_code") or 0)
                tc = int(p.get("theater_code") or 1)
                d = str(p.get("date", "")).strip()
                t = str(p.get("time", "")).strip()
                raw_seats = p.get("seat_nums", [])
                seat_list = raw_seats if isinstance(raw_seats, list) else str(raw_seats).split(",")
                seats = []
                for s in seat_list:
                    code = str(s).strip().upper()
                    if not code:
                        continue
                    if not re.match(r"^[A-H](?:[1-9]|1[0-2])$", code):
                        return self._send_json({"success": False, "message": f"Invalid seat coordinate: {code}"}, 200, sid)
                    if code not in seats:
                        seats.append(code)
                if mc <= 0 or not d or not t or not seats:
                    return self._send_json({"success": False, "message": "Complete screening and seat parameters are required"}, 200, sid)

                sess_uid = int(session.get("user_id") or 0)
                req_uid = int(p.get("user_code") or 0) if p.get("user_code") not in (None, "") else 0
                cand_uid = sess_uid if sess_uid > 0 else req_uid
                user_code = None
                if cand_uid > 0:
                    urow = db.execute("SELECT user_code FROM t_user WHERE user_code = ?", (cand_uid,)).fetchone()
                    if urow:
                        user_code = int(urow["user_code"])

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

                for code in seats:
                    zone = 2 if code[0] in ("D", "E") else 1
                    db.execute(
                        "INSERT INTO t_seat (movie_code, theater_code, user_code, date, time, seat_num, seat_zone, create_time) VALUES (?,?,?,?,?,?,?,?)",
                        (mc, tc, user_code, d, t, code, zone, now_str),
                    )
                db.commit()
                return self._send_json(
                    {"success": True, "message": "Booking confirmed", "data": {"booked_count": len(seats), "seats": seats, "theater_code": tc, "date": d, "time": t}},
                    200,
                    sid,
                )

            if route == "movie/seat/getseatlistbyusercode":
                uid = int(p.get("user_code") or session.get("user_id") or 0)
                if uid <= 0:
                    return self._send_json({"success": False, "message": "Valid user_code parameter is required"}, 200, sid)
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
                seat_id = int(p.get("seat_code") or 0)
                srow = db.execute("SELECT * FROM t_seat WHERE seat_code = ?", (seat_id,)).fetchone()
                if not srow:
                    return self._send_json({"success": False, "message": "Ticket record not found"}, 404, sid)
                is_admin = session.get("admin_auth") is True
                caller_uid = int(session.get("user_id") or p.get("user_code") or 0)
                owner_uid = int(srow["user_code"] or 0)
                if not is_admin and (owner_uid <= 0 or caller_uid != owner_uid):
                    return self._send_json({"success": False, "message": "Not authorized to cancel this booking"}, 403, sid)
                db.execute("DELETE FROM t_seat WHERE seat_code = ?", (seat_id,))
                db.commit()
                return self._send_json({"success": True, "message": "Booking cancelled", "data": {"seat_code": seat_id}}, 200, sid)

            # Users
            if route == "user/user/reg":
                name = str(p.get("name", "")).strip()
                email = str(p.get("email", "")).strip().lower()
                pw = str(p.get("password", ""))
                if not name or "@" not in email or len(pw) < 6:
                    return self._send_json({"success": False, "message": "Invalid registration details"}, 200, sid)
                if db.execute("SELECT 1 FROM t_user WHERE email = ?", (email,)).fetchone():
                    return self._send_json({"success": False, "message": "This email has already been registered"}, 200, sid)
                cur = db.execute(
                    "INSERT INTO t_user (user_name, email, login_pwd, create_time) VALUES (?,?,?,?)",
                    (name, email, hash_password_bcrypt(pw), now_str),
                )
                db.commit()
                uid = int(cur.lastrowid)
                session["user_id"] = uid
                session["user_email"] = email
                return self._send_json(
                    {"success": True, "message": "Registration successful", "data": {"user_id": uid, "user_name": name, "email": email}},
                    200,
                    sid,
                )

            if route == "user/user/login":
                email = str(p.get("email", "")).strip().lower()
                pw = str(p.get("password", ""))
                urow = db.execute("SELECT * FROM t_user WHERE email = ?", (email,)).fetchone()
                if not urow or not verify_password_bcrypt(pw, urow["login_pwd"]):
                    return self._send_json({"success": False, "message": "Invalid email or password"}, 200, sid)
                uid = int(urow["user_code"])
                session["user_id"] = uid
                session["user_email"] = urow["email"]
                return self._send_json(
                    {"success": True, "message": "Login successful", "data": {"user_id": uid, "user_name": urow["user_name"], "email": urow["email"]}},
                    200,
                    sid,
                )

            if route == "user/user/logout":
                session.pop("user_id", None)
                session.pop("user_email", None)
                return self._send_json({"success": True, "message": "Logout successful", "data": None}, 200, sid)

            if route == "user/user/changepassword":
                email = str(p.get("email", "")).strip().lower()
                pw = str(p.get("pwd", ""))
                vcode = str(p.get("verification_code", "")).strip()
                if vcode != "888888":
                    return self._send_json({"success": False, "message": "Verification code is incorrect"}, 200, sid)
                urow = db.execute("SELECT user_code FROM t_user WHERE email = ?", (email,)).fetchone()
                if not urow:
                    return self._send_json({"success": False, "message": "Account not found for this email"}, 200, sid)
                db.execute("UPDATE t_user SET login_pwd = ?, update_time = ? WHERE user_code = ?", (hash_password_bcrypt(pw), now_str, urow["user_code"]))
                db.commit()
                return self._send_json({"success": True, "message": "Password changed successfully", "data": None}, 200, sid)

            # Admin CRUD
            if route == "admin/movie/index":
                rows = db.execute("SELECT * FROM t_movies ORDER BY movie_code ASC").fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "admin/movie/getmoviebycode":
                mid = int(p.get("movie_code") or 0)
                row = db.execute("SELECT * FROM t_movies WHERE movie_code = ?", (mid,)).fetchone()
                return self._send_json({"success": bool(row), "data": dict(row) if row else None}, 200 if row else 404, sid)

            if route == "admin/movie/create":
                cur = db.execute(
                    "INSERT INTO t_movies (movie_name, tag, star, movie_type, img, money, times, create_time) VALUES (?,?,?,?,?,?,?,?)",
                    (p["movie_name"], p.get("tag") or None, float(p["star"]), p["movie_type"], p["img"], float(p["money"]), p["times"], now_str),
                )
                db.commit()
                return self._send_json({"success": True, "message": "Movie created successfully", "data": {"movie_code": cur.lastrowid}}, 200, sid)

            if route == "admin/movie/update":
                mid = int(p.get("movie_code") or 0)
                db.execute(
                    "UPDATE t_movies SET movie_name=?, tag=?, star=?, movie_type=?, img=?, money=?, times=?, update_time=? WHERE movie_code=?",
                    (p["movie_name"], p.get("tag") or None, float(p["star"]), p["movie_type"], p["img"], float(p["money"]), p["times"], now_str, mid),
                )
                db.commit()
                return self._send_json({"success": True, "message": "Movie updated successfully", "data": {"movie_code": mid}}, 200, sid)

            if route == "admin/movie/delete":
                mid = int(p.get("movie_code") or 0)
                db.execute("DELETE FROM t_movies WHERE movie_code = ?", (mid,))
                db.commit()
                return self._send_json({"success": True, "message": "Movie deleted successfully", "data": {"movie_code": mid}}, 200, sid)

            if route == "admin/offer/index":
                rows = db.execute("SELECT * FROM t_offer ORDER BY offer_code ASC").fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "admin/offer/getofferbycode":
                oid = int(p.get("offer_code") or 0)
                row = db.execute("SELECT * FROM t_offer WHERE offer_code = ?", (oid,)).fetchone()
                return self._send_json({"success": bool(row), "data": dict(row) if row else None}, 200 if row else 404, sid)

            if route == "admin/offer/create":
                validity = p.get("offer_validity")
                cur = db.execute(
                    "INSERT INTO t_offer (offer_title, offer_type, offer_description, promo_code, offer_validity, img, badge, money, create_time) VALUES (?,?,?,?,?,?,?,?,?)",
                    (p["offer_title"], p["offer_type"], p["offer_description"], str(p["promo_code"]).upper(), validity, p["img"], p.get("badge") or None, float(p["money"]), now_str),
                )
                db.commit()
                return self._send_json({"success": True, "message": "Offer created successfully", "data": {"offer_code": cur.lastrowid}}, 200, sid)

            if route == "admin/offer/update":
                oid = int(p.get("offer_code") or 0)
                validity = p.get("offer_validity")
                db.execute(
                    "UPDATE t_offer SET offer_title=?, offer_type=?, offer_description=?, promo_code=?, offer_validity=?, img=?, badge=?, money=?, update_time=? WHERE offer_code=?",
                    (p["offer_title"], p["offer_type"], p["offer_description"], str(p["promo_code"]).upper(), validity, p["img"], p.get("badge") or None, float(p["money"]), now_str, oid),
                )
                db.commit()
                return self._send_json({"success": True, "message": "Offer updated successfully", "data": {"offer_code": oid}}, 200, sid)

            if route == "admin/offer/delete":
                oid = int(p.get("offer_code") or 0)
                db.execute("DELETE FROM t_offer WHERE offer_code = ?", (oid,))
                db.commit()
                return self._send_json({"success": True, "message": "Offer deleted successfully", "data": {"offer_code": oid}}, 200, sid)

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
                seat_id = int(p.get("seat_code") or 0)
                db.execute("DELETE FROM t_seat WHERE seat_code = ?", (seat_id,))
                db.commit()
                return self._send_json({"success": True, "message": "Seat booking deleted", "data": {"seat_code": seat_id}}, 200, sid)

            if route == "admin/theater/index":
                rows = db.execute("SELECT * FROM t_theater ORDER BY theater_code ASC").fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "admin/user/index":
                rows = db.execute("SELECT user_code, user_name, email, create_time, update_time FROM t_user ORDER BY user_code ASC").fetchall()
                return self._send_json({"success": True, "message": "OK", "data": rows_to_dicts(rows)}, 200, sid)

            if route == "admin/user/getuserbycode":
                uid = int(p.get("user_code") or 0)
                row = db.execute("SELECT user_code, user_name, email, create_time, update_time FROM t_user WHERE user_code = ?", (uid,)).fetchone()
                return self._send_json({"success": bool(row), "data": dict(row) if row else None}, 200 if row else 404, sid)

            if route == "admin/user/create":
                cur = db.execute(
                    "INSERT INTO t_user (user_name, email, login_pwd, create_time) VALUES (?,?,?,?)",
                    (p["user_name"], str(p["email"]).lower(), hash_password_bcrypt(p["login_pwd"]), now_str),
                )
                db.commit()
                return self._send_json({"success": True, "message": "User created successfully", "data": {"user_code": cur.lastrowid}}, 200, sid)

            if route == "admin/user/update":
                uid = int(p.get("user_code") or 0)
                if p.get("login_pwd"):
                    db.execute(
                        "UPDATE t_user SET user_name=?, email=?, login_pwd=?, update_time=? WHERE user_code=?",
                        (p["user_name"], str(p["email"]).lower(), hash_password_bcrypt(p["login_pwd"]), now_str, uid),
                    )
                else:
                    db.execute(
                        "UPDATE t_user SET user_name=?, email=?, update_time=? WHERE user_code=?",
                        (p["user_name"], str(p["email"]).lower(), now_str, uid),
                    )
                db.commit()
                return self._send_json({"success": True, "message": "User updated successfully", "data": {"user_code": uid}}, 200, sid)

            if route == "admin/user/delete":
                uid = int(p.get("user_code") or 0)
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
