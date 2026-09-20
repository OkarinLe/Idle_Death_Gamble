#!/usr/bin/env python3
"""
Virginia Tech Football Schedule Scraper
=========================================

Scrapes the Virginia Tech football schedule (list view) from:
    https://hokiesports.com/sports/football/schedule?view=list

and writes Date, Teams, Location, Time/Results, and Links to a CSV file.

WHY PLAYWRIGHT
--------------
hokiesports.com is a JavaScript-rendered (Next.js) site — a plain
`requests.get()` only returns an empty shell ("Javascript is required.").
Playwright launches a real (headless) browser, lets the page's JS run,
and then hands us the fully-rendered HTML to parse with BeautifulSoup.

Handy detail: the "list view" of the schedule renders an accessible
<table> (Date / Teams / Location / Time/Results / Links columns) behind
the visual card layout, purely for screen readers. That table is far
more reliable to scrape than the decorative cards, so this script
targets it directly, with a card-based fallback in case the site
changes and the table disappears.

SETUP
-----
    pip install playwright beautifulsoup4 --break-system-packages
    playwright install chromium

USAGE
-----
    python vt_football_schedule_scraper.py
        -> runs forever, re-scraping every 5 minutes (the default)

    python vt_football_schedule_scraper.py --season 2025 --output vt_2025.csv
        -> same, but for the 2025 season and a custom output file

    python vt_football_schedule_scraper.py --interval 10
        -> loop every 10 minutes instead of the default 5

    python vt_football_schedule_scraper.py --once
        -> run a single time and exit (no looping)

Add --headed if you want to watch the browser work (useful for debugging).
"""

import argparse
import csv
import re
import sys
import time
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup

BASE_URL = "https://hokiesports.com/sports/football/schedule"
FIELDNAMES = ["Date", "Teams", "Location", "Time/Results", "Links"]

DEFAULT_INTERVAL_MINUTES = 5


