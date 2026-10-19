"""Exercise the built static site with real desktop and mobile Chromium.

Install Playwright once (`python -m pip install playwright` and
`python -m playwright install chromium`), run `npm run build`, then:
    python tests/browser_smoke.py --serve --artifacts /workspace/scratch
To test an existing deployment, omit --serve and pass --url.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import csv
import io
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]


@contextmanager
def site_server(url: str, serve: bool):
    process = None
    if serve:
        process = subprocess.Popen(
            ["npm", "run", "preview", "--", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.STDOUT,
        )
    try:
        deadline = time.monotonic() + 30
        while True:
            try:
                with urlopen(url, timeout=2) as response:
                    assert response.status == 200
                break
            except (URLError, OSError):
                if process is not None and process.poll() is not None:
                    raise RuntimeError("The Vite preview server exited before it was ready")
                if time.monotonic() >= deadline:
                    raise RuntimeError(f"The site did not become reachable at {url}")
                time.sleep(0.2)
        yield
    finally:
        if process is not None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def check_label_spacing(flow):
    collisions = flow.locator(".flow-label").evaluate_all("""labels => {
        const boxes = labels.map(el => ({text: el.textContent, box: el.getBoundingClientRect()}));
        const collisions = [];
        for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
            const x = Math.min(boxes[a].box.right, boxes[b].box.right) - Math.max(boxes[a].box.left, boxes[b].box.left);
            const y = Math.min(boxes[a].box.bottom, boxes[b].box.bottom) - Math.max(boxes[a].box.top, boxes[b].box.top);
            if (x > 1 && y > 1) collisions.push([boxes[a].text, boxes[b].text]);
        }
        return collisions;
    }""")
    assert not collisions, f"Budget labels overlap: {collisions}"


def check_page(browser, url: str, artifacts: Path, name: str, width: int, height: int):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        device_scale_factor=1,
        reduced_motion="reduce",
        is_mobile=name == "mobile",
        has_touch=name == "mobile",
    )
    page = context.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.goto(url, wait_until="networkidle")
        expect(page.get_by_role("heading", level=1)).to_be_visible()
        expect(page.locator("main")).to_be_visible()
        expect(page.locator("body")).to_contain_text(re.compile(r"2026"))
        expect(page.locator("body")).not_to_contain_text(re.compile(r"\b(?:NaN|undefined|Infinity)\b"))
        flow = page.get_by_test_id("budget-flow")
        expect(flow).to_be_visible()
        nodes = flow.locator("[data-node-id]")
        ministry_count = nodes.count()
        assert ministry_count > 25, "The detailed flow did not render its categories"
        assert flow.locator("path.flow-link").count() > 25, "Budget connections are missing"
        check_label_spacing(flow)
        assert flow.locator("rect").evaluate_all(
            "els => els.every(el => ['x','y','width','height'].every(attr => "
            "Number.isFinite(Number(el.getAttribute(attr)))) && "
            "Number(el.getAttribute('width')) > 0 && Number(el.getAttribute('height')) > 0)"
        ), "A rendered category has invalid geometry"

        search = page.get_by_role("searchbox", name="Search budget categories")
        search.fill("COE")
        expect(page.locator("#search-status")).to_contain_text(re.compile(r"Fees.*charges", re.I))
        expect(flow.locator('[data-node-id="fees-and-charges"]')).not_to_have_class(re.compile("is-muted"))
        search.fill("health")
        expect(page.locator("#search-status")).to_contain_text("Health")
        search.fill("no-such-budget-category-123")
        expect(page.locator("#search-status")).to_contain_text("No matching category")
        page.get_by_role("button", name="Clear search", exact=True).click()
        expect(search).to_have_value("")

        health = flow.get_by_role("button", name=re.compile(r"^Health:"))
        health.focus()
        health.press("Enter")
        detail = page.get_by_role("complementary", name="Selected category details")
        expect(detail).to_be_visible()
        expect(detail.get_by_role("heading", name="Health", exact=True)).to_be_visible()
        expect(health).to_have_attribute("aria-pressed", "true")
        expect(detail.get_by_role("link", name="Official source")).to_have_attribute(
            "href", re.compile(r"^https://(?:cms\.)?singaporebudget\.gov\.sg/")
        )
        page.get_by_role("button", name="Close category details").click()
        expect(detail).to_be_hidden()
        expect(health).to_have_attribute("aria-pressed", "false")

        page.get_by_role("button", name="Sectors", exact=True).click()
        expect(page.get_by_role("button", name="Sectors", exact=True)).to_have_attribute("aria-pressed", "true")
        assert page.get_by_test_id("budget-flow").locator("[data-node-id]").count() < ministry_count
        check_label_spacing(page.get_by_test_id("budget-flow"))
        page.get_by_role("button", name="Ministries", exact=True).click()
        assert page.get_by_test_id("budget-flow").locator("[data-node-id]").count() == ministry_count

        page.get_by_role("button", name="Data table", exact=True).click()
        table = page.get_by_role("table")
        expect(table).to_be_visible()
        expect(page.get_by_test_id("budget-flow")).to_be_hidden()
        expect(page.get_by_role("button", name="Ministries", exact=True)).to_be_disabled()
        table_values = table.locator("tbody tr").evaluate_all(
            "rows => rows.map(row => { const c = row.querySelectorAll('td'); "
            "return [c[1].textContent, c[2].textContent.replaceAll(',', '')]; })"
        )
        assert len(table_values) > 25, "The exact-value data table is incomplete"
        search.fill("health")
        expect(table.get_by_role("row").filter(has_text="Health")).not_to_have_class(re.compile("table-muted"))
        page.get_by_role("button", name="Clear search", exact=True).click()

        with page.expect_download() as downloaded:
            page.get_by_role("button", name="Download budget data as CSV").click()
        download = downloaded.value
        assert download.suggested_filename == "singapore-budget-2026.csv"
        csv_text = Path(download.path()).read_text(encoding="utf-8-sig")
        csv_rows = list(csv.DictReader(io.StringIO(csv_text)))
        assert [(row["Budget line"], row["Amount SGD"]) for row in csv_rows] == [
            tuple(row) for row in table_values
        ], "The CSV differs from the exact values shown in the data table"
        assert all(row["Fiscal year"] == "2026" for row in csv_rows)
        page.get_by_role("button", name="Flow diagram", exact=True).click()
        expect(page.get_by_test_id("budget-flow")).to_be_visible()
        expect(table).to_be_hidden()

        page.get_by_text("How do the flows add up?", exact=True).click()
        expect(page.locator("#rounding-explanation")).to_be_visible()

        # A wide flow diagram may scroll within its own labelled container;
        # the page itself must still fit a phone screen.
        assert page.evaluate(
            "document.documentElement.scrollWidth <= window.innerWidth + 1"
        ), f"The {name} page overflows the viewport horizontally"
        assert not errors, f"Browser errors on {name}: {errors}"
        page.evaluate("window.scrollTo(0, 0)")
        page.locator("#flow-view").evaluate("el => { el.scrollLeft = 0; }")
        page.screenshot(path=str(artifacts / f"budget-{name}.png"), full_page=True)
        print(f"PASS {name}: rendering, search, keyboard selection, detail levels, table, CSV, methodology, and viewport fit")
    except BaseException:
        page.screenshot(path=str(artifacts / f"budget-{name}-failure.png"), full_page=True)
        raise
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:4173")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--artifacts", type=Path, default=Path("artifacts"))
    args = parser.parse_args()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    executable = os.environ.get("BROWSER_EXECUTABLE_PATH")
    if not executable and Path("/usr/bin/chromium").exists():
        executable = "/usr/bin/chromium"
    with site_server(args.url, args.serve), sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=executable,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            check_page(browser, args.url, args.artifacts, "desktop", 1512, 982)
            check_page(browser, args.url, args.artifacts, "mobile", 390, 844)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
