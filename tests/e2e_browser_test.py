#!/usr/bin/env python3
"""
End-to-End Headless Chromium Browser & Security/Concurrency Verification Suite (Selenium WebDriver).
Tests all customer and administrator journeys, IDOR & CSRF boundaries, OTP password reset security,
cross-movie promo validation (`movie_offer`), `theater_movie` scheduling & cascade deletion,
true multithreaded concurrent seat booking (409 guard), keyboard accessibility, and desktop UI pages.
"""

from __future__ import annotations

import http.cookiejar
import json
import sys
import threading
import time
import urllib.error
import urllib.request

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
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
        if any(code in message for code in ("status of 401", "status of 403", "status of 404", "status of 409")):
            continue
        severe_local.append(message)
    assert_true(len(severe_local) == 0, f"Browser console errors in {context}: {severe_local}")


class ApiSessionClient:
    def __init__(self, raw_url: str) -> None:
        self.raw_url = raw_url
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request_json(self, path: str, method: str = "GET", payload: dict | None = None, headers: dict | None = None) -> tuple[int, dict]:
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        hdrs = {"Content-Type": "application/json"}
        if headers:
            hdrs.update(headers)
        req = urllib.request.Request(f"{self.raw_url}{path}", data=data, headers=hdrs, method=method)
        try:
            with self.opener.open(req) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read().decode("utf-8"))

    def phpsessid(self) -> str:
        for c in self.jar:
            if c.name == "PHPSESSID":
                return c.value
        return ""


def http_json(url: str, method: str = "GET", payload: dict | None = None, headers: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url.replace("cinetix.local", "127.0.0.1"), data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read().decode("utf-8"))


