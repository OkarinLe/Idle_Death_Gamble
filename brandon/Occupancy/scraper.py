"""
Scraper for VT RecSports Facility Occupancy dashboard
https://connect.recsports.vt.edu/facilityoccupancy

Strategy
--------
This page renders occupancy as donut charts (Chart.js style) filled in by
JavaScript after an API call. Rather than trying to scrape the <canvas>
elements (which don't expose text/DOM you can parse), this script:

  1. Opens the page in a real, headless browser (Playwright).
  2. Listens for every network response the page makes while loading.
  3. Captures any JSON responses that look like they contain occupancy data.
  4. Falls back to reading the rendered DOM (card titles + any visible
     numbers/tooltips) if no JSON API call is found.

Setup
-----
    pip install playwright --break-system-packages
    playwright install chromium

Usage
-----
    python scrape_facility_occupancy.py

Notes
-----
- I could not load the live page myself while writing this (robots.txt
  blocks automated fetches for me), so the DOM selectors below are best
  guesses based on a screenshot of the page. Run once with HEADLESS=False
  and inspect the browser DevTools Network tab yourself to find the exact
  API endpoint -- once you find it (look for a request returning JSON with
  fields like "capacity", "count", "occupancy", or facility names), you can
  skip Playwright entirely and just hit that endpoint with `requests`,
  which will be far faster and more robust than browser automation.
- Please check the site's Terms of Service / robots.txt and use reasonable
  request rates. This script is intended for personal/informational use
  (e.g., checking current gym crowding), not high-frequency polling.
"""

import json
import re
import time
from dataclasses import asdict, dataclass, field
from typing import Optional

from playwright.sync_api import sync_playwright

URL = "https://connect.recsports.vt.edu/facilityoccupancy"
HEADLESS = True          # set False the first time to watch it work / debug
WAIT_AFTER_LOAD_MS = 4000  # give charts time to fetch + render
OUTPUT_PATH = "facility_occupancy.json"

# Keywords that suggest a network response is occupancy-related JSON
CANDIDATE_KEYWORDS = ("occup", "capacity", "facility", "count", "attend")


@dataclass
class FacilityReading:
    name: str
    current: Optional[int] = None
    capacity: Optional[int] = None
    raw: dict = field(default_factory=dict)


def looks_like_occupancy_json(url: str, body_text: str) -> bool:
    lowered_url = url.lower()
    if any(k in lowered_url for k in CANDIDATE_KEYWORDS):
        return True
    # Cheap heuristic: JSON body mentioning occupancy-ish keys
    lowered_body = body_text[:2000].lower()
    return any(k in lowered_body for k in CANDIDATE_KEYWORDS)


def scrape_via_network_capture() -> list[dict]:
    """Capture JSON API responses the page makes while loading."""
    captured = []
    seen_signatures = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context()
        page = context.new_page()

        def handle_response(response):
            try:
                ctype = response.headers.get("content-type", "")
                if "application/json" not in ctype:
                    return
                url = response.url
                body_text = response.text()
                if looks_like_occupancy_json(url, body_text):
                    # The page may poll the same endpoint more than once
                    # before we finish capturing (or hit it once per widget
                    # with an identical payload) -- skip exact duplicates.
                    signature = (url, body_text)
                    if signature in seen_signatures:
                        return
                    seen_signatures.add(signature)
                    try:
                        data = response.json()
                    except Exception:
                        return
                    captured.append({"url": url, "data": data})
            except Exception:
                # Response bodies can fail to resolve (redirects, aborted, etc.)
                pass

        page.on("response", handle_response)

        page.goto(URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(WAIT_AFTER_LOAD_MS)

        browser.close()

    return captured


def scrape_via_dom_fallback() -> list[FacilityReading]:
    """
    Fallback: read facility names + any visible numeric readouts from the
    rendered page (e.g., a tooltip value, or aria-label/text near each
    donut chart). Adjust the selectors below once you inspect real markup;
    these are best-effort guesses based on the dashboard's visual layout.
    """
    readings: list[FacilityReading] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        page = browser.new_page()
        page.goto(URL, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(WAIT_AFTER_LOAD_MS)

        # Each facility appears to be in its own "card" container with a
        # heading (facility name) followed by an Occupancy/Details tab pair
        # and a donut chart. Try a few plausible selectors.
        card_selector_candidates = [
            "[class*='card']",
            "[class*='facility']",
            "section",
        ]

        cards = []
        for sel in card_selector_candidates:
            found = page.query_selector_all(sel)
            if found:
                cards = found
                break

        for card in cards:
            text = card.inner_text().strip()
            if not text:
                continue
            # First line is usually the facility name
            first_line = text.splitlines()[0].strip()
            if not first_line or len(first_line) > 60:
                continue

            # Look for a raw whole-number count in the card text (e.g. a
            # tooltip value like "639"). Percentages are intentionally
            # ignored — we only want the raw count.
            number_match = re.search(r"\b\d{1,5}\b", text)
            current = int(number_match.group(0)) if number_match else None

            readings.append(FacilityReading(name=first_line, current=current, raw={"text": text}))

        browser.close()

    # De-duplicate: broad selectors like "[class*='card']" often match both
    # a container div and elements nested inside it, so the same facility
    # can get picked up multiple times. Keep the first occurrence of each
    # unique facility name.
    seen = set()
    deduped: list[FacilityReading] = []
    for r in readings:
        if r.name in seen:
            continue
        seen.add(r.name)
        deduped.append(r)

    return deduped


def write_json(payload: dict) -> None:
    with open(OUTPUT_PATH, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"\nWrote results to {OUTPUT_PATH}")


def main():
    print(f"Loading {URL} ...")
    api_hits = scrape_via_network_capture()
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S")

    if api_hits:
        print(f"\nFound {len(api_hits)} JSON response(s) that look occupancy-related.")
        print(
            "Raw API responses saved to the JSON file below under 'raw_api_hits'. "
            "Inspect them, then adjust this script to pull the exact raw-count "
            "field into 'facilities' instead of leaving it empty."
        )
        write_json({
            "scraped_at": timestamp,
            "source": URL,
            "facilities": [],  # fill in once you identify the exact raw-count field
            "raw_api_hits": api_hits,
        })
        return

    print("No obvious occupancy JSON API found via network capture.")
    print("Falling back to DOM scraping (best-effort)...\n")

    readings = scrape_via_dom_fallback()
    facilities = [
        {"name": r.name, "current": r.current}
        for r in readings
    ]

    if not readings:
        print(
            "Could not extract data automatically. Run with HEADLESS=False, "
            "open Chrome DevTools > Network tab, reload the page, and look "
            "for an XHR/fetch request returning JSON occupancy data. Update "
            "CANDIDATE_KEYWORDS or hit that endpoint directly with `requests`."
        )

    write_json({
        "scraped_at": timestamp,
        "source": URL,
        "facilities": facilities,
    })


if __name__ == "__main__":
    main()