#!/usr/bin/env python3
"""
End-to-End Headless Chromium Browser Verification Suite (Selenium WebDriver).
Tests all customer and administrator journeys, security invariants, dark-mode reversibility,
transactional seat booking, promo code verification, group discounts, and XSS escaping
against live DOM & SQLite DB.
"""

from __future__ import annotations

import json
import sys
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
        if "status of 401" in message or "status of 409" in message:
            continue
        severe_local.append(message)
    assert_true(len(severe_local) == 0, f"Browser console errors in {context}: {severe_local}")


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

        # 3. Guest Seat Selection + Invalid/Valid Promo Code + Guest Checkout + Receipt + 409 Conflict Guard
        driver.find_element(By.CSS_SELECTOR, "#movies-list .movie-card a").click()
        wait.until(EC.url_contains("booking3.html?movie_code=1&theater_code=2"))
        wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, ".seat[data-seat]")) == 96)

        driver.find_element(By.CSS_SELECTOR, '.seat[data-seat="F2"]').click()
        driver.find_element(By.CSS_SELECTOR, '.seat[data-seat="F3"]').click()
        assert_eq(driver.find_element(By.ID, "summary-count").text, "2", "Selected seat count")
        driver.find_element(By.CSS_SELECTOR, ".proceed-button").click()

        wait.until(EC.url_contains("pay.html"))
        wait.until(lambda d: driver.find_element(By.ID, "total-price").text == "$78.00")

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
        print("[PASS] E2E 3: Guest seat booking, promo code validation, receipt rendering & 409 double-booking guard")

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
        # Auto-filled promo code from Offers page claim
        wait.until(lambda d: driver.find_element(By.ID, "coupon-code").get_attribute("value") == "STUDENT30")
        check_no_local_errors(driver, "Offers page & 5-seat group discount", base_url)
        print("[PASS] E2E 4: Offers page DB validity, promo handoff & 5+ seat 30% group discount")

        # 5. Customer Registration, Logout, Seed Bcrypt Login, Ticket Wallet & Cancellation, Password Reset
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

        driver.get(f"{base_url}/pwd.html")
        driver.find_element(By.ID, "email").send_keys("alice@example.com")
        driver.find_element(By.ID, "Verification").send_keys("888888")
        driver.find_element(By.ID, "password").send_keys("newpass456")
        driver.find_element(By.CSS_SELECTOR, "#reset-form button[type='submit']").click()
        wait.until(EC.url_contains("/login.html"))
        check_no_local_errors(driver, "User auth, tickets & password reset", base_url)
        print("[PASS] E2E 5: Registration, logout cleanup, seed $2y$10$ login, ticket cancellation & password reset")

        # 6. Admin Unauthenticated Guard + Admin Login + Dashboard + Full Movie/Offer/User/Seat CRUD
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

        # Create & Edit Movie
        driver.get(f"{base_url}/admin/add-movie.html")
        wait.until(lambda d: d.find_element(By.ID, "movie_name").is_displayed())
        driver.find_element(By.ID, "movie_name").send_keys("Interstellar Re-Release")
        driver.find_element(By.ID, "times").send_keys("2h 49m")
        driver.find_element(By.ID, "img").send_keys("../img/homepage/starwars_.jpg")
        driver.find_element(By.CSS_SELECTOR, "#add-movie-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/movies.html"))
        wait.until(lambda d: "Interstellar Re-Release" in d.find_element(By.ID, "movies-tbody").text)
        assert_true("null" not in driver.find_element(By.ID, "movies-tbody").text.lower(), "Literal 'null' badge rendered")

        driver.get(f"{base_url}/admin/edit-movie.html?movie_code=8")
        wait.until(lambda d: d.find_element(By.ID, "movie_name").get_attribute("value") == "Interstellar Re-Release")
        driver.find_element(By.ID, "tag").send_keys("IMAX")
        driver.find_element(By.CSS_SELECTOR, "#edit-movie-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/movies.html"))
        wait.until(lambda d: "IMAX" in d.find_element(By.ID, "movies-tbody").text)

        # Create & Edit Offer
        driver.get(f"{base_url}/admin/add-offer.html")
        wait.until(lambda d: d.find_element(By.ID, "offer_title").is_displayed())
        driver.find_element(By.ID, "offer_title").send_keys("Holiday IMAX Deal")
        driver.find_element(By.ID, "promo_code").send_keys("HOLIDAY10")
        money_el = driver.find_element(By.ID, "money")
        money_el.clear()
        money_el.send_keys("10.00")
        driver.find_element(By.ID, "img").send_keys("../img/offer/family.png")
        driver.find_element(By.ID, "offer_description").send_keys("Save $10 on holiday screenings.")
        driver.find_element(By.CSS_SELECTOR, "#add-offer-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/offers.html"))
        wait.until(lambda d: "HOLIDAY10" in d.find_element(By.ID, "offers-tbody").text)

        driver.get(f"{base_url}/admin/edit-offer.html?offer_code=6")
        wait.until(lambda d: d.find_element(By.ID, "promo_code").get_attribute("value") == "HOLIDAY10")
        assert_eq(driver.find_element(By.ID, "offer_validity").get_attribute("value"), "2027-12-31", "Hydrated offer_validity")
        title_el = driver.find_element(By.ID, "offer_title")
        title_el.clear()
        title_el.send_keys("Holiday IMAX Deluxe")
        driver.find_element(By.CSS_SELECTOR, "#edit-offer-form .submit-btn").click()
        wait.until(EC.url_contains("/admin/offers.html"))
        wait.until(lambda d: "Holiday IMAX Deluxe" in d.find_element(By.ID, "offers-tbody").text)

        # Create & Edit User + Password Redaction Check + Seat Management
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
        check_no_local_errors(driver, "Admin full CRUD & redaction", base_url)
        print("[PASS] E2E 6: Admin 401 guard, login, dashboard charts & full Movie/Offer/User/Seat CRUD")

        # 7. Static Info Pages & Live Chat XSS Escaping Verification
        for info_page in ("faqs.html", "giftcards.html", "help.html", "privacy.html", "team.html", "upcoming.html", "3d-model.html"):
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
        check_no_local_errors(driver, "About page & XSS-safe live chat", base_url)
        print("[PASS] E2E 7: All static info pages, 3D preview & XSS-safe live chat verified")

        print("ALL 7 HEADLESS CHROMIUM E2E SUITES PASSED WITH ZERO LOCAL ERRORS.")
    finally:
        driver.quit()
        server.shutdown()


if __name__ == "__main__":
    run_e2e_suite()
    sys.exit(0)