def run_e2e_suite() -> None:
    server, raw_url = start_background_server()
    port = raw_url.rsplit(":", 1)[1]
    base_url = f"http://cinetix.local:{port}"
    print(f"Started contract server at {base_url}")

    options = Options()
    options.page_load_strategy = "eager"
    options.binary_location = "/usr/bin/chromium"
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1440,960")
    options.add_argument("--host-resolver-rules=MAP cinetix.local 127.0.0.1, MAP * ~NOTFOUND")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver = webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)
    wait = WebDriverWait(driver, 8)

    try:
        # 1. Entry redirect + Movie Catalog + Genre Filter + Search + Reversible Dark Mode
        driver.get(f"{base_url}/index.html")
        wait.until(EC.url_contains("/pages/homepage.html"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".movie-card")) == 7)
        assert_true(
            driver.execute_script("return Boolean(document.querySelector('link[rel=\"icon\"]'))"),
            "Favicon link was not mounted",
        )

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
        print("[PASS] E2E 1: Root redirect, favicon, 7-movie catalog, genre filter, search & reversible dark mode")

        # 2. Theaters Directory -> Search by Name -> Theater Details -> Live Now Showing -> Seat Booking
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

        # 3. Guest Seat Selection (Keyboard + Click) + Expired Card Guard + Promo Code + Checkout + 409 Guard
        driver.find_element(By.CSS_SELECTOR, "#movies-list .movie-card a").click()
        wait.until(EC.url_contains("booking3.html?movie_code=1&theater_code=2"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".seat[data-seat]")) == 96)

        seat_f2 = driver.find_element(By.CSS_SELECTOR, '.seat[data-seat="F2"]')
        seat_f2.send_keys(Keys.ENTER)
        driver.find_element(By.CSS_SELECTOR, '.seat[data-seat="F3"]').click()
        assert_eq(driver.find_element(By.ID, "summary-count").text, "2", "Selected seat count via keyboard+click")
        driver.find_element(By.CSS_SELECTOR, ".proceed-button").click()

        wait.until(EC.url_contains("pay.html"))
        wait.until(lambda d: driver.find_element(By.ID, "total-price").text == "$78.00")

        # Verify expired credit card is blocked on checkout
        driver.find_element(By.ID, "card-number").send_keys("4111111111111111")
        driver.find_element(By.ID, "expiry").send_keys("0120")
        driver.find_element(By.ID, "cvv").send_keys("123")
        driver.find_element(By.ID, "cardholder-name").send_keys("Guest Tester")
        driver.find_element(By.CSS_SELECTOR, ".pay-now-btn").click()
        time.sleep(0.15)
        assert_true("pay.html" in driver.current_url, "Expired card 01/20 should be rejected")

        coupon_input = driver.find_element(By.ID, "coupon-code")
        verify_btn = driver.find_element(By.ID, "verify-coupon")
        coupon_input.send_keys("INVALIDCODE999")
        verify_btn.click()
        time.sleep(0.2)
        assert_eq(driver.find_element(By.ID, "amount-due").text, "$80.50", "Total unchanged after invalid promo")

        coupon_input.clear()
        coupon_input.send_keys("STUDENT30")
        verify_btn.click()
        wait.until(lambda d: driver.find_element(By.ID, "amount-due").text == "$75.50")

        driver.find_element(By.CSS_SELECTOR, '.payment-method-card[data-method="paypal"]').click()
        driver.find_element(By.CSS_SELECTOR, ".pay-now-btn").click()

        wait.until(EC.url_contains("paysuccess.html"))
        wait.until(lambda d: d.find_element(By.CSS_SELECTOR, ".payment-success").is_displayed())
        conf_text = driver.find_element(By.CSS_SELECTOR, ".confirmation-details").text
        assert_true("Frozen 2" in conf_text and "F2, F3" in conf_text and "$75.50" in conf_text, f"Receipt mismatch: {conf_text}")

        booked_date = driver.execute_script("return JSON.parse(sessionStorage.getItem('lastBookingReceipt')).date")
        code_409, conflict_body = http_json(
            f"{raw_url}/index.php/movie/seat/saveSeats",
            method="POST",
            payload={"movie_code": 1, "theater_code": 2, "date": booked_date, "time": "09:30 AM", "seat_nums": ["F2"]},
        )
        assert_eq(code_409, 409, "Double-booked seat HTTP status")
        assert_eq(conflict_body["success"], False, "Double-booked seat rejected")
        check_no_local_errors(driver, "Guest booking, promo code, receipt & conflict guard", base_url)
        print("[PASS] E2E 3: Keyboard+click seat booking, expired card guard, promo validation, receipt & 409 guard")

        # 4. Offers Page Promo Claim Handoff & 5+ Seat 30% Automatic Group Discount + Edit-Seats Back Link
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

        # Click "Select Seats" progress step to verify seamless seat restoration
        driver.find_element(By.ID, "back-to-seats-link").click()
        wait.until(EC.url_contains("booking3.html"))
        wait.until(lambda d: d.find_element(By.ID, "summary-count").text == "5")
        check_no_local_errors(driver, "Offers page, 5-seat group discount & seat restoration", base_url)
        print("[PASS] E2E 4: Offers page DB validity, promo handoff, 5+ seat 30% discount & seat-edit restoration")

        # 5. Customer Registration, Logout, Seed Bcrypt Login, Ticket Wallet & Session-Bound OTP Password Reset
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

        driver.find_element(By.ID, "header-auth-btn").click()
        wait.until(EC.url_contains("/login.html"))
        assert_true(
            driver.execute_script("return !localStorage.getItem('userToken') && !localStorage.getItem('userId')"),
            "Logout did not clear localStorage",
        )

        driver.find_element(By.ID, "email").send_keys("218451@student.upm.edu.my")
        driver.find_element(By.ID, "password").send_keys("218451")
        driver.find_element(By.CSS_SELECTOR, "#login-form button[type='submit']").click()
        wait.until(EC.url_contains("/pages/homepage.html"))
        assert_eq(driver.find_element(By.ID, "header-username").text, "LI JIAQI", "Seed bcrypt user login")

        driver.find_element(By.ID, "header-tickets-link").click()
        wait.until(EC.url_contains("generate_ticket.html"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#cons .ticket")) == 9)
        first_ticket_text = driver.find_element(By.CSS_SELECTOR, "#cons .ticket").text
        assert_true(" min" not in first_ticket_text, f"Duplicate duration 'min' found: {first_ticket_text}")

        driver.find_element(By.CSS_SELECTOR, "#cons .ticket .cancel-button").click()
        driver.switch_to.alert.accept()
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#cons .ticket")) == 8)

        # Logout before testing forgot-password OTP flow
        driver.find_element(By.ID, "header-auth-btn").click()
        wait.until(EC.url_contains("/login.html"))

        driver.get(f"{base_url}/pwd.html")
        driver.find_element(By.ID, "email").send_keys("alice@example.com")
        driver.find_element(By.ID, "send-code").click()
        wait.until(lambda d: d.find_element(By.ID, "demo-otp-banner").is_displayed())
        issued_otp = driver.find_element(By.ID, "issued-otp-code").text.strip()
        assert_true(len(issued_otp) == 6 and issued_otp.isdigit(), f"Expected 6-digit dynamic OTP, got {issued_otp}")

        driver.find_element(By.ID, "Verification").send_keys(issued_otp)
        driver.find_element(By.ID, "password").send_keys("newpass456")
        driver.find_element(By.ID, "pwd-submit-btn").click()
        wait.until(EC.url_contains("/login.html"))
        check_no_local_errors(driver, "User auth, tickets & dynamic OTP password reset", base_url)
        print("[PASS] E2E 5: Registration, logout cleanup, seed $2y$10$ login, ticket cancellation & dynamic OTP reset")

        # 6. Admin Unauthenticated Guard + Admin Login + Dashboard + Full Movie/Offer/User/Seat CRUD + Relation Sync
        status_401, _ = http_json(f"{raw_url}/index.php/admin/movie/index")
        assert_eq(status_401, 401, "Unauthenticated admin API must return 401")

        driver.get(f"{base_url}/admin/dashboard.html")
        wait.until(EC.url_contains("/admin/login.html"))

        driver.find_element(By.ID, "admin-username").send_keys("admin")
        driver.find_element(By.ID, "admin-password").send_keys("admin")
        driver.find_element(By.ID, "admin-submit-btn").click()

        wait.until(EC.url_contains("/admin/dashboard.html"))
        wait.until(lambda d: d.find_element(By.ID, "stat-movies").text == "7")
        assert_eq(driver.find_element(By.ID, "stat-offers").text, "5", "Dashboard active offers KPI")
        assert_eq(driver.find_element(By.ID, "stat-theaters").text, "6", "Dashboard theaters KPI")

        # Create & Edit Movie (verifying theater_movie checklist sync)
        driver.get(f"{base_url}/admin/add-movie.html")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'input[name="theater_codes"]')) == 6)
        driver.find_element(By.ID, "movie_name").send_keys("Interstellar Re-Release")
        driver.find_element(By.ID, "times").send_keys("2h 49m")
        driver.find_element(By.ID, "img").send_keys("../img/homepage/starwars_.jpg")
        driver.find_element(By.CSS_SELECTOR, "#add-movie-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/movies.html"))
        wait.until(lambda d: "Interstellar Re-Release" in d.find_element(By.ID, "movies-tbody").text)
        assert_true("6 cinema(s)" in driver.find_element(By.ID, "movies-tbody").text, "Expected 6 scheduled cinemas")

        driver.get(f"{base_url}/admin/edit-movie.html?movie_code=8")
        wait.until(lambda d: d.find_element(By.ID, "movie_name").get_attribute("value") == "Interstellar Re-Release")
        driver.find_element(By.ID, "tag").send_keys("IMAX")
        driver.find_element(By.CSS_SELECTOR, "#edit-movie-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/movies.html"))
        wait.until(lambda d: "IMAX" in d.find_element(By.ID, "movies-tbody").text)

        # Create & Edit Offer (scoping offer_code=6 exclusively to Movie #1 Frozen 2!)
        driver.get(f"{base_url}/admin/add-offer.html")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'input[name="movie_codes"]')) >= 7)
        driver.find_element(By.CSS_SELECTOR, '#movie-checklist .checklist-toggle-btn[data-action="none"]').click()
        driver.find_element(By.CSS_SELECTOR, '#movie-checklist input[name="movie_codes"][value="1"]').click()
        driver.find_element(By.ID, "offer_title").send_keys("Frozen Exclusive Deal")
        driver.find_element(By.ID, "promo_code").send_keys("FROZEN10")
        money_el = driver.find_element(By.ID, "money")
        money_el.clear()
        money_el.send_keys("10.00")
        driver.find_element(By.ID, "img").send_keys("../img/offer/family.png")
        driver.find_element(By.ID, "offer_description").send_keys("Save $10 exclusively on Frozen 2.")
        driver.find_element(By.CSS_SELECTOR, "#add-offer-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/offers.html"))
        wait.until(lambda d: "FROZEN10" in d.find_element(By.ID, "offers-tbody").text)
        assert_true("1 film(s)" in driver.find_element(By.ID, "offers-tbody").text, "Expected 1 eligible movie on FROZEN10")

        driver.get(f"{base_url}/admin/edit-offer.html?offer_code=6")
        wait.until(lambda d: d.find_element(By.ID, "promo_code").get_attribute("value") == "FROZEN10")
        assert_eq(driver.find_element(By.ID, "offer_validity").get_attribute("value"), "2027-12-31", "Hydrated offer_validity")
        title_el = driver.find_element(By.ID, "offer_title")
        title_el.clear()
        title_el.send_keys("Frozen Deluxe 10")
        driver.find_element(By.CSS_SELECTOR, "#edit-offer-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/offers.html"))
        wait.until(lambda d: "Frozen Deluxe 10" in d.find_element(By.ID, "offers-tbody").text)

        # Create & Edit User + Password Redaction Check + Seat Management Filter
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

        driver.get(f"{base_url}/admin/edit-user.html?user_code=3")
        wait.until(lambda d: d.find_element(By.ID, "user_name").get_attribute("value") == "Bob Lim")
        uname_el = driver.find_element(By.ID, "user_name")
        uname_el.clear()
        uname_el.send_keys("Bob Lim Updated")
        driver.find_element(By.CSS_SELECTOR, "#edit-user-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/user.html"))
        wait.until(lambda d: "Bob Lim Updated" in d.find_element(By.ID, "users-tbody").text)

        driver.get(f"{base_url}/admin/seat.html")
        wait.until(lambda d: "Guest Checkout" in d.find_element(By.ID, "seats-tbody").text)
        check_no_local_errors(driver, "Admin full CRUD & relational checklists", base_url)
        print("[PASS] E2E 6: Admin 401 guard, login, dashboard & Movie/Offer/User/Seat CRUD with relational sync")

        # 7. Interactive Info Pages, 3D Auditorium Sightlines & XSS-Safe Live Chat
        driver.get(f"{base_url}/pages/3d-model.html?movie_code=2&theater_code=1")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#rows3dMount .row-3d")) == 8)
        driver.find_elements(By.CSS_SELECTOR, "#rows3dMount .row-3d")[0].click()
        assert_true("Row A" in driver.find_element(By.ID, "sightline-title").text, "3D row sightline did not update")
        driver.find_element(By.ID, "backBtn").click()
        wait.until(EC.url_contains("booking3.html?movie_code=2&theater_code=1"))

        driver.get(f"{base_url}/pages/giftcards.html")
        driver.find_element(By.ID, "gc-email").send_keys("friend@example.com")
        driver.find_element(By.ID, "gc-generate-btn").click()
        assert_true("GC-50-" in driver.find_element(By.ID, "gc-preview-code").text, "Gift card generator failed")

        driver.get(f"{base_url}/pages/upcoming.html")
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, "#upcoming-cards-grid .movie-card")) == 4)
        driver.find_element(By.CSS_SELECTOR, "#upcoming-cards-grid .remind-btn").click()
        assert_true("Reminder Saved" in driver.find_element(By.CSS_SELECTOR, "#upcoming-cards-grid .remind-btn").text, "Upcoming reminder failed")

        driver.get(f"{base_url}/pages/faqs.html")
        driver.find_element(By.ID, "faq-search-input").send_keys("30%")
        wait.until(lambda d: "Group Discount" in d.find_element(By.ID, "faq-list").text)

        for info_page in ("help.html", "privacy.html", "team.html"):
            driver.get(f"{base_url}/pages/{info_page}")
            check_no_local_errors(driver, f"Static page {info_page}", base_url)

        driver.get(f"{base_url}/pages/about.html")
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
        check_no_local_errors(driver, "Interactive info pages, 3D simulator & XSS-safe live chat", base_url)
        print("[PASS] E2E 7: Offline 3D sightline simulator, Gift Cards, Upcoming, FAQs, Help & XSS-safe live chat")

        # 8. Adversarial Security, Cross-Movie Promo Guard, Multithreaded Seat Race & Cascade Integrity
        # 8a. Unauthenticated IDOR cancellation & ticket lookup must be blocked (401)
        anon = ApiSessionClient(raw_url)
        s_unauth_del, b_unauth_del = anon.request_json("/index.php/movie/seat/delete", "POST", {"seat_code": 9, "user_code": 1})
        assert_eq(s_unauth_del, 401, "Unauthenticated ticket delete must return 401")
        assert_eq(b_unauth_del["success"], False, "Unauthenticated delete blocked")

        s_unauth_list, _ = anon.request_json("/index.php/movie/seat/getSeatListByUserCode?user_code=1")
        assert_eq(s_unauth_list, 401, "Unauthenticated ticket wallet read must return 401")

        # 8b. Authenticated Alice (user #2) cannot read or cancel User #1's tickets (403) + Session Rotation check
        alice = ApiSessionClient(raw_url)
        alice.request_json("/index.php/user/user/session")
        pre_login_sid = alice.phpsessid()
        s_login, b_login = alice.request_json("/index.php/user/user/login", "POST", {"email": "alice@example.com", "password": "newpass456"})
        assert_true(s_login == 200 and b_login["success"], "Alice login with new password failed")
        assert_true(alice.phpsessid() != pre_login_sid, "User login must rotate PHPSESSID to prevent session fixation")

        s_idor_read, _ = alice.request_json("/index.php/movie/seat/getSeatListByUserCode?user_code=1")
        assert_eq(s_idor_read, 403, "Cross-user ticket read must return 403")
        s_idor_del, _ = alice.request_json("/index.php/movie/seat/delete", "POST", {"seat_code": 9, "user_code": 1})
        assert_eq(s_idor_del, 403, "Cross-user ticket delete must return 403")

        # 8c. Static 888888 backdoor & Cross-Email OTP abuse must be rejected
        attacker = ApiSessionClient(raw_url)
        _, b_static = attacker.request_json(
            "/index.php/user/user/changePassword",
            "POST",
            {"email": "218451@student.upm.edu.my", "verification_code": "888888", "pwd": "hacked123"},
        )
        assert_eq(b_static["success"], False, "Static 888888 reset must be rejected")

        _, otp_res = attacker.request_json("/index.php/user/user/sendResetCode", "POST", {"email": "bob@example.com"})
        bob_otp = otp_res["data"]["demo_code"]
        _, cross_email_res = attacker.request_json(
            "/index.php/user/user/changePassword",
            "POST",
            {"email": "218451@student.upm.edu.my", "verification_code": bob_otp, "pwd": "hacked123"},
        )
        assert_eq(cross_email_res["success"], False, "OTP issued for bob@example.com must not reset victim email")

        # 8d. Cross-movie promo enforcement (`FROZEN10` valid ONLY on Movie #1, rejected on Movie #2)
        _, cross_promo_check = alice.request_json("/index.php/offer/offer/getMoneyByBadge?badge=FROZEN10&movie_code=2")
        assert_eq(cross_promo_check["success"], False, "FROZEN10 must be rejected for Movie #2")
        _, cross_promo_book = alice.request_json(
            "/index.php/movie/seat/saveSeats",
            "POST",
            {"movie_code": 2, "theater_code": 1, "date": booked_date, "time": "09:30 AM", "seat_nums": ["B8"], "promo_code": "FROZEN10"},
        )
        assert_eq(cross_promo_book["success"], False, "Checkout saveSeats must reject cross-movie promo code")

        _, valid_promo_book = alice.request_json(
            "/index.php/movie/seat/saveSeats",
            "POST",
            {"movie_code": 1, "theater_code": 1, "date": booked_date, "time": "09:30 AM", "seat_nums": ["B8"], "promo_code": "FROZEN10"},
        )
        assert_eq(valid_promo_book["success"], True, "FROZEN10 must succeed on eligible Movie #1")
        assert_eq(valid_promo_book["data"]["pricing"]["total_paid"], 31.5, "Server pricing: $39 - $10 + $2.50 = $31.50")

        # 8e. Admin Cookie-only CSRF guard + Zero/Negative price guard + Movie delete cascade check
        admin_cli = ApiSessionClient(raw_url)
        _, adm_login = admin_cli.request_json("/index.php/admin/auth/login", "POST", {"username": "admin", "password": "admin"})
        adm_token = adm_login["token"]

        s_csrf, _ = admin_cli.request_json("/index.php/admin/movie/delete", "POST", {"movie_code": 8})
        assert_eq(s_csrf, 401, "Admin request without X-Admin-Token must be rejected (anti-CSRF)")

        adm_hdr = {"X-Admin-Token": adm_token}
        _, zero_price = admin_cli.request_json(
            "/index.php/admin/movie/create",
            "POST",
            {"movie_name": "Zero Film", "movie_type": "Drama", "times": "2h", "star": 4.5, "money": 0, "img": "../img/logo.jpg"},
            headers=adm_hdr,
        )
        assert_eq(zero_price["success"], False, "Zero ticket price must be rejected")

        _, bad_date = admin_cli.request_json(
            "/index.php/admin/offer/create",
            "POST",
            {"offer_title": "Bad Date", "offer_type": "Student Deals", "offer_description": "x", "promo_code": "BADDATE", "offer_validity": "2027-02-31", "img": "../img/logo.jpg", "money": 5},
            headers=adm_hdr,
        )
        assert_eq(bad_date["success"], False, "Non-existent calendar date 2027-02-31 must be rejected")

        _, del_movie8 = admin_cli.request_json("/index.php/admin/movie/delete", "POST", {"movie_code": 8}, headers=adm_hdr)
        assert_eq(del_movie8["success"], True, "Admin delete Movie #8 with X-Admin-Token must succeed")
        _, th_detail = anon.request_json("/index.php/theater/theater/getTheaterDetails?theater_code=1")
        assert_eq(len(th_detail["data"]["movies"]), 7, "Deleted movie #8 must be removed from theater_movie schedule")

        # 8f. Multithreaded concurrent seat race on seat H9 (6 simultaneous requests -> 1 HTTP 200 + 5 HTTP 409)
        race_results: list[int] = []
        barrier = threading.Barrier(6)

        def attempt_seat() -> None:
            barrier.wait()
            code, _ = http_json(
                f"{raw_url}/index.php/movie/seat/saveSeats",
                method="POST",
                payload={"movie_code": 1, "theater_code": 1, "date": booked_date, "time": "12:00 PM", "seat_nums": ["H9"]},
            )
            race_results.append(code)

        threads = [threading.Thread(target=attempt_seat) for _ in range(6)]
        for th in threads:
            th.start()
        for th in threads:
            th.join()
        assert_eq(sorted(race_results), [200, 409, 409, 409, 409, 409], f"Concurrent race expected 1x200 + 5x409, got {race_results}")
        print("[PASS] E2E 8: IDOR/CSRF guards, OTP anti-abuse, cross-movie promo check, cascade & 6-thread seat race")

        print("ALL 8 HEADLESS CHROMIUM & SECURITY E2E SUITES PASSED WITH ZERO LOCAL ERRORS.")
    finally:
        driver.quit()
        server.shutdown()


if __name__ == "__main__":
    run_e2e_suite()
    sys.exit(0)