def fetch_rendered_html(url: str, headless: bool = True, timeout_ms: int = 30000) -> str:
    """Load the page in a headless browser and return the fully rendered HTML."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit(
            "Playwright is not installed.\n"
            "Run:\n"
            "    pip install playwright beautifulsoup4 --break-system-packages\n"
            "    playwright install chromium"
        )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page.goto(url, wait_until="networkidle", timeout=timeout_ms)

        # Give the schedule widget a moment to finish hydrating/rendering.
        try:
            page.wait_for_selector("table, text=Schedule Events", timeout=timeout_ms)
        except Exception:
            pass  # We'll still try to parse whatever loaded.

        html = page.content()
        browser.close()
        return html


def clean_text(el) -> str:
    """Get whitespace-normalized text from a BeautifulSoup element."""
    if el is None:
        return ""
    return re.sub(r"\s+", " ", el.get_text(separator=" ", strip=True)).strip()


def extract_links(cell, page_url: str) -> str:
    """Pull every 'Link Text: absolute URL' pair out of a table cell."""
    if cell is None:
        return ""
    pairs = []
    for a in cell.find_all("a", href=True):
        text = clean_text(a) or "(link)"
        href = urljoin(page_url, a["href"])
        pairs.append(f"{text}: {href}")
    return " | ".join(pairs)


def parse_table(html: str, page_url: str):
    """Primary strategy: parse the accessible schedule <table>."""
    soup = BeautifulSoup(html, "html.parser")
    rows_out = []

    for table in soup.find_all("table"):
        header_text = clean_text(table.find("tr")).lower()
        if "date" not in header_text or "team" not in header_text:
            continue  # not the schedule table

        body_rows = table.find_all("tr")[1:]  # skip header row
        for tr in body_rows:
            cells = tr.find_all(["td", "th"])
            if len(cells) < 5:
                continue
            date_cell, teams_cell, location_cell, time_cell, links_cell = cells[:5]
            rows_out.append(
                {
                    "Date": clean_text(date_cell),
                    "Teams": clean_text(teams_cell),
                    "Location": clean_text(location_cell),
                    "Time/Results": clean_text(time_cell),
                    "Links": extract_links(links_cell, page_url),
                }
            )
        if rows_out:
            return rows_out
    return rows_out


def parse_cards_fallback(html: str, page_url: str):
    """
    Fallback strategy if no <table> is found (e.g. the site's markup changes).
    Walks the visual "schedule event" cards instead.
    """
    soup = BeautifulSoup(html, "html.parser")
    rows_out = []

    heading = soup.find(string=re.compile("Schedule Events"))
    container = heading.find_parent() if heading else soup

    # Each game's date acts as a natural block boundary (e.g. "SatSep 5").
    date_pattern = re.compile(
        r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{1,2}$"
    )

    candidates = container.find_all(["strong", "b", "h2", "h3", "div", "span"])
    date_nodes = [el for el in candidates if date_pattern.match(clean_text(el))]

    for i, date_el in enumerate(date_nodes):
        date_text = clean_text(date_el)

        # Collect this game's "block": everything between this date node and the next.
        block_nodes = []
        node = date_el
        stop_el = date_nodes[i + 1] if i + 1 < len(date_nodes) else None
        seen_stop = False
        # Walk forward through the document in order until we hit the next date node.
        for el in date_el.find_all_next():
            if stop_el is not None and el is stop_el:
                seen_stop = True
                break
            block_nodes.append(el)
        block_text = clean_text(date_el.parent) if date_el.parent else date_text

        # Grab all links in the block (bounded roughly to the next date's position).
        links = []
        for a in block_nodes:
            if a.name == "a" and a.has_attr("href"):
                text = clean_text(a) or "(link)"
                href = urljoin(page_url, a["href"])
                links.append(f"{text}: {href}")
            if stop_el is not None and a is stop_el:
                break

        rows_out.append(
            {
                "Date": date_text,
                "Teams": "(see raw block – table view unavailable, verify manually)",
                "Location": "",
                "Time/Results": "",
                "Links": " | ".join(dict.fromkeys(links)),  # de-dup, preserve order
            }
        )

    return rows_out


def scrape(view_url: str, headless: bool = True):
    html = fetch_rendered_html(view_url, headless=headless)
    rows = parse_table(html, view_url)
    if not rows:
        print("No <table> found — falling back to card-based parsing.", file=sys.stderr)
        rows = parse_cards_fallback(html, view_url)
    return rows


def main():
    parser = argparse.ArgumentParser(description="Scrape the VT football schedule to CSV.")
    parser.add_argument(
        "--season",
        type=int,
        default=None,
        help="Season year, e.g. 2025 (appends ?season=YEAR&view=list). Defaults to the site's current season.",
    )
    parser.add_argument(
        "--output", "-o", default="vt_football_schedule.csv", help="Output CSV file path."
    )
    parser.add_argument(
        "--headed", action="store_true", help="Show the browser window (default: headless)."
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL_MINUTES,
        help=f"Re-run every INTERVAL minutes forever (default: {DEFAULT_INTERVAL_MINUTES}). "
        "Pass --once to run a single time instead.",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single time and exit, ignoring --interval.",
    )
    args = parser.parse_args()

    url = BASE_URL + "?view=list"
    if args.season:
        url += f"&season={args.season}"

    def run_once():
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Fetching: {url}")
        try:
            rows = scrape(url, headless=not args.headed)
        except Exception as exc:
            # Keep the loop alive even if a single fetch fails (site hiccup, timeout, etc.)
            print(f"  ERROR: {exc}", file=sys.stderr)
            return

        if not rows:
            print("  No schedule rows were found. The site's markup may have changed.", file=sys.stderr)
            return

        with open(args.output, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
            writer.writeheader()
            writer.writerows(rows)

        print(f"  Wrote {len(rows)} games to {args.output}")

    if args.once or args.interval <= 0:
        run_once()
    else:
        print(f"Running every {args.interval} minute(s). Press Ctrl+C to stop.")
        try:
            while True:
                run_once()
                time.sleep(args.interval * 60)
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()