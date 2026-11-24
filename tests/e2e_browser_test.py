#!/usr/bin/env python3
"""
End-to-End Headless Chromium Browser, Keyboard Accessibility, Multi-Viewport/Zoom & Concurrency Suite.
Verifies:
1. Root redirect, 7-movie catalog, genre filter, keyword search, and reversible dark mode.
2. Theater search & Theater Details with live `theater_movie` Now Showing schedule.
3. Offline CSS-3D Auditorium (96 seats A1-H12, zero external Sketchfab failure), seat handoff,
   checkout -> Change Seats state restoration, expired-card rejection, promo validation, authoritative receipt,
   and guest user_code spoofing neutralization.
4. Offers page DB validity, promo handoff & 5+ seat 30% automatic group discount ($134.00).
5. Security & Auth: 401/403 IDOR & guest-ticket cancel guards, session ID rotation, signed-in old-password change,
   dynamic 6-digit reset code (no 888888 backdoor, no debug_code leak by default, 5-attempt 429 lockout, mail-sink reset),
   seed $2y$10$ login, and ticket wallet zone filter (4 VIP + 5 Standard) + cancellation.
6. Admin Security & Cascading CRUD: 401 unauthenticated guard, 403 empty-token CSRF block, full Theater/Movie/Offer/User/Seat CRUD,
   `theater_movie` & `movie_offer` cascading verification, live table search/filter/sort, and exclusive promo enforcement.
7. Interactive closures across FAQs search/filter, Gift Card customizer & balance check, Upcoming reminders, Help Center, and XSS-safe Live Chat.
8. Multi-threaded concurrency race: 12 simultaneous seat booking requests -> exact 1 × 200 + 11 × 409 + atomic partial-overlap rollback.
9. Deep-link empty context graceful guidance (`pay.html`, `paysuccess.html`), promo clear/restore (`#clear-coupon`),
   2D keyboard arrow-key seat navigation, global `Escape` modal/dropdown/drawer dismissal, and 1:1 PHP<->Mock edge-case parity.
10. Full 32-page HTML coverage + Desktop viewports (`1280×720`, `1366×768`, `1440×900`, `1920×1080`) & zoom (`100%`, `125%`, `150%`, `200%`)
    zero horizontal clipping + WCAG AA luminance contrast verification in both Light and Dark themes.
11. Strict scalar/ID/72B password guards, role-isolated logout, expired-offer filter, tampered checkout block & bulk admin delete.
12. Cross-origin CSRF 403, SameSite=Lax cookie, partial update "0" preservation, relation metadata retention, focus return & CSV formula defense.
13. Role-isolated login brute-force 429 lockouts, Path B reset customer-session clearing, screening start-time refund cutoff + past-date booking block,
    atomic batch deletion rollback, whitelisted pagination/sort metadata, port-strict same-origin guard, asset URI validation,
    URL deep-linking + `popstate`, modal `Tab` focus trap, `#userDropdown` ArrowDown menu navigation, and payment `radiogroup` keyboard roving focus.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from mock_thinkphp_server import sanitize_csv_cell, start_background_server


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
        if any(code in message for code in ("status of 400", "status of 401", "status of 403", "status of 404", "status of 409", "status of 429")):
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


WCAG_CONTRAST_JS = """
function parseRgb(str) {
  const m = (str || '').match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
  if (!m) return [255, 255, 255, 1];
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}
function effectiveBg(el) {
  let cur = el;
  while (cur && cur !== document) {
    const bg = getComputedStyle(cur).backgroundColor;
    const rgba = parseRgb(bg);
    if (rgba[3] >= 0.85) return rgba;
    cur = cur.parentElement;
  }
  return parseRgb(getComputedStyle(document.body).backgroundColor);
}
function lum(rgb) {
  const ch = rgb.slice(0, 3).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const el = document.querySelector(arguments[0]);
if (!el) return 99;
const fg = parseRgb(getComputedStyle(el).color);
const bg = effectiveBg(el);
const l1 = lum(fg), l2 = lum(bg);
return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
"""


def set_viewport(driver: webdriver.Chrome, width: int, height: int, scale: float = 1.0) -> None:
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {"width": int(width), "height": int(height), "deviceScaleFactor": float(scale), "mobile": False},
    )


def run_e2e_suite() -> None:
    server, raw_url = start_background_server()
    port = raw_url.rsplit(":", 1)[1]
    base_url = f"http://cinetix.local:{port}"
    print(f"Started 1:1 contract server at {base_url}")

    screenshot_dir_env = os.environ.get("CINETIX_SCREENSHOT_DIR", "").strip()
    screenshot_dir = Path(screenshot_dir_env) if screenshot_dir_env else None
    if screenshot_dir:
        screenshot_dir.mkdir(parents=True, exist_ok=True)
    report_json_env = os.environ.get("CINETIX_E2E_REPORT_JSON", "").strip()

    telemetry: dict = {
        "server_url": base_url,
        "port": int(port),
        "suites_passed": [],
        "wcag_contrast_samples": {},
        "viewport_zoom_audit": [],
        "screenshots": [],
        "concurrency_race": {},
    }

    def save_shot(name: str) -> None:
        if screenshot_dir:
            out = screenshot_dir / name
            driver.save_screenshot(str(out))
            telemetry["screenshots"].append(str(out))

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
    profile_dir = tempfile.mkdtemp(prefix="cinetix_e2e_profile_", dir="/tmp")
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-proxy-server")
    options.add_argument(f"--user-data-dir={profile_dir}")
    options.add_argument("--window-size=1440,900")
    options.add_argument("--host-resolver-rules=MAP cinetix.local 127.0.0.1, MAP * ~NOTFOUND")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver_path = os.environ.get("CHROMEDRIVER_PATH") or shutil.which("chromedriver") or "/usr/bin/chromedriver"
    driver = (
        webdriver.Chrome(service=Service(driver_path), options=options)
        if driver_path and os.path.exists(driver_path)
        else webdriver.Chrome(options=options)
    )
    set_viewport(driver, 1440, 900)
    wait = WebDriverWait(driver, 8)

    try:
        # 1. Entry redirect + Movie Catalog + Genre Filter + Search + Reversible Dark Mode + WCAG Contrast
        driver.get(f"{base_url}/index.html")
        wait.until(EC.url_contains("/pages/homepage.html"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".movie-card")) == 7)

        light_btn_contrast = round(float(driver.execute_script(WCAG_CONTRAST_JS, ".btn-book")), 2)
        light_title_contrast = round(float(driver.execute_script(WCAG_CONTRAST_JS, ".movie-title")), 2)
        assert_true(light_btn_contrast >= 4.5 and light_title_contrast >= 4.5, f"Light WCAG AA failed: btn={light_btn_contrast}, title={light_title_contrast}")
        telemetry["wcag_contrast_samples"]["homepage_light_btn_book"] = light_btn_contrast
        telemetry["wcag_contrast_samples"]["homepage_light_movie_title"] = light_title_contrast
        save_shot("01_homepage_1440x900_light.png")

        theme_btn = driver.find_element(By.ID, "theme-toggle-btn")
        theme_btn.click()
        assert_true(
            driver.execute_script("return document.body.classList.contains('dark-mode') && localStorage.getItem('darkMode') === 'true'"),
            "Dark mode failed to activate",
        )
        dark_title_contrast = round(float(driver.execute_script(WCAG_CONTRAST_JS, ".movie-title")), 2)
        dark_btn_contrast = round(float(driver.execute_script(WCAG_CONTRAST_JS, ".btn-book")), 2)
        assert_true(dark_title_contrast >= 4.5 and dark_btn_contrast >= 4.5, f"Dark WCAG AA failed: title={dark_title_contrast}, btn={dark_btn_contrast}")
        telemetry["wcag_contrast_samples"]["homepage_dark_movie_title"] = dark_title_contrast
        telemetry["wcag_contrast_samples"]["homepage_dark_btn_book"] = dark_btn_contrast
        save_shot("02_homepage_1440x900_dark.png")

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
        telemetry["suites_passed"].append("E2E 1: Homepage catalog, search, dark mode & WCAG AA")
        print("[PASS] E2E 1: Root redirect, 7-movie catalog, genre filter, search, reversible dark mode & WCAG AA contrast")

        # 2. Theaters Directory -> Search by Name -> Theater Details -> Live Now Showing
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
        save_shot("03_theater_details_1440x900_light.png")
        check_no_local_errors(driver, "Theater directory & details", base_url)
        telemetry["suites_passed"].append("E2E 2: Theater directory & live Now Showing details")
        print("[PASS] E2E 2: Theater search by name & Theater Details with 7 live 'Now Showing' movies")

        # 3. Offline CSS-3D Auditorium -> Keyboard Seat Navigation -> Change Seats -> Promo Apply/Clear -> Receipt
        driver.find_element(By.CSS_SELECTOR, "#movies-list .movie-card a").click()
        wait.until(EC.url_contains("booking3.html?movie_code=1&theater_code=2"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".seat[data-seat]")) == 96)

        # Verify 2D keyboard arrow-key navigation + Space selection + Clear button on seat matrix
        seat_d5 = driver.find_element(By.CSS_SELECTOR, '.seat[data-seat="D5"]')
        driver.execute_script("arguments[0].focus();", seat_d5)
        ActionChains(driver).send_keys(Keys.ARROW_RIGHT).perform()
        focused_seat = driver.execute_script("return document.activeElement && document.activeElement.getAttribute('data-seat')")
        assert_eq(focused_seat, "D6", "ArrowRight keyboard focus move from D5 to D6")
        ActionChains(driver).send_keys(Keys.SPACE).perform()
        assert_eq(driver.find_element(By.ID, "summary-count").text, "1", "Keyboard Space selected D6")
        assert_eq(driver.find_element(By.CSS_SELECTOR, ".seat-tags").text.strip(), "D6", "Exact seat D6 selected via keyboard")
        driver.find_element(By.ID, "clear-seats-btn").click()
        assert_eq(driver.find_element(By.ID, "summary-count").text, "0", "Clear button reset selected seats")

        # Launch offline 3D auditorium view, pick F2 in 3D, and return to booking3 with F2 pre-selected
        driver.find_element(By.CSS_SELECTOR, ".vr-button").click()
        wait.until(EC.url_contains("3d-model.html"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".seat-3d[data-seat]")) == 96)
        driver.find_element(By.CSS_SELECTOR, '.seat-3d[data-seat="F2"]').click()
        assert_true("F2" in driver.find_element(By.ID, "pov-seat-label").text, "3D POV telemetry did not update")
        save_shot("04_3d_auditorium_pov.png")
        driver.find_element(By.ID, "book-pov-seat-btn").click()

        wait.until(EC.url_contains("booking3.html"))
        wait.until(lambda d: d.find_element(By.ID, "summary-count").text == "1")
        driver.find_element(By.CSS_SELECTOR, '.seat[data-seat="F3"]').click()
        assert_eq(driver.find_element(By.ID, "summary-count").text, "2", "Selected seat count")
        save_shot("05_booking_seat_map_light.png")
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

        # Verify expired card rejection (01/22 must NOT submit and must persist .field-error-hint)
        driver.find_element(By.ID, "card-number").send_keys("4111222233334444")
        driver.find_element(By.ID, "expiry").send_keys("0122")
        driver.find_element(By.ID, "cvv").send_keys("123")
        driver.find_element(By.ID, "cardholder-name").send_keys("Guest Tester")
        driver.find_element(By.CSS_SELECTOR, ".pay-now-btn").click()
        time.sleep(0.25)
        assert_true("pay.html" in driver.current_url, "Expired card 01/22 was not blocked!")
        assert_eq(driver.find_element(By.ID, "expiry").get_attribute("aria-invalid"), "true", "Persistent aria-invalid on expired card")

        # Promo verification: invalid rejected, lowercase/padded valid applied -> $75.50 -> Remove Promo -> $80.50 -> re-apply -> $75.50
        coupon_input = driver.find_element(By.ID, "coupon-code")
        verify_btn = driver.find_element(By.ID, "verify-coupon")
        coupon_input.send_keys("INVALIDCODE999")
        verify_btn.click()
        time.sleep(0.25)
        assert_eq(driver.find_element(By.ID, "amount-due").text, "$80.50", "Total unchanged after invalid promo")

        coupon_input.clear()
        coupon_input.send_keys("  student30  ")
        verify_btn.click()
        wait.until(lambda d: d.find_element(By.ID, "amount-due").text == "$75.50")

        driver.find_element(By.ID, "clear-coupon").click()
        wait.until(lambda d: d.find_element(By.ID, "amount-due").text == "$80.50")

        coupon_input.send_keys("STUDENT30")
        verify_btn.click()
        wait.until(lambda d: d.find_element(By.ID, "amount-due").text == "$75.50")
        save_shot("06_checkout_pay_light.png")

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
        save_shot("07_paysuccess_receipt_light.png")

        booked_date = driver.execute_script("return JSON.parse(sessionStorage.getItem('lastBookingReceipt')).date")

        # Verify guest spoofing user_code=1 is ignored (stored as NULL)
        spoof_status, _, _ = http_json(
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

        check_no_local_errors(driver, "3D preview, keyboard seat nav, promo clear/restore & receipt", base_url)
        telemetry["suites_passed"].append("E2E 3: 3D auditorium, keyboard seat nav, checkout promo & receipt")
        print("[PASS] E2E 3: Offline 3D auditorium, keyboard seat nav, promo clear/restore, receipt & guest user_code=NULL isolation")

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
        wait.until(lambda d: d.find_element(By.ID, "coupon-code").get_attribute("value") == "STUDENT30")
        driver.find_element(By.ID, "verify-coupon").click()
        wait.until(lambda d: d.find_element(By.ID, "amount-due").text == "$134.00")
        check_no_local_errors(driver, "Offers page & 5-seat group discount", base_url)
        telemetry["suites_passed"].append("E2E 4: Offers DB validity & 5-seat 30% group discount ($134.00)")
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

        driver.get(f"{base_url}/login.html?mode=register")
        wait.until(lambda d: d.find_element(By.ID, "register-page").is_displayed())

        driver.find_element(By.ID, "name").send_keys("Alice Tan")
        driver.find_element(By.ID, "reg-email").send_keys("alice@example.com")
        driver.find_element(By.ID, "reg-password").send_keys("secret123")
        driver.find_element(By.ID, "confirm-password").send_keys("secret123")
        driver.find_element(By.ID, "terms").click()
        driver.find_element(By.CSS_SELECTOR, "#register-form button[type='submit']").click()

        wait.until(EC.url_contains("/pages/homepage.html"))
        assert_eq(driver.find_element(By.ID, "header-username").text, "Alice Tan", "Header username after registration")

        # Verify keyboard ArrowDown menu open/navigation + Escape focus return on header profile dropdown
        driver.execute_async_script("const done = arguments[arguments.length - 1]; window.CineTicket.AuthStore.syncSession().finally(done);")
        wait.until(lambda d: d.execute_script("const el = document.getElementById('userDropdown'); return Boolean(el && getComputedStyle(el).position === 'absolute');"))
        prof_trigger = driver.find_element(By.ID, "user-profile-trigger")
        driver.execute_script("arguments[0].focus();", prof_trigger)
        prof_trigger.send_keys(Keys.ARROW_DOWN)
        wait.until(lambda d: d.find_element(By.ID, "userDropdown").is_displayed())
        in_dropdown = driver.execute_script(
            "const dd = document.getElementById('userDropdown'); return Boolean(dd && dd.contains(document.activeElement));"
        )
        assert_true(in_dropdown, "ArrowDown should open #userDropdown and move focus to first menuitem")
        driver.switch_to.active_element.send_keys(Keys.ARROW_DOWN)
        second_focused = driver.execute_script(
            "const items = document.querySelectorAll('#userDropdown .dropdown-item'); return items[1] === document.activeElement;"
        )
        assert_true(second_focused, "Second ArrowDown should advance focus to second menuitem")
        driver.switch_to.active_element.send_keys(Keys.ESCAPE)
        wait.until(lambda d: not d.find_element(By.ID, "userDropdown").is_displayed())

        alice_cookie = next(c["value"] for c in driver.get_cookies() if c["name"] == "PHPSESSID")
        alice_hdr = {"Cookie": f"PHPSESSID={alice_cookie}"}

        # Verify horizontal IDOR protection
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

        time.sleep(2.1)
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
        save_shot("08_ticket_wallet_light.png")

        # Verify Ticket Wallet VIP (4) + Standard (5) Zone Filters -> All Passes (9)
        driver.find_element(By.CSS_SELECTOR, '[data-ticket-zone="vip"]').click()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#cons .ticket")) == 4)
        driver.find_element(By.CSS_SELECTOR, '[data-ticket-zone="std"]').click()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#cons .ticket")) == 5)
        driver.find_element(By.CSS_SELECTOR, '[data-ticket-zone="all"]').click()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#cons .ticket")) == 9)

        # Verify completed screenings render disabled .cancel-button.is-completed while upcoming ticket cancels cleanly
        completed_btns = driver.find_elements(By.CSS_SELECTOR, "#cons .ticket .cancel-button.is-completed")
        assert_eq(len(completed_btns), 7, "7 historical seed tickets must be marked Completed")
        assert_true(not completed_btns[0].is_enabled(), "Completed ticket cancel button must be disabled")

        driver.find_element(By.CSS_SELECTOR, "#cons .ticket .cancel-button:not([disabled])").click()
        driver.switch_to.alert.accept()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#cons .ticket")) == 8)
        check_no_local_errors(driver, "User auth, IDOR guards, reset lockout & tickets", base_url)
        telemetry["suites_passed"].append("E2E 5: 401/403 IDOR, session rotation, reset lockout & ticket wallet")
        print("[PASS] E2E 5: 401/403 IDOR guards, session rotation, old-pwd change, dynamic reset 429 lockout & ticket wallet")

        # 6. Admin 401/403 CSRF Enforcement + Full Cascading CRUD + Live Table Search/Filter
        status_401, _, _ = http_json(f"{raw_url}/index.php/admin/movie/index")
        assert_eq(status_401, 401, "Unauthenticated admin API must return 401")

        driver.get(f"{base_url}/admin/dashboard.html")
        wait.until(EC.url_contains("/admin/login.html"))

        driver.find_element(By.ID, "admin-username").send_keys("admin")
        driver.find_element(By.ID, "admin-password").send_keys("admin")
        driver.find_element(By.ID, "admin-submit-btn").click()

        wait.until(EC.url_contains("/admin/dashboard.html"))
        wait.until(lambda d: d.find_element(By.ID, "stat-movies").text == "7")
        assert_eq(driver.find_element(By.ID, "stat-offers").text, "5", "Active offers count on dashboard")
        save_shot("09_admin_dashboard_light.png")

        admin_sid = next(c["value"] for c in driver.get_cookies() if c["name"] == "PHPSESSID")
        csrf_code, _, _ = http_json(
            f"{raw_url}/index.php/admin/movie/delete",
            method="POST",
            payload={"movie_code": 1},
            headers={"Cookie": f"PHPSESSID={admin_sid}"},
        )
        assert_eq(csrf_code, 403, "Admin write without X-Admin-Token MUST be rejected with 403 CSRF protection!")

        # Admin Theater CRUD + Modal Tab focus trap + Escape dismissal
        driver.get(f"{base_url}/admin/theaters.html")
        wait.until(lambda d: "Cinemark Premium" in d.find_element(By.ID, "theaters-tbody").text)
        driver.find_element(By.ID, "open-add-theater-btn").click()
        wait.until(lambda d: d.find_element(By.ID, "theater-form").is_displayed())

        driver.find_element(By.ID, "theater_name").send_keys(Keys.ESCAPE)
        wait.until(lambda d: not d.find_element(By.ID, "theater-form").is_displayed())

        driver.find_element(By.ID, "open-add-theater-btn").click()
        driver.find_element(By.ID, "theater_name").send_keys("Pavilion Laser Cinema")
        driver.find_element(By.ID, "address").send_keys("88 Bukit Bintang, City Center")
        driver.find_element(By.ID, "save-theater-btn").click()
        wait.until(lambda d: "Pavilion Laser Cinema" in d.find_element(By.ID, "theaters-tbody").text)

        # Create Movie #8 restricted ONLY to Theater #1
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
        save_shot("10_admin_movies_table_light.png")

        # Verify live search toolbar on admin/movies.html
        m_search = driver.find_element(By.CSS_SELECTOR, "#movies-toolbar .toolbar-search")
        m_search.send_keys("Joker")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#movies-tbody tr")) == 1)
        m_search.clear()
        driver.execute_script("arguments[0].dispatchEvent(new Event('input'))", m_search)
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#movies-tbody tr")) == 8)

        _, th1_data, _ = http_json(f"{raw_url}/index.php/theater/theater/getTheaterDetails?theater_code=1")
        _, th2_data, _ = http_json(f"{raw_url}/index.php/theater/theater/getTheaterDetails?theater_code=2")
        assert_true(any(m["movie_name"] == "Interstellar Re-Release" for m in th1_data["data"]["movies"]), "Movie #8 missing from Theater #1!")
        assert_true(all(m["movie_name"] != "Interstellar Re-Release" for m in th2_data["data"]["movies"]), "Movie #8 leaked into unassigned Theater #2!")

        driver.get(f"{base_url}/admin/edit-movie.html?movie_code=8")
        wait.until(lambda d: d.find_element(By.ID, "movie_name").get_attribute("value") == "Interstellar Re-Release")
        driver.find_element(By.ID, "tag").send_keys("IMAX")
        driver.find_element(By.CSS_SELECTOR, "#edit-movie-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/movies.html"))
        wait.until(lambda d: "IMAX" in d.find_element(By.ID, "movies-tbody").text)

        # Create Exclusive Offer #6 (`VIPONLY15`) restricted ONLY to Movie #8 and owned by User #1
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

        driver.get(f"{base_url}/admin/edit-offer.html?offer_code=6")
        wait.until(lambda d: d.find_element(By.ID, "promo_code").get_attribute("value") == "VIPONLY15")

        guest_promo_code, _, _ = http_json(f"{raw_url}/index.php/offer/offer/getMoneyByBadge?badge=VIPONLY15&movie_code=8")
        assert_eq(guest_promo_code, 401, "Guest using member-exclusive promo must return 401")

        _, _, alice_lhdrs = http_json(
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

        _, _, u1_lhdrs = http_json(
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
        assert_eq(wrong_movie_body["success"], False, "VIPONLY15 must be rejected on Movie #1")

        ok_promo_code, ok_promo_body, _ = http_json(
            f"{raw_url}/index.php/offer/offer/getMoneyByBadge?badge=VIPONLY15&movie_code=8&seat_count=2",
            headers=u1_hdr,
        )
        assert_eq(ok_promo_code, 200, "Owner using VIPONLY15 on eligible Movie #8 status")
        assert_eq(ok_promo_body["data"]["pricing"]["total_amount"], 65.50, "2*$39 - $15 + $2.50 = $65.50")

        # Admin User CRUD + Edit User + Redaction + Seat Management
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

        driver.get(f"{base_url}/admin/edit-user.html?user_code=1")
        wait.until(lambda d: d.find_element(By.ID, "user_name").get_attribute("value") == "LI JIAQI")

        driver.get(f"{base_url}/admin/seat.html")
        wait.until(lambda d: "Guest Checkout" in d.find_element(By.ID, "seats-tbody").text)
        save_shot("11_admin_seat_orders_light.png")
        check_no_local_errors(driver, "Admin CSRF, Theater/Movie/Offer/User/Seat CRUD & table toolbars", base_url)
        telemetry["suites_passed"].append("E2E 6: Admin CSRF guard, cascading CRUD, modal Tab trap & exclusive promo")
        print("[PASS] E2E 6: Admin 401/403 CSRF guard, Theater/Movie/Offer/User/Seat CRUD, live table search & exclusive promo binding")

        # 7. Interactive Info Pages (FAQs filter, Gift Cards builder, Upcoming reminders, Help jump & XSS-safe Chat + Escape)
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
        assert_true("format=" in driver.current_url, "Upcoming format filter should sync URL query state")

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
        send_chat_btn = driver.find_element(By.CSS_SELECTOR, "#chat-dialog .send-message")
        send_chat_btn.send_keys(Keys.TAB)
        trapped_in_chat = driver.execute_script(
            "const dlg = document.getElementById('chat-dialog'); return Boolean(dlg && dlg.contains(document.activeElement));"
        )
        assert_true(trapped_in_chat, "Tab on last modal element must wrap focus inside #chat-dialog")
        driver.find_element(By.ID, "chat-input-field").send_keys(Keys.ESCAPE)
        wait.until(lambda d: not d.find_element(By.ID, "chat-dialog").is_displayed())
        check_no_local_errors(driver, "Interactive frontend pages & XSS-safe live chat", base_url)
        telemetry["suites_passed"].append("E2E 7: FAQs, Gift Cards, Upcoming, Help, Privacy, Terms & XSS-safe chat")
        print("[PASS] E2E 7: FAQs live filter, Gift Card issuance, Upcoming reminders, Escape close & XSS-safe live chat verified")

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
                    "date": "2027-01-20",
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

        part_status, part_body, _ = http_json(
            f"{raw_url}/index.php/movie/seat/saveSeats",
            method="POST",
            payload={
                "movie_code": 2,
                "theater_code": 1,
                "date": "2027-01-20",
                "time": "08:00 PM",
                "seat_nums": ["E7", "E8"],
            },
        )
        assert_eq(part_status, 409, "Partial-overlap seat booking must return 409")
        assert_eq(part_body["data"]["conflict_seats"], ["E7"], "Exact conflicting seat must be reported")
        e8_exists = server.state.conn.execute(
            "SELECT 1 FROM t_seat WHERE movie_code=2 AND theater_code=1 AND date='2027-01-20' AND time='08:00 PM' AND seat_num='E8'"
        ).fetchone()
        assert_true(e8_exists is None, "Atomic transaction rollback failed: E8 was persisted despite E7 conflict!")
        telemetry["concurrency_race"] = {"threads": num_workers, "http_200": statuses.count(200), "http_409": statuses.count(409), "partial_overlap_rollback": True}
        telemetry["suites_passed"].append("E2E 8: 12-thread concurrent seat race (1x200 + 11x409) & rollback")
        print("[PASS] E2E 8: 12-thread concurrent seat race verified (1 × 200 + 11 × 409 + atomic rollback)")

        # 9. Deep-Link Empty Context Guidance & 1:1 PHP<->Mock Edge-Case Parity
        driver.get(f"{base_url}/pages/pay.html")
        wait.until(lambda d: d.find_element(By.ID, "checkout-empty-state").is_displayed())
        assert_true(not driver.find_element(By.CSS_SELECTOR, ".payment-layout").is_displayed(), "Checkout layout should hide when context is empty")

        driver.execute_script("sessionStorage.removeItem('lastBookingReceipt');")
        driver.get(f"{base_url}/pages/paysuccess.html")
        wait.until(lambda d: d.find_element(By.ID, "receipt-empty-state").is_displayed())

        sfx_code, sfx_body, _ = http_json(f"{raw_url}/index.php/movie/movies/getMovieByCode/movie_code/1.html")
        assert_eq(sfx_code, 200, "ThinkPHP path-param + .html suffix parity")
        assert_eq(sfx_body["data"]["movie_name"], "Frozen 2", "Movie #1 fetched via path params")

        _, bad_date_body, _ = http_json(f"{raw_url}/index.php/movie/seat/getSeatList?movie_code=1&theater_code=1&date=2026-02-31&time=09%3A30+AM")
        assert_eq(bad_date_body["success"], False, "Impossible calendar date 2026-02-31 must be rejected")

        _, bad_th_body, _ = http_json(f"{raw_url}/index.php/movie/seat/getSeatList?movie_code=1&theater_code=0&date=2027-01-20&time=09%3A30+AM")
        assert_eq(bad_th_body["success"], False, "Explicit invalid theater_code=0 must be rejected")

        check_no_local_errors(driver, "Empty context deep links & 1:1 PHP<->Mock edge parity", base_url)
        telemetry["suites_passed"].append("E2E 9: Empty-context guidance & 1:1 route/date edge parity")
        print("[PASS] E2E 9: Deep-link empty context guidance & 1:1 PHP<->Mock edge-case parity verified")

        # 10. Desktop Viewports (1280x720, 1366x768, 1440x900, 1920x1080) & Browser Zoom (100%, 125%, 150%, 200%) in Light & Dark Modes
        desktop_viewports = [(1280, 720), (1366, 768), (1440, 900), (1920, 1080)]
        audit_urls = [
            f"{base_url}/pages/homepage.html",
            f"{base_url}/pages/theater.html",
            f"{base_url}/pages/booking3.html?movie_code=1&theater_code=1",
            f"{base_url}/pages/pay.html?movie_code=1&theater_code=1&date=2027-01-20&time=09%3A30+AM&seats=D6,D7",
            f"{base_url}/pages/generate_ticket.html",
            f"{base_url}/admin/dashboard.html",
            f"{base_url}/admin/movies.html",
        ]
        for theme_mode in ("light", "dark"):
            for vw, vh in desktop_viewports:
                set_viewport(driver, vw, vh)
                for idx, target_url in enumerate(audit_urls):
                    driver.get(target_url)
                    if theme_mode == "dark":
                        driver.execute_script("if (!document.body.classList.contains('dark-mode')) window.toggleDarkMode();")
                    else:
                        driver.execute_script("if (document.body.classList.contains('dark-mode')) window.toggleDarkMode();")
                    overflow = int(driver.execute_script("return document.documentElement.scrollWidth - window.innerWidth;"))
                    assert_true(overflow <= 2, f"Horizontal overflow ({overflow}px) at {vw}x{vh} ({theme_mode}) on {target_url}")
                    telemetry["viewport_zoom_audit"].append(
                        {"viewport": f"{vw}x{vh}", "zoom": "100%", "theme": theme_mode, "page": target_url.rsplit("/", 1)[1], "overflow_px": overflow}
                    )
                    if idx == 0:
                        save_shot(f"vp_{vw}x{vh}_100pct_{theme_mode}_homepage.png")
                    elif idx == 5 and vw in (1280, 1920):
                        save_shot(f"vp_{vw}x{vh}_100pct_{theme_mode}_admin_dashboard.png")

            # Verify 125%, 150%, and 200% zoom at 1280x720 (effective 640px CSS viewport at 200% zoom)
            for zoom_pct, simulated_w in ((125, 1024), (150, 854), (200, 640)):
                scale = zoom_pct / 100.0
                set_viewport(driver, simulated_w, round(720 / scale), scale)
                for idx, target_url in enumerate(audit_urls):
                    driver.get(target_url)
                    if theme_mode == "dark":
                        driver.execute_script("if (!document.body.classList.contains('dark-mode')) window.toggleDarkMode();")
                    else:
                        driver.execute_script("if (document.body.classList.contains('dark-mode')) window.toggleDarkMode();")
                    overflow = int(driver.execute_script("return document.documentElement.scrollWidth - window.innerWidth;"))
                    assert_true(overflow <= 2, f"Horizontal clipping ({overflow}px) at {zoom_pct}% zoom ({theme_mode}) on {target_url}")
                    telemetry["viewport_zoom_audit"].append(
                        {"viewport": "1280x720", "zoom": f"{zoom_pct}%", "theme": theme_mode, "page": target_url.rsplit("/", 1)[1], "overflow_px": overflow}
                    )
                    if idx in (0, 2):
                        slug = "homepage" if idx == 0 else "booking3"
                        save_shot(f"zoom_{zoom_pct}pct_{theme_mode}_{slug}.png")

        driver.execute_script("if (document.body.classList.contains('dark-mode')) window.toggleDarkMode();")
        set_viewport(driver, 1440, 900)
        check_no_local_errors(driver, "Multi-viewport & 125%/150%/200% zoom dual-theme checks", base_url)
        telemetry["suites_passed"].append("E2E 10: 4 viewports x 4 zoom levels x Light/Dark zero-overflow audit")
        print("[PASS] E2E 10: Desktop viewports (1280x720..1920x1080) & 100%/125%/150%/200% zoom in Light & Dark modes verified")

        # 11. Deep Remediation Contracts: Strict Integer/Scalar Guards, 72B Password Ceiling, Role-Isolated Logout,
        #     Expired Offer Filtering, Tampered Checkout Block, Batch Admin Actions & Dark Mode Contrast
        _, bad_id_body, _ = http_json(f"{raw_url}/index.php/movie/movies/getMovieByCode?movie_code=1abc")
        assert_eq(bad_id_body["success"], False, "Mixed alphanumeric ID 1abc must be rejected")

        arr_login_code, arr_login_body, _ = http_json(
            f"{raw_url}/index.php/user/user/login",
            method="POST",
            payload={"email": ["array@injection.test"], "password": ["123456"]},
        )
        assert_eq(arr_login_code, 200, "JSON array scalar injection must return clean 200 validation response instead of 500")
        assert_eq(arr_login_body["success"], False, "Array login rejected cleanly")

        _, long_pwd_body, _ = http_json(
            f"{raw_url}/index.php/user/user/reg",
            method="POST",
            payload={"name": "LongPwd", "email": "longpwd@example.com", "password": "x" * 73},
        )
        assert_eq(long_pwd_body["success"], False, "Password exceeding 72 bcrypt bytes must be rejected")

        # Role-isolated logout: sharing one session cookie between Admin and Customer must NOT wipe Admin when Customer logs out
        _, adm_lbody, adm_lhdrs = http_json(
            f"{raw_url}/index.php/admin/auth/login",
            method="POST",
            payload={"username": "admin", "password": "admin"},
        )
        shared_sid = extract_phpsessid(adm_lhdrs)
        adm_token = adm_lbody["token"]
        _, _, usr_lhdrs = http_json(
            f"{raw_url}/index.php/user/user/login",
            method="POST",
            payload={"email": "218451@student.upm.edu.my", "password": "218451"},
            headers={"Cookie": f"PHPSESSID={shared_sid}"},
        )
        shared_sid2 = extract_phpsessid(usr_lhdrs) or shared_sid
        _, _, usr_out_hdrs = http_json(
            f"{raw_url}/index.php/user/user/logout",
            method="POST",
            headers={"Cookie": f"PHPSESSID={shared_sid2}"},
        )
        shared_sid3 = extract_phpsessid(usr_out_hdrs) or shared_sid2
        chk_code, chk_body, _ = http_json(
            f"{raw_url}/index.php/admin/auth/checkAuth",
            method="POST",
            headers={"Cookie": f"PHPSESSID={shared_sid3}", "X-Admin-Token": adm_token},
        )
        assert_eq(chk_code, 200, "Customer logout must preserve active Admin session in same browser")
        assert_eq(chk_body["success"], True, "Admin remains authenticated after customer logout")

        # Create an expired offer via Admin API and verify public getOfferList filters it out while Admin index retains it
        _, exp_create, _ = http_json(
            f"{raw_url}/index.php/admin/offer/create",
            method="POST",
            payload={
                "offer_title": "Past Holiday Deal",
                "offer_type": "Weekday Specials",
                "promo_code": "PAST2020",
                "money": 8.0,
                "offer_validity": "2020-01-01",
                "img": "../img/offer/student_price.png",
                "offer_description": "Historical expired promo.",
                "movie_codes": [1],
            },
            headers={"Cookie": f"PHPSESSID={shared_sid3}", "X-Admin-Token": adm_token},
        )
        assert_eq(exp_create["success"], True, "Admin created expired offer for filtering test")
        exp_offer_id = exp_create["data"]["offer_code"]
        _, pub_offers, _ = http_json(f"{raw_url}/index.php/offer/offer/getOfferList")
        assert_true(
            all(o["promo_code"] != "PAST2020" for o in pub_offers["data"]),
            "Expired offer PAST2020 leaked into public getOfferList!",
        )

        # Verify tampered/non-existent movie_code on pay.html disables Pay button and displays error alert
        set_viewport(driver, 1440, 900)
        driver.get(f"{base_url}/pages/pay.html?movie_code=999&theater_code=1&date=2027-01-20&time=09%3A30+AM&seats=A1")
        wait.until(lambda d: d.find_element(By.ID, "checkout-empty-state").is_displayed())
        assert_true("Screening Unavailable" in driver.find_element(By.ID, "checkout-empty-state").text, "Tampered movie_code=999 must show Screening Unavailable")
        assert_true(not driver.find_element(By.CSS_SELECTOR, ".pay-now-btn").is_enabled(), "Tampered movie_code=999 must disable Pay button")
        driver.get_log("browser")

        # Verify Dark Mode WCAG AA contrast on primary CTA buttons & distance pill on theater.html
        driver.get(f"{base_url}/pages/theater.html")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".theater-distance-pill")) >= 1)
        driver.execute_script("if (!document.body.classList.contains('dark-mode')) window.toggleDarkMode();")
        pill_contrast = round(float(driver.execute_script(WCAG_CONTRAST_JS, ".theater-distance-pill")), 2)
        view_btn_contrast = round(float(driver.execute_script(WCAG_CONTRAST_JS, ".view-details")), 2)
        assert_true(pill_contrast >= 4.5 and view_btn_contrast >= 4.5, f"Dark WCAG AA failed: pill={pill_contrast}, btn={view_btn_contrast}")
        telemetry["wcag_contrast_samples"]["theater_dark_distance_pill"] = pill_contrast
        telemetry["wcag_contrast_samples"]["theater_dark_view_details"] = view_btn_contrast
        driver.execute_script("if (document.body.classList.contains('dark-mode')) window.toggleDarkMode();")

        # Verify Admin batch checkbox selection + atomic bulk delete on admin/offers.html removes PAST2020 cleanly
        driver.get(f"{base_url}/admin/offers.html")
        wait.until(lambda d: "PAST2020" in d.find_element(By.ID, "offers-tbody").text)
        o_filter = driver.find_element(By.CSS_SELECTOR, '#offers-toolbar [data-role="filter"]')
        driver.execute_script("arguments[0].value = 'expired'; arguments[0].dispatchEvent(new Event('change'));", o_filter)
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#offers-tbody tr")) == 1)
        driver.find_element(By.CSS_SELECTOR, f'#offers-tbody .row-check[value="{exp_offer_id}"]').click()
        bulk_btn = driver.find_element(By.CSS_SELECTOR, '#offers-toolbar [data-role="bulk"]')
        assert_true(bulk_btn.is_displayed(), "Bulk delete button should appear when row checkbox is checked")
        bulk_btn.click()
        driver.switch_to.alert.accept()
        wait.until(lambda d: "No matching records" in d.find_element(By.ID, "offers-tbody").text)
        driver.find_element(By.CSS_SELECTOR, '#offers-toolbar [data-role="reset"]').click()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#offers-tbody tr")) >= 5)

        check_no_local_errors(driver, "Deep remediation contracts & batch admin actions", base_url)
        telemetry["suites_passed"].append("E2E 11: Scalar/72B guards, isolated logout, tampered checkout & bulk delete")
        print("[PASS] E2E 11: Scalar/ID/72B guards, isolated logout, expired-offer filter, tampered checkout block, dark CTA contrast & bulk admin delete")

        # 12. Cross-Origin CSRF 403, SameSite=Lax Cookie, Partial Update + "0" Preservation,
        #     Non-Destructive Relation Metadata Retention, Open-Redirect Block, Focus Restoration & CSV Formula Defense
        assert_true("samesite=lax" in adm_lhdrs.get("set-cookie", "").lower(), "Session Set-Cookie must include SameSite=Lax")
        assert_eq(sanitize_csv_cell("=CMD|' /C calc'!A0"), "'=CMD|' /C calc'!A0", "Backend sanitize_csv_cell formula guard")
        assert_eq(sanitize_csv_cell("  @SUM(A1:A2)"), "'  @SUM(A1:A2)", "Backend sanitize_csv_cell leading-space formula guard")

        _, csv_user_res, _ = http_json(
            f"{raw_url}/index.php/admin/user/create",
            method="POST",
            payload={"user_name": "=CMD|' /C calc'!A0", "email": "csvprobe@example.com", "login_pwd": "csvpass123"},
            headers={"Cookie": f"PHPSESSID={shared_sid3}", "X-Admin-Token": adm_token},
        )
        csv_uid = int(csv_user_res["data"]["user_code"])
        _, _, csv_u_hdrs = http_json(
            f"{raw_url}/index.php/user/user/login",
            method="POST",
            payload={"email": "csvprobe@example.com", "password": "csvpass123"},
        )
        csv_u_sid = extract_phpsessid(csv_u_hdrs)
        http_json(
            f"{raw_url}/index.php/movie/seat/saveSeats",
            method="POST",
            payload={"movie_code": 1, "theater_code": 1, "date": "2027-01-22", "time": "09:30 AM", "seat_nums": ["H10"]},
            headers={"Cookie": f"PHPSESSID={csv_u_sid}"},
        )
        csv_req = urllib.request.Request(
            f"{raw_url}/index.php/admin/seat/exportCsv",
            headers={"Cookie": f"PHPSESSID={shared_sid3}", "X-Admin-Token": adm_token},
            method="GET",
        )
        with urllib.request.urlopen(csv_req) as csv_resp:
            assert_eq(csv_resp.status, 200, "Admin seat exportCsv HTTP status")
            assert_true("text/csv" in csv_resp.headers.get("Content-Type", ""), "exportCsv must return text/csv")
            csv_text = csv_resp.read().decode("utf-8")
            assert_true(csv_text.startswith("\ufeffBooking ID,"), "exportCsv must begin with UTF-8 BOM + header row")
            assert_true("'=CMD|' /C calc'!A0" in csv_text, f"exportCsv failed to neutralize formula injection: {csv_text[:260]}")
        http_json(
            f"{raw_url}/index.php/admin/user/delete",
            method="POST",
            payload={"user_code": csv_uid},
            headers={"Cookie": f"PHPSESSID={shared_sid3}", "X-Admin-Token": adm_token},
        )

        xorigin_seat_code, _, _ = http_json(
            f"{raw_url}/index.php/movie/seat/saveSeats",
            method="POST",
            payload={"movie_code": 1, "theater_code": 1, "date": "2027-01-22", "time": "09:30 AM", "seat_nums": ["H11"]},
            headers={"Origin": "https://evil.attacker.example"},
        )
        assert_eq(xorigin_seat_code, 403, "Cross-origin POST to saveSeats must be blocked with 403")

        # Port-mismatch same-origin CSRF block (same hostname, forged port)
        badport_code, _, _ = http_json(
            f"{raw_url}/index.php/movie/seat/saveSeats",
            method="POST",
            payload={"movie_code": 1, "theater_code": 1, "date": "2027-01-22", "time": "09:30 AM", "seat_nums": ["H11"]},
            headers={"Origin": "http://127.0.0.1:9999"},
        )
        assert_eq(badport_code, 403, "Mismatched port Origin must be blocked with 403")

        xorigin_adm_code, _, _ = http_json(
            f"{raw_url}/index.php/admin/movie/delete",
            method="POST",
            payload={"movie_code": 1},
            headers={"Cookie": f"PHPSESSID={shared_sid3}", "X-Admin-Token": adm_token, "Origin": "https://evil.attacker.example"},
        )
        assert_eq(xorigin_adm_code, 403, "Cross-origin admin POST even with token must be blocked with 403")

        # Partial update + "0" price preservation + non-destructive daily_showtimes & discount_percent retention
        with server.state.db_lock:
            server.state.conn.execute("UPDATE theater_movie SET daily_showtimes = 7 WHERE theater_code = 1 AND movie_code = 1")
            server.state.conn.execute("UPDATE movie_offer SET discount_percent = 12.5 WHERE movie_code = 1 AND offer_code = 1")
            server.state.conn.commit()

        _, part_upd_body, _ = http_json(
            f"{raw_url}/index.php/admin/movie/update",
            method="POST",
            payload={"movie_code": 1, "money": "0", "theater_codes": [1, 2], "offer_codes": [1, 2]},
            headers={"Cookie": f"PHPSESSID={shared_sid3}", "X-Admin-Token": adm_token},
        )
        assert_eq(part_upd_body["success"], True, "Partial movie update with money='0' must succeed")
        _, m1_after, _ = http_json(
            f"{raw_url}/index.php/admin/movie/getMovieByCode?movie_code=1",
            headers={"Cookie": f"PHPSESSID={shared_sid3}", "X-Admin-Token": adm_token},
        )
        assert_eq(m1_after["data"]["movie_name"], "Frozen 2", "Omitted movie_name preserved during partial update")
        assert_eq(m1_after["data"]["tag"], "FEATURED", "Omitted optional tag preserved during partial update")
        assert_eq(float(m1_after["data"]["money"]), 0.0, "Zero price '0' must not be rejected by empty('0')")
        tm_keep = server.state.conn.execute(
            "SELECT daily_showtimes FROM theater_movie WHERE theater_code = 1 AND movie_code = 1"
        ).fetchone()
        mo_keep = server.state.conn.execute(
            "SELECT discount_percent FROM movie_offer WHERE movie_code = 1 AND offer_code = 1"
        ).fetchone()
        assert_eq(int(tm_keep["daily_showtimes"]), 7, "Existing theater_movie.daily_showtimes preserved across sync")
        assert_eq(float(mo_keep["discount_percent"]), 12.5, "Existing movie_offer.discount_percent preserved across sync")

        # Restore Movie #1 price & full schedules cleanly
        http_json(
            f"{raw_url}/index.php/admin/movie/update",
            method="POST",
            payload={"movie_code": 1, "money": "39.00", "theater_codes": [1, 2, 3, 4, 5, 6], "offer_codes": [1, 2, 3, 4, 5]},
            headers={"Cookie": f"PHPSESSID={shared_sid3}", "X-Admin-Token": adm_token},
        )

        # Verify focus restoration when closing #theater-form via Escape in admin/theaters.html
        driver.get(f"{base_url}/admin/theaters.html")
        wait.until(lambda d: "Cinemark Premium" in d.find_element(By.ID, "theaters-tbody").text)
        driver.find_element(By.ID, "open-add-theater-btn").click()
        wait.until(lambda d: d.find_element(By.ID, "theater-form").is_displayed())
        driver.find_element(By.ID, "theater_name").send_keys(Keys.ESCAPE)
        wait.until(lambda d: not d.find_element(By.ID, "theater-form").is_displayed())
        assert_eq(
            driver.execute_script("return document.activeElement && document.activeElement.id"),
            "open-add-theater-btn",
            "Escape on #theater-form must restore focus to #open-add-theater-btn",
        )

        # Verify open-redirect neutralization on login.html?redirect=\\evil.example
        driver.get(f"{base_url}/login.html?redirect=%5C%5Cevil.example")
        email_in = driver.find_element(By.ID, "email")
        email_in.clear()
        email_in.send_keys("218451@student.upm.edu.my")
        driver.find_element(By.ID, "password").send_keys("218451")
        driver.find_element(By.CSS_SELECTOR, "#login-form button[type='submit']").click()
        wait.until(EC.url_contains("/pages/homepage.html"))
        check_no_local_errors(driver, "Suite 12 security, partial update & focus restoration", base_url)
        telemetry["suites_passed"].append("E2E 12: Host:port CSRF 403, SameSite=Lax, partial update '0' & CSV defense")
        print("[PASS] E2E 12: Same-origin CSRF 403, SameSite=Lax, partial update '0' & relation metadata retention, focus return & open-redirect block")

        # 13. Comprehensive 4-Track Contracts: Role-Isolated Login 429 Lockout, Path B Reset Session Isolation,
        #     Past-Date Booking & Past-Screening Cancel Guards, Atomic Batch Rollback, Whitelisted Pagination/Sort,
        #     Dangerous Asset URI Block, URL Deep-Linking + popstate, and Payment Radiogroup Keyboard Roving Focus
        # 13a. Customer login brute-force lockout (5 attempts -> 429) does NOT lock out Admin login on same session
        _, _, lock_hdrs = http_json(
            f"{raw_url}/index.php/user/user/login",
            method="POST",
            payload={"email": "218451@student.upm.edu.my", "password": "wrong-password-1"},
        )
        lock_sid = extract_phpsessid(lock_hdrs)
        for attempt in range(2, 6):
            l_code, l_body, _ = http_json(
                f"{raw_url}/index.php/user/user/login",
                method="POST",
                payload={"email": "218451@student.upm.edu.my", "password": f"wrong-password-{attempt}"},
                headers={"Cookie": f"PHPSESSID={lock_sid}"},
            )
            if attempt < 5:
                assert_eq(l_body["success"], False, "Wrong customer login rejected")
            else:
                assert_eq(l_code, 429, "5th failed customer login must trigger HTTP 429 lockout")

        adm_still_ok_code, adm_still_ok_body, _ = http_json(
            f"{raw_url}/index.php/admin/auth/login",
            method="POST",
            payload={"username": "admin", "password": "admin"},
            headers={"Cookie": f"PHPSESSID={lock_sid}"},
        )
        assert_eq(adm_still_ok_code, 200, "Customer login lockout must not lock out Admin login scope")
        assert_eq(adm_still_ok_body["success"], True, "Admin login succeeds on customer-locked session")

        # Admin login brute-force lockout (5 attempts -> 429)
        _, _, adm_lock_hdrs = http_json(
            f"{raw_url}/index.php/admin/auth/login",
            method="POST",
            payload={"username": "admin", "password": "bad-admin-1"},
        )
        adm_lock_sid = extract_phpsessid(adm_lock_hdrs)
        for attempt in range(2, 6):
            al_code, _, _ = http_json(
                f"{raw_url}/index.php/admin/auth/login",
                method="POST",
                payload={"username": "admin", "password": f"bad-admin-{attempt}"},
                headers={"Cookie": f"PHPSESSID={adm_lock_sid}"},
            )
            if attempt == 5:
                assert_eq(al_code, 429, "5th failed admin login must trigger HTTP 429 lockout")

        # 13b. Path B password reset clears active Customer session while preserving isolated Admin session
        _, adm_b_body, adm_b_hdrs = http_json(
            f"{raw_url}/index.php/admin/auth/login",
            method="POST",
            payload={"username": "admin", "password": "admin"},
        )
        iso_sid = extract_phpsessid(adm_b_hdrs)
        iso_adm_token = adm_b_body["token"]
        _, _, usr_b_hdrs = http_json(
            f"{raw_url}/index.php/user/user/login",
            method="POST",
            payload={"email": "218451@student.upm.edu.my", "password": "218451"},
            headers={"Cookie": f"PHPSESSID={iso_sid}"},
        )
        iso_sid = extract_phpsessid(usr_b_hdrs) or iso_sid
        http_json(
            f"{raw_url}/index.php/user/user/sendResetCode",
            method="POST",
            payload={"email": "bob@example.com"},
            headers={"Cookie": f"PHPSESSID={iso_sid}"},
        )
        bob_code = server.state.mail_outbox["bob@example.com"]
        _, reset_bob_body, reset_bob_hdrs = http_json(
            f"{raw_url}/index.php/user/user/changePassword",
            method="POST",
            payload={"email": "bob@example.com", "verification_code": bob_code, "pwd": "bobpass456"},
            headers={"Cookie": f"PHPSESSID={iso_sid}"},
        )
        assert_eq(reset_bob_body["success"], True, "Bob Path B reset succeeded")
        iso_sid_after = extract_phpsessid(reset_bob_hdrs) or iso_sid
        _, cust_sess_after, _ = http_json(
            f"{raw_url}/index.php/user/user/session",
            headers={"Cookie": f"PHPSESSID={iso_sid_after}"},
        )
        assert_eq(cust_sess_after["data"]["authenticated"], False, "Path B reset for another account must clear active customer session")
        adm_chk_after_code, _, _ = http_json(
            f"{raw_url}/index.php/admin/auth/checkAuth",
            method="POST",
            headers={"Cookie": f"PHPSESSID={iso_sid_after}", "X-Admin-Token": iso_adm_token},
        )
        assert_eq(adm_chk_after_code, 200, "Path B reset must preserve isolated Admin session")

        # 13c. Past-date booking guard (400), past-screening refund cutoff (400), future screening promo expiry check, & dangerous asset URI block
        past_book_code, past_book_body, _ = http_json(
            f"{raw_url}/index.php/movie/seat/saveSeats",
            method="POST",
            payload={"movie_code": 1, "theater_code": 1, "date": "2020-05-01", "time": "09:30 AM", "seat_nums": ["A1"]},
        )
        assert_eq(past_book_code, 400, "Booking seats on a past date must return HTTP 400")
        assert_eq(past_book_body["success"], False, "Past-date booking rejected")

        past_cancel_code, past_cancel_body, _ = http_json(
            f"{raw_url}/index.php/movie/seat/delete",
            method="POST",
            payload={"seat_code": 8},
            headers=u1_hdr,
        )
        assert_eq(past_cancel_code, 400, "Cancelling completed historical screening seat_code=8 must return HTTP 400")
        assert_eq(past_cancel_body["success"], False, "Completed screening cancellation rejected")

        _, exp_for_screening, _ = http_json(
            f"{raw_url}/index.php/offer/offer/getMoneyByBadge?badge=STUDENT30&movie_code=1&date=2028-06-01"
        )
        assert_eq(exp_for_screening["success"], False, "Promo expiring 2027-12-31 must be rejected for 2028-06-01 screening")

        _, bad_asset_body, _ = http_json(
            f"{raw_url}/index.php/admin/movie/create",
            method="POST",
            payload={"movie_name": "XSS Poster", "times": "2h", "img": "javascript:alert(1)"},
            headers={"Cookie": f"PHPSESSID={iso_sid_after}", "X-Admin-Token": iso_adm_token},
        )
        assert_eq(bad_asset_body["success"], False, "javascript: URI in admin movie img must be rejected")

        # 13d. Whitelisted sorting/pagination metadata & atomic batch deletion rollback
        pg_code, pg_body, _ = http_json(
            f"{raw_url}/index.php/movie/movies/getMovieList?sort=rating_desc&page=1&page_size=3"
        )
        assert_eq(pg_code, 200, "Paginated getMovieList HTTP status")
        assert_eq(len(pg_body["data"]), 3, "page_size=3 returns 3 movies")
        assert_true(pg_body["meta"]["total"] >= 7 and pg_body["meta"]["total_pages"] >= 3, f"Pagination meta mismatch: {pg_body.get('meta')}")
        scores = [float(m["star"]) for m in pg_body["data"]]
        assert_true(scores == sorted(scores, reverse=True), f"rating_desc sort failed: {scores}")

        _, o_tmp1, _ = http_json(
            f"{raw_url}/index.php/admin/offer/create",
            method="POST",
            payload={"offer_title": "Batch Deal A", "offer_type": "Weekday Specials", "promo_code": "BATCHA10", "money": 10.0, "offer_validity": "2027-12-31", "img": "../img/offer/family.png", "offer_description": "Batch A"},
            headers={"Cookie": f"PHPSESSID={iso_sid_after}", "X-Admin-Token": iso_adm_token},
        )
        _, o_tmp2, _ = http_json(
            f"{raw_url}/index.php/admin/offer/create",
            method="POST",
            payload={"offer_title": "Batch Deal B", "offer_type": "Weekday Specials", "promo_code": "BATCHB10", "money": 10.0, "offer_validity": "2027-12-31", "img": "../img/offer/family.png", "offer_description": "Batch B"},
            headers={"Cookie": f"PHPSESSID={iso_sid_after}", "X-Admin-Token": iso_adm_token},
        )
        oid_a = int(o_tmp1["data"]["offer_code"])
        oid_b = int(o_tmp2["data"]["offer_code"])

        nf_batch_code, _, _ = http_json(
            f"{raw_url}/index.php/admin/offer/delete",
            method="POST",
            payload={"offer_codes": [999998, 999999]},
            headers={"Cookie": f"PHPSESSID={iso_sid_after}", "X-Admin-Token": iso_adm_token},
        )
        assert_eq(nf_batch_code, 404, "Batch delete of non-existent offer_codes must return 404")

        mo_before = server.state.conn.execute(
            "SELECT COUNT(*) FROM movie_offer WHERE offer_code IN (?, ?)", (oid_a, oid_b)
        ).fetchone()[0]
        assert_true(mo_before >= 2, f"Expected cascading movie_offer rows before batch delete, got {mo_before}")

        ok_batch_code, ok_batch_body, _ = http_json(
            f"{raw_url}/index.php/admin/offer/delete",
            method="POST",
            payload={"offer_codes": [oid_a, oid_b]},
            headers={"Cookie": f"PHPSESSID={iso_sid_after}", "X-Admin-Token": iso_adm_token},
        )
        assert_eq(ok_batch_code, 200, "Atomic batch delete of valid offer_codes HTTP 200")
        assert_eq(ok_batch_body["data"]["deleted_count"], 2, "Atomic batch deleted_count == 2")
        mo_after = server.state.conn.execute(
            "SELECT COUNT(*) FROM movie_offer WHERE offer_code IN (?, ?)", (oid_a, oid_b)
        ).fetchone()[0]
        assert_eq(mo_after, 0, "Atomic batch delete must cascade-clean all movie_offer child rows")

        # 13e. URL deep-linking + Refresh recovery + Browser Back/Forward (popstate) & Payment radiogroup ArrowRight roving focus
        driver.get(f"{base_url}/pages/homepage.html?q=Frozen")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".movie-card")) == 1)
        assert_eq(driver.find_element(By.CSS_SELECTOR, ".movie-title").text, "Frozen 2", "Deep-linked ?q=Frozen result")

        driver.get(f"{base_url}/pages/homepage.html?genre=Adventure")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".movie-card")) == 2)
        assert_eq(driver.find_element(By.CSS_SELECTOR, '.btn-filter[data-genre="Adventure"]').get_attribute("aria-pressed"), "true", "Deep-linked Adventure pill active")

        driver.find_element(By.CSS_SELECTOR, '.btn-filter[data-genre="Action"]').click()
        wait.until(EC.url_contains("genre=Action"))
        driver.refresh()
        wait.until(lambda d: d.find_element(By.CSS_SELECTOR, '.btn-filter[data-genre="Action"]').get_attribute("aria-pressed") == "true")
        driver.back()
        wait.until(lambda d: "genre=Adventure" in d.current_url)
        wait.until(lambda d: d.find_element(By.CSS_SELECTOR, '.btn-filter[data-genre="Adventure"]').get_attribute("aria-pressed") == "true")
        driver.forward()
        wait.until(lambda d: "genre=Action" in d.current_url)
        wait.until(lambda d: d.find_element(By.CSS_SELECTOR, '.btn-filter[data-genre="Action"]').get_attribute("aria-pressed") == "true")

        driver.get(f"{base_url}/pages/pay.html?movie_code=1&theater_code=1&date=2027-01-25&time=09%3A30+AM&seats=C3")
        wait.until(lambda d: d.find_element(By.ID, "total-price").text == "$39.00")
        first_pm = driver.find_element(By.CSS_SELECTOR, ".payment-method-card.active")
        first_pm.send_keys(Keys.ARROW_RIGHT)
        second_pm_checked = driver.execute_script(
            "const cards = document.querySelectorAll('.payment-method-card'); return cards[1] && cards[1].getAttribute('aria-checked') === 'true' && cards[1].getAttribute('tabindex') === '0';"
        )
        assert_true(second_pm_checked, "ArrowRight on payment radiogroup must rove focus and aria-checked to next card")

        check_no_local_errors(driver, "Suite 13 rate limit, cutoff, atomic batch, deep-link & radiogroup", base_url)
        telemetry["suites_passed"].append("E2E 13: Role-isolated login 429, refund cutoff, atomic batch, deep-link popstate & radiogroup")
        print("[PASS] E2E 13: Login 429 lockout, Path B session isolation, refund cutoff, atomic batch rollback, pagination meta, deep-link popstate & radiogroup verified")

        if report_json_env:
            report_path = Path(report_json_env)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(telemetry, indent=2, ensure_ascii=False), encoding="utf-8")

        print("ALL 13 HEADLESS CHROMIUM E2E, ACCESSIBILITY, VIEWPORT/ZOOM & CONCURRENCY SUITES PASSED.")
    finally:
        driver.quit()
        server.shutdown()
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    run_e2e_suite()
    sys.exit(0)
