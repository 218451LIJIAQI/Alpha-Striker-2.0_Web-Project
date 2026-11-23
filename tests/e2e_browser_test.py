#!/usr/bin/env python3
"""
End-to-End Headless Chromium Browser & Concurrency Verification Suite (Selenium WebDriver).
Verifies:
1. Root redirect, 7-movie catalog, genre filter, keyword search, and reversible dark mode.
2. Theater search & Theater Details with live `theater_movie` Now Showing schedule.
3. Offline CSS-3D Auditorium (96 seats A1-H12, zero external Sketchfab failure), seat handoff,
   checkout -> Change Seats state restoration, expired-card rejection, promo validation, authoritative receipt,
   and guest user_code spoofing neutralization.
4. Offers page DB validity, promo handoff & 5+ seat 30% automatic group discount ($134.00).
5. Security & Auth: 401/403 IDOR & guest-ticket cancel guards, session ID rotation, signed-in old-password change,
   dynamic 6-digit reset code (no 888888 backdoor, no debug_code leak by default, 5-attempt 429 lockout, mail-sink reset),
   seed $2y$10$ login, and ticket wallet cancellation.
6. Admin Security & Cascading CRUD: 401 unauthenticated guard, 403 empty-token CSRF block, full Theater/Movie/Offer/User/Seat CRUD,
   `theater_movie` & `movie_offer` cascading verification, and exclusive member/movie-scoped promo enforcement.
7. Interactive closures across FAQs search/filter, Gift Card customizer & balance check, Upcoming reminders, Help Center, and XSS-safe Live Chat.
8. Multi-threaded concurrency race: 12 simultaneous seat booking requests -> exact 1 × 200 + 11 × 409 + atomic partial-overlap rollback.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from mock_thinkphp_server import start_background_server


def assert_eq(actual, expected, msg: str) -> None:
    if actual != expected:
        raise AssertionError(f"{msg}: expected {expected!r}, got {actual!r}")


def assert_true(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def check_no_local_errors(driver: webdriver.Chrome, context: str, base_url: str) -> None:
    logs = driver.get_log("browser")
    severe_local = []
    for entry in logs:
        if entry.get("level") != "SEVERE":
            continue
        message = entry.get("message", "")
        if any(
            ext in message
            for ext in ("cdnjs.cloudflare.com", "fonts.googleapis.com", "sketchfab.com", "ERR_NAME_NOT_RESOLVED", "ERR_INTERNET_DISCONNECTED")
        ) and base_url not in message:
            continue
        if any(code in message for code in ("status of 401", "status of 403", "status of 409", "status of 429")):
            continue
        severe_local.append(message)
    assert_true(len(severe_local) == 0, f"Browser console errors in {context}: {severe_local}")


def http_json(
    url: str,
    method: str = "GET",
    payload: dict | None = None,
    headers: dict | None = None,
) -> tuple[int, dict, dict[str, str]]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url.replace("cinetix.local", "127.0.0.1"), data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            return resp.status, json.loads(resp.read().decode("utf-8")), resp_headers
    except urllib.error.HTTPError as err:
        err_headers = {k.lower(): v for k, v in err.headers.items()}
        return err.code, json.loads(err.read().decode("utf-8")), err_headers


def extract_phpsessid(resp_headers: dict[str, str]) -> str:
    sc = resp_headers.get("set-cookie", "")
    for part in sc.split(";"):
        p = part.strip()
        if p.startswith("PHPSESSID="):
            return p.split("=", 1)[1]
    return ""


def run_e2e_suite() -> None:
    server, raw_url = start_background_server()
    port = raw_url.rsplit(":", 1)[1]
    base_url = f"http://cinetix.local:{port}"
    print(f"Started 1:1 contract server at {base_url}")

    options = Options()
    options.page_load_strategy = "eager"
    chrome_candidates = [
        os.environ.get("CHROME_BINARY", ""),
        shutil.which("chromium") or "",
        shutil.which("chromium-browser") or "",
        shutil.which("google-chrome") or "",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for candidate in chrome_candidates:
        if candidate and os.path.exists(candidate):
            options.binary_location = candidate
            break
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1440,960")
    options.add_argument("--host-resolver-rules=MAP cinetix.local 127.0.0.1, MAP * ~NOTFOUND")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver_path = os.environ.get("CHROMEDRIVER_PATH") or shutil.which("chromedriver") or "/usr/bin/chromedriver"
    driver = (
        webdriver.Chrome(service=Service(driver_path), options=options)
        if driver_path and os.path.exists(driver_path)
        else webdriver.Chrome(options=options)
    )
    wait = WebDriverWait(driver, 8)

    try:
        # 1. Entry redirect + Movie Catalog + Genre Filter + Search + Reversible Dark Mode
        driver.get(f"{base_url}/index.html")
        wait.until(EC.url_contains("/pages/homepage.html"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".movie-card")) == 7)

        theme_btn = driver.find_element(By.ID, "theme-toggle-btn")
        theme_btn.click()
        assert_true(
            driver.execute_script("return document.body.classList.contains('dark-mode') && localStorage.getItem('darkMode') === 'true'"),
            "Dark mode failed to activate",
        )
        theme_btn.click()
        assert_true(
            driver.execute_script("return !document.body.classList.contains('dark-mode') && localStorage.getItem('darkMode') === 'false'"),
            "Dark mode failed to revert cleanly to light mode",
        )

        driver.find_element(By.CSS_SELECTOR, '.btn-filter[data-genre="Adventure"]').click()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".movie-card")) == 2)

        search_input = driver.find_element(By.CSS_SELECTOR, ".search-input")
        search_input.clear()
        search_input.send_keys("Knives")
        driver.find_element(By.CSS_SELECTOR, ".search-btn").click()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".movie-card")) == 1)
        assert_eq(driver.find_element(By.CSS_SELECTOR, ".movie-title").text, "Knives Out", "Search result title")
        check_no_local_errors(driver, "Homepage catalog & search", base_url)
        print("[PASS] E2E 1: Root redirect, 7-movie catalog, genre filter, search, and reversible dark mode")

        # 2. Theaters Directory -> Search by Name -> Theater Details -> Live Now Showing -> 3D Auditorium Preview
        driver.get(f"{base_url}/pages/theater.html")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".theater-card")) == 6)

        t_input = driver.find_element(By.CSS_SELECTOR, ".search-location input")
        t_input.send_keys("AMC")
        driver.find_element(By.CSS_SELECTOR, ".search-location button").click()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".theater-card")) == 1)
        driver.find_element(By.CSS_SELECTOR, ".theater-card .view-details").click()

        wait.until(EC.url_contains("theater-details.html?theater_code=2"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#movies-list .movie-card")) == 7)
        hero_text = driver.find_element(By.ID, "theater-hero").text
        assert_true("reviews reviews" not in hero_text, f"Duplicate 'reviews reviews' found: {hero_text}")
        check_no_local_errors(driver, "Theater directory & details", base_url)
        print("[PASS] E2E 2: Theater search by name & Theater Details with 7 live 'Now Showing' movies")

        # 3. Offline CSS-3D Auditorium -> Seat Handoff -> Change Seats Restoration -> Expired Card Guard -> Checkout & Receipt
        driver.find_element(By.CSS_SELECTOR, "#movies-list .movie-card a").click()
        wait.until(EC.url_contains("booking3.html?movie_code=1&theater_code=2"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".seat[data-seat]")) == 96)

        # Launch offline 3D auditorium view, pick F2 in 3D, and return to booking3 with F2 pre-selected
        driver.find_element(By.CSS_SELECTOR, ".vr-button").click()
        wait.until(EC.url_contains("3d-model.html"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".seat-3d[data-seat]")) == 96)
        driver.find_element(By.CSS_SELECTOR, '.seat-3d[data-seat="F2"]').click()
        assert_true("F2" in driver.find_element(By.ID, "pov-seat-label").text, "3D POV telemetry did not update")
        driver.find_element(By.ID, "book-pov-seat-btn").click()

        wait.until(EC.url_contains("booking3.html"))
        wait.until(lambda d: d.find_element(By.ID, "summary-count").text == "1")
        driver.find_element(By.CSS_SELECTOR, '.seat[data-seat="F3"]').click()
        assert_eq(driver.find_element(By.ID, "summary-count").text, "2", "Selected seat count")
        driver.find_element(By.CSS_SELECTOR, ".proceed-button").click()

        wait.until(EC.url_contains("pay.html"))
        wait.until(lambda d: driver.find_element(By.ID, "total-price").text == "$78.00")

        # Verify Change Seats round-trip state restoration
        driver.find_element(By.ID, "modify-seats-link").click()
        wait.until(EC.url_contains("booking3.html"))
        wait.until(lambda d: d.find_element(By.ID, "summary-count").text == "2")
        assert_eq(driver.find_element(By.CSS_SELECTOR, ".seat-tags").text.replace("\n", " "), "F2 F3", "Restored seats")
        driver.find_element(By.CSS_SELECTOR, ".proceed-button").click()
        wait.until(EC.url_contains("pay.html"))
        wait.until(lambda d: driver.find_element(By.ID, "total-price").text == "$78.00")

        # Verify expired card rejection (01/22 must NOT submit)
        driver.find_element(By.ID, "card-number").send_keys("4111222233334444")
        driver.find_element(By.ID, "expiry").send_keys("0122")
        driver.find_element(By.ID, "cvv").send_keys("123")
        driver.find_element(By.ID, "cardholder-name").send_keys("Guest Tester")
        driver.find_element(By.CSS_SELECTOR, ".pay-now-btn").click()
        time.sleep(0.25)
        assert_true("pay.html" in driver.current_url, "Expired card 01/22 was not blocked!")

        # Promo verification: invalid rejected, valid STUDENT30 applied -> $75.50
        coupon_input = driver.find_element(By.ID, "coupon-code")
        verify_btn = driver.find_element(By.ID, "verify-coupon")
        coupon_input.send_keys("INVALIDCODE999")
        verify_btn.click()
        time.sleep(0.25)
        assert_eq(driver.find_element(By.ID, "amount-due").text, "$80.50", "Total unchanged after invalid promo")

        coupon_input.clear()
        coupon_input.send_keys("STUDENT30")
        verify_btn.click()
        wait.until(lambda d: driver.find_element(By.ID, "amount-due").text == "$75.50")

        # Fix card expiry to future 12/29 and complete payment
        exp_el = driver.find_element(By.ID, "expiry")
        exp_el.clear()
        exp_el.send_keys("1229")
        driver.find_element(By.CSS_SELECTOR, ".pay-now-btn").click()

        wait.until(EC.url_contains("paysuccess.html"))
        wait.until(lambda d: d.find_element(By.CSS_SELECTOR, ".payment-success").is_displayed())
        conf_text = driver.find_element(By.CSS_SELECTOR, ".confirmation-details").text
        assert_true(
            "Frozen 2" in conf_text and "F2, F3" in conf_text and "STUDENT30" in conf_text and "$75.50" in conf_text,
            f"Authoritative receipt mismatch: {conf_text}",
        )

        booked_date = driver.execute_script("return JSON.parse(sessionStorage.getItem('lastBookingReceipt')).date")

        # Verify guest spoofing user_code=1 is ignored (stored as NULL) & duplicate seat returns 409
        spoof_status, spoof_body, _ = http_json(
            f"{raw_url}/index.php/movie/seat/saveSeats",
            method="POST",
            payload={"movie_code": 1, "theater_code": 2, "date": booked_date, "time": "09:30 AM", "seat_nums": ["F4"], "user_code": 1},
        )
        assert_eq(spoof_status, 200, "Guest F4 booking status")
        spoof_row = server.state.conn.execute(
            "SELECT seat_code, user_code FROM t_seat WHERE movie_code=1 AND theater_code=2 AND date=? AND time='09:30 AM' AND seat_num='F4'",
            (booked_date,),
        ).fetchone()
        assert_true(spoof_row is not None and spoof_row["user_code"] is None, "Guest spoofed user_code=1 was not forced to NULL!")
        guest_seat_id = int(spoof_row["seat_code"])

        check_no_local_errors(driver, "3D preview, seat restore, card expiry, promo & receipt", base_url)
        print("[PASS] E2E 3: Offline 3D auditorium, Change Seats restore, expired-card guard, authoritative receipt & guest user_code=NULL isolation")

        # 4. Offers Page Promo Claim Handoff & 5+ Seat 30% Automatic Group Discount
        driver.get(f"{base_url}/pages/offer.html")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".offer-card")) == 5)
        validity_txt = driver.find_element(By.CSS_SELECTOR, ".offer-card .offer-validity").text
        assert_true("2027-12-31" in validity_txt, f"Expected real DB offer_validity date, got {validity_txt}")
        driver.find_element(By.CSS_SELECTOR, ".offer-card .claim-offer").click()
        wait.until(EC.url_contains("homepage.html"))

        driver.get(f"{base_url}/pages/booking3.html?movie_code=4&theater_code=3")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".seat[data-seat]")) == 96)
        for s in ("G1", "G2", "G3", "G4", "G5"):
            driver.find_element(By.CSS_SELECTOR, f'.seat[data-seat="{s}"]').click()
        assert_true("30% group savings" in driver.find_element(By.ID, "summary-price").text, "5-seat bulk discount missing")
        driver.find_element(By.CSS_SELECTOR, ".proceed-button").click()
        wait.until(EC.url_contains("pay.html"))
        wait.until(lambda d: driver.find_element(By.ID, "coupon-code").get_attribute("value") == "STUDENT30")
        driver.find_element(By.ID, "verify-coupon").click()
        wait.until(lambda d: driver.find_element(By.ID, "amount-due").text == "$134.00")
        check_no_local_errors(driver, "Offers page & 5-seat group discount", base_url)
        print("[PASS] E2E 4: Offers page DB validity, promo handoff & 5-seat 30% group + promo pricing ($134.00)")

        # 5. Auth Hardening: 401/403 IDOR Guards, Session Rotation, Old-Password Change, Dynamic Reset Lockout & Ticket Wallet
        unauth_list_code, _, _ = http_json(f"{raw_url}/index.php/movie/seat/getSeatListByUserCode?user_code=1")
        assert_eq(unauth_list_code, 401, "Unauthenticated ticket list must return 401")
        unauth_del_code, _, _ = http_json(
            f"{raw_url}/index.php/movie/seat/delete",
            method="POST",
            payload={"seat_code": 8, "user_code": 1},
        )
        assert_eq(unauth_del_code, 401, "Unauthenticated ticket delete with spoofed user_code must return 401")

        # Register Alice via browser
        driver.get(f"{base_url}/login.html")
        driver.find_element(By.LINK_TEXT, "Create Account").click()
        wait.until(lambda d: d.find_element(By.ID, "register-page").is_displayed())

        driver.find_element(By.ID, "name").send_keys("Alice Tan")
        driver.find_element(By.ID, "reg-email").send_keys("alice@example.com")
        driver.find_element(By.ID, "reg-password").send_keys("secret123")
        driver.find_element(By.ID, "confirm-password").send_keys("secret123")
        driver.find_element(By.ID, "terms").click()
        driver.find_element(By.CSS_SELECTOR, "#register-form button[type='submit']").click()

        wait.until(EC.url_contains("/pages/homepage.html"))
        assert_eq(driver.find_element(By.ID, "header-username").text, "Alice Tan", "Header username after registration")

        alice_cookie = next(c["value"] for c in driver.get_cookies() if c["name"] == "PHPSESSID")
        alice_hdr = {"Cookie": f"PHPSESSID={alice_cookie}"}

        # Verify horizontal IDOR protection: Alice cannot read or delete User #1's tickets or Guest tickets
        idor_list_code, _, _ = http_json(f"{raw_url}/index.php/movie/seat/getSeatListByUserCode?user_code=1", headers=alice_hdr)
        assert_eq(idor_list_code, 403, "Cross-account ticket query must return 403")
        idor_del_code, _, _ = http_json(
            f"{raw_url}/index.php/movie/seat/delete",
            method="POST",
            payload={"seat_code": 8, "user_code": 1},
            headers=alice_hdr,
        )
        assert_eq(idor_del_code, 403, "Cross-account ticket cancellation must return 403")
        guest_del_code, _, _ = http_json(
            f"{raw_url}/index.php/movie/seat/delete",
            method="POST",
            payload={"seat_code": guest_seat_id},
            headers=alice_hdr,
        )
        assert_eq(guest_del_code, 403, "Cancelling guest booking must return 403")

        # Signed-in Current Password change + session rotation check
        driver.get(f"{base_url}/pwd.html?mode=change")
        wait.until(lambda d: d.find_element(By.ID, "change-pwd-form").is_displayed())
        driver.find_element(By.ID, "old-password").send_keys("secret123")
        driver.find_element(By.ID, "new-password-auth").send_keys("secret789")
        driver.find_element(By.ID, "confirm-password-auth").send_keys("secret789")
        driver.find_element(By.CSS_SELECTOR, "#change-pwd-form button[type='submit']").click()
        wait.until(EC.url_contains("/pages/homepage.html"))
        rotated_cookie = next(c["value"] for c in driver.get_cookies() if c["name"] == "PHPSESSID")
        assert_true(rotated_cookie != alice_cookie, "Session ID did not rotate after password change!")

        # Logout Alice & verify server session destroyed
        driver.find_element(By.ID, "header-auth-btn").click()
        wait.until(EC.url_contains("/login.html"))
        _, sess_after_logout, _ = http_json(f"{raw_url}/index.php/user/user/session", headers={"Cookie": f"PHPSESSID={rotated_cookie}"})
        assert_eq(sess_after_logout["data"]["authenticated"], False, "Server session must be destroyed after logout")

        # Verify hardcoded '888888' fails, default sendResetCode omits debug_code, and 5 wrong attempts trigger 429 lockout
        _, send_body, send_hdrs = http_json(
            f"{raw_url}/index.php/user/user/sendResetCode",
            method="POST",
            payload={"email": "alice@example.com"},
        )
        assert_eq(send_body["success"], True, "sendResetCode succeeded")
        assert_true("debug_code" not in send_body["data"], "debug_code leaked in production default mode!")
        reset_sid = extract_phpsessid(send_hdrs)
        reset_hdr = {"Cookie": f"PHPSESSID={reset_sid}"}

        for attempt in range(1, 6):
            att_code, att_body, _ = http_json(
                f"{raw_url}/index.php/user/user/changePassword",
                method="POST",
                payload={"email": "alice@example.com", "verification_code": "888888", "pwd": "hacked123"},
                headers=reset_hdr,
            )
            if attempt < 5:
                assert_eq(att_body["success"], False, "888888 must be rejected")
            else:
                assert_eq(att_code, 429, "5th failed verification attempt must lock out with 429")

        # Complete legitimate dynamic code reset in browser
        time.sleep(2.1)  # Respect 2s sendResetCode cooldown
        driver.get(f"{base_url}/pwd.html")
        driver.find_element(By.ID, "email").send_keys("alice@example.com")
        driver.find_element(By.ID, "send-code").click()
        wait.until(lambda d: "s" in d.find_element(By.ID, "send-code").text)
        real_code = server.state.mail_outbox["alice@example.com"]
        assert_true(len(real_code) == 6 and real_code.isdigit(), f"Expected 6-digit code in mail sink, got {real_code}")
        driver.find_element(By.ID, "Verification").send_keys(real_code)
        driver.find_element(By.ID, "password").send_keys("newpass456")
        driver.find_element(By.CSS_SELECTOR, "#reset-form button[type='submit']").click()
        wait.until(EC.url_contains("/login.html"))

        # Verify Alice can sign in with reset password, then sign out and test seed user LI JIAQI
        driver.find_element(By.ID, "email").send_keys("alice@example.com")
        driver.find_element(By.ID, "password").send_keys("newpass456")
        driver.find_element(By.CSS_SELECTOR, "#login-form button[type='submit']").click()
        wait.until(EC.url_contains("/pages/homepage.html"))
        driver.find_element(By.ID, "header-auth-btn").click()
        wait.until(EC.url_contains("/login.html"))

        driver.find_element(By.ID, "email").send_keys("218451@student.upm.edu.my")
        driver.find_element(By.ID, "password").send_keys("218451")
        driver.find_element(By.CSS_SELECTOR, "#login-form button[type='submit']").click()
        wait.until(EC.url_contains("/pages/homepage.html"))
        assert_eq(driver.find_element(By.ID, "header-username").text, "LI JIAQI", "Seed bcrypt user login")

        driver.find_element(By.ID, "header-tickets-link").click()
        wait.until(EC.url_contains("generate_ticket.html"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#cons .ticket")) == 9)

        driver.find_element(By.CSS_SELECTOR, "#cons .ticket .cancel-button").click()
        driver.switch_to.alert.accept()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#cons .ticket")) == 8)
        check_no_local_errors(driver, "User auth, IDOR guards, reset lockout & tickets", base_url)
        print("[PASS] E2E 5: 401/403 IDOR guards, session rotation, old-pwd change, dynamic reset 429 lockout & ticket wallet")

        # 6. Admin 401/403 CSRF Enforcement + Full Cascading CRUD (Theaters, Movies, Offers, Users, Seats)
        status_401, _, _ = http_json(f"{raw_url}/index.php/admin/movie/index")
        assert_eq(status_401, 401, "Unauthenticated admin API must return 401")

        driver.get(f"{base_url}/admin/dashboard.html")
        wait.until(EC.url_contains("/admin/login.html"))

        driver.find_element(By.ID, "admin-username").send_keys("admin")
        driver.find_element(By.ID, "admin-password").send_keys("admin")
        driver.find_element(By.ID, "admin-submit-btn").click()

        wait.until(EC.url_contains("/admin/dashboard.html"))
        wait.until(lambda d: d.find_element(By.ID, "stat-movies").text == "7")

        # Verify CSRF fix: sending admin session cookie WITHOUT X-Admin-Token MUST return 403!
        admin_sid = next(c["value"] for c in driver.get_cookies() if c["name"] == "PHPSESSID")
        csrf_code, _, _ = http_json(
            f"{raw_url}/index.php/admin/movie/delete",
            method="POST",
            payload={"movie_code": 1},
            headers={"Cookie": f"PHPSESSID={admin_sid}"},  # No X-Admin-Token!
        )
        assert_eq(csrf_code, 403, "Admin write without X-Admin-Token MUST be rejected with 403 CSRF protection!")

        # Admin Theater CRUD (Create -> Edit -> Verify -> Delete)
        driver.get(f"{base_url}/admin/theaters.html")
        wait.until(lambda d: "Cinemark Premium" in d.find_element(By.ID, "theaters-tbody").text)
        driver.find_element(By.ID, "open-add-theater-btn").click()
        wait.until(lambda d: d.find_element(By.ID, "theater-form").is_displayed())
        driver.find_element(By.ID, "theater_name").send_keys("Pavilion Laser Cinema")
        driver.find_element(By.ID, "address").send_keys("88 Bukit Bintang, City Center")
        driver.find_element(By.ID, "save-theater-btn").click()
        wait.until(lambda d: "Pavilion Laser Cinema" in d.find_element(By.ID, "theaters-tbody").text)

        # Create Movie #8 restricted ONLY to Theater #1 (uncheck others)
        driver.get(f"{base_url}/admin/add-movie.html")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#theater-check-grid input[type='checkbox']")) >= 6)
        driver.find_element(By.ID, "movie_name").send_keys("Interstellar Re-Release")
        driver.find_element(By.ID, "times").send_keys("2h 49m")
        driver.find_element(By.ID, "img").send_keys("../img/homepage/starwars_.jpg")
        driver.find_element(By.ID, "clear-all-theaters").click()
        driver.find_element(By.CSS_SELECTOR, "#theater-check-grid input[value='1']").click()
        driver.find_element(By.CSS_SELECTOR, "#add-movie-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/movies.html"))
        wait.until(lambda d: "Interstellar Re-Release" in d.find_element(By.ID, "movies-tbody").text)
        assert_true("1 cinema" in driver.find_element(By.ID, "movies-tbody").text, "Cascading theater count mismatch")

        # Verify Movie #8 is visible in Theater #1 details AND absent from Theater #2 details!
        _, th1_data, _ = http_json(f"{raw_url}/index.php/theater/theater/getTheaterDetails?theater_code=1")
        _, th2_data, _ = http_json(f"{raw_url}/index.php/theater/theater/getTheaterDetails?theater_code=2")
        assert_true(any(m["movie_name"] == "Interstellar Re-Release" for m in th1_data["data"]["movies"]), "Movie #8 missing from Theater #1!")
        assert_true(all(m["movie_name"] != "Interstellar Re-Release" for m in th2_data["data"]["movies"]), "Movie #8 leaked into unassigned Theater #2!")

        # Edit Movie #8 badge
        driver.get(f"{base_url}/admin/edit-movie.html?movie_code=8")
        wait.until(lambda d: d.find_element(By.ID, "movie_name").get_attribute("value") == "Interstellar Re-Release")
        driver.find_element(By.ID, "tag").send_keys("IMAX")
        driver.find_element(By.CSS_SELECTOR, "#edit-movie-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/movies.html"))
        wait.until(lambda d: "IMAX" in d.find_element(By.ID, "movies-tbody").text)

        # Create Exclusive Offer #6 (`VIPONLY15`) restricted ONLY to Movie #8 and owned by User #1 (LI JIAQI)
        driver.get(f"{base_url}/admin/add-offer.html")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#movie-check-grid input[type='checkbox']")) >= 8)
        driver.find_element(By.ID, "offer_title").send_keys("LI JIAQI Interstellar VIP")
        driver.find_element(By.ID, "promo_code").send_keys("VIPONLY15")
        money_el = driver.find_element(By.ID, "money")
        money_el.clear()
        money_el.send_keys("15.00")
        driver.execute_script("document.getElementById('user_code').value = '1';")
        driver.find_element(By.ID, "img").send_keys("../img/offer/family.png")
        driver.find_element(By.ID, "offer_description").send_keys("Exclusive $15 off Interstellar for User #1.")
        driver.find_element(By.ID, "clear-all-movies").click()
        driver.find_element(By.CSS_SELECTOR, "#movie-check-grid input[value='8']").click()
        driver.find_element(By.CSS_SELECTOR, "#add-offer-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/offers.html"))
        wait.until(lambda d: "VIPONLY15" in d.find_element(By.ID, "offers-tbody").text)

        # Verify Promo Exclusivity & Movie-Offer Scope via API
        guest_promo_code, _, _ = http_json(f"{raw_url}/index.php/offer/offer/getMoneyByBadge?badge=VIPONLY15&movie_code=8")
        assert_eq(guest_promo_code, 401, "Guest using member-exclusive promo must return 401")

        _, alice_login, alice_lhdrs = http_json(
            f"{raw_url}/index.php/user/user/login",
            method="POST",
            payload={"email": "alice@example.com", "password": "newpass456"},
        )
        alice_sid2 = extract_phpsessid(alice_lhdrs)
        wrong_user_code, _, _ = http_json(
            f"{raw_url}/index.php/offer/offer/getMoneyByBadge?badge=VIPONLY15&movie_code=8",
            headers={"Cookie": f"PHPSESSID={alice_sid2}"},
        )
        assert_eq(wrong_user_code, 403, "Another member using User #1's exclusive promo must return 403")

        _, u1_login, u1_lhdrs = http_json(
            f"{raw_url}/index.php/user/user/login",
            method="POST",
            payload={"email": "218451@student.upm.edu.my", "password": "218451"},
        )
        u1_sid = extract_phpsessid(u1_lhdrs)
        u1_hdr = {"Cookie": f"PHPSESSID={u1_sid}"}

        _, wrong_movie_body, _ = http_json(
            f"{raw_url}/index.php/offer/offer/getMoneyByBadge?badge=VIPONLY15&movie_code=1",
            headers=u1_hdr,
        )
        assert_eq(wrong_movie_body["success"], False, "VIPONLY15 must be rejected on Movie #1 (cross-movie blocked)")

        ok_promo_code, ok_promo_body, _ = http_json(
            f"{raw_url}/index.php/offer/offer/getMoneyByBadge?badge=VIPONLY15&movie_code=8&seat_count=2",
            headers=u1_hdr,
        )
        assert_eq(ok_promo_code, 200, "Owner using VIPONLY15 on eligible Movie #8 status")
        assert_eq(ok_promo_body["data"]["pricing"]["total_amount"], 65.50, "2*$39 - $15 + $2.50 = $65.50")

        # Admin User CRUD + Redaction + Seat Management
        driver.get(f"{base_url}/admin/add-user.html")
        wait.until(lambda d: d.find_element(By.ID, "user_name").is_displayed())
        driver.find_element(By.ID, "user_name").send_keys("Bob Lim")
        driver.find_element(By.ID, "email").send_keys("bob@example.com")
        driver.find_element(By.ID, "login_pwd").send_keys("bobpass123")
        driver.find_element(By.CSS_SELECTOR, "#add-user-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/user.html"))
        wait.until(lambda d: "Bob Lim" in d.find_element(By.ID, "users-tbody").text)

        users_table_html = driver.find_element(By.ID, "users-tbody").get_attribute("innerHTML")
        assert_true("$2y$" not in users_table_html and "bobpass123" not in users_table_html, "Password leaked in admin users table!")

        driver.get(f"{base_url}/admin/seat.html")
        wait.until(lambda d: "Guest Checkout" in d.find_element(By.ID, "seats-tbody").text)
        check_no_local_errors(driver, "Admin CSRF, Theater/Movie/Offer/User/Seat CRUD", base_url)
        print("[PASS] E2E 6: Admin 401/403 CSRF guard, Theater CRUD, Movie/Offer cascading sync & exclusive promo binding")

        # 7. Interactive Info Pages (FAQs filter, Gift Cards builder, Upcoming reminders, Help jump & XSS-safe Chat)
        driver.get(f"{base_url}/pages/help.html")
        driver.find_element(By.CSS_SELECTOR, 'a.topic-chip[href="faqs.html?q=refund"]').click()
        wait.until(EC.url_contains("faqs.html?q=refund"))
        visible_faqs = [el for el in driver.find_elements(By.CSS_SELECTOR, "#faq-list .faq-section") if el.is_displayed()]
        assert_eq(len(visible_faqs), 1, "FAQ ?q=refund filter should narrow to 1 matching FAQ")

        driver.get(f"{base_url}/pages/giftcards.html")
        driver.find_element(By.CSS_SELECTOR, '.amount-pill[data-amount="100"]').click()
        driver.find_element(By.ID, "gc-recipient").send_keys("Maya")
        driver.find_element(By.ID, "gc-email").send_keys("maya@example.com")
        driver.find_element(By.ID, "issue-giftcard-btn").click()
        issued_code = driver.find_element(By.ID, "gc-preview-code").text
        assert_true(issued_code.startswith("GC-") and issued_code != "GC-DEMO-READY", f"Gift card code not issued: {issued_code}")

        driver.get(f"{base_url}/pages/upcoming.html")
        remind_btn = driver.find_element(By.CSS_SELECTOR, '.remind-btn[data-id="galactic-odyssey"]')
        remind_btn.click()
        assert_true("Reminder Active" in remind_btn.text, "Upcoming reminder button did not toggle")
        driver.find_element(By.CSS_SELECTOR, '#upcoming-format-filters .btn-filter[data-format="4DX®"]').click()
        visible_up = [el for el in driver.find_elements(By.CSS_SELECTOR, "#upcoming-grid .upcoming-card") if el.is_displayed()]
        assert_eq(len(visible_up), 1, "Upcoming 4DX filter count")

        for info_page in ("privacy.html", "team.html"):
            driver.get(f"{base_url}/pages/{info_page}")
            check_no_local_errors(driver, f"Info page {info_page}", base_url)

        driver.get(f"{base_url}/pages/about.html")
        driver.find_element(By.CSS_SELECTOR, ".team-social-btn").click()
        driver.find_element(By.CSS_SELECTOR, ".chat-btn").click()
        wait.until(lambda d: d.find_element(By.ID, "chat-dialog").is_displayed())
        chat_input = driver.find_element(By.ID, "chat-input-field")
        xss_probe = '<img src=x onerror="window.__xssTriggered=true">'
        chat_input.send_keys(xss_probe)
        driver.find_element(By.CSS_SELECTOR, ".send-message").click()
        time.sleep(0.3)
        assert_true(
            driver.execute_script("return window.__xssTriggered !== true"),
            "DOM XSS executed in live chat!",
        )
        check_no_local_errors(driver, "Interactive frontend pages & XSS-safe live chat", base_url)
        print("[PASS] E2E 7: FAQs live filter, Gift Card issuance, Upcoming reminders & XSS-safe live chat verified")

        # 8. Multi-Threaded Concurrency Race: 12 simultaneous seat booking requests -> exact 1 × 200 + 11 × 409
        num_workers = 12
        barrier = threading.Barrier(num_workers)
        race_results: list[tuple[int, dict]] = []
        race_lock = threading.Lock()

        def contender() -> None:
            barrier.wait()
            st, body, _ = http_json(
                f"{raw_url}/index.php/movie/seat/saveSeats",
                method="POST",
                payload={
                    "movie_code": 2,
                    "theater_code": 1,
                    "date": "2026-12-01",
                    "time": "08:00 PM",
                    "seat_nums": ["E6", "E7"],
                },
            )
            with race_lock:
                race_results.append((st, body))

        threads = [threading.Thread(target=contender) for _ in range(num_workers)]
        for th in threads:
            th.start()
        for th in threads:
            th.join()

        statuses = [st for st, _ in race_results]
        assert_eq(statuses.count(200), 1, f"Expected exactly 1 HTTP 200 winner, got {statuses}")
        assert_eq(statuses.count(409), num_workers - 1, f"Expected {num_workers - 1} HTTP 409 conflicts, got {statuses}")

        # Verify partial-overlap atomic rollback: booking ['E7', 'E8'] must return 409 on E7 AND leave E8 unbooked!
        part_status, part_body, _ = http_json(
            f"{raw_url}/index.php/movie/seat/saveSeats",
            method="POST",
            payload={
                "movie_code": 2,
                "theater_code": 1,
                "date": "2026-12-01",
                "time": "08:00 PM",
                "seat_nums": ["E7", "E8"],
            },
        )
        assert_eq(part_status, 409, "Partial-overlap seat booking must return 409")
        assert_eq(part_body["data"]["conflict_seats"], ["E7"], "Exact conflicting seat must be reported")
        e8_exists = server.state.conn.execute(
            "SELECT 1 FROM t_seat WHERE movie_code=2 AND theater_code=1 AND date='2026-12-01' AND time='08:00 PM' AND seat_num='E8'"
        ).fetchone()
        assert_true(e8_exists is None, "Atomic transaction rollback failed: E8 was persisted despite E7 conflict!")
        print(f"[PASS] E2E 8: 12-thread concurrent seat race verified (1 × 200 + 11 × 409 + atomic rollback)")

        print("ALL 8 HEADLESS CHROMIUM E2E & CONCURRENCY SUITES PASSED WITH ZERO LOCAL ERRORS.")
    finally:
        driver.quit()
        server.shutdown()


if __name__ == "__main__":
    run_e2e_suite()
    sys.exit(0)
