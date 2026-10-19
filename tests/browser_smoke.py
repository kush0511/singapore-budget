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
import math
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


def check_amount_geometry(flow):
    """Check the actual SVG, independently of the application's graph objects."""
    geometry = flow.evaluate("""svg => ({
        nodes: [...svg.querySelectorAll('[data-node-id]')].map(el => ({
            id: el.dataset.nodeId,
            amount: Number(el.dataset.amount || el.getAttribute('aria-label').match(/S\\$([\\d,]+)/)[1].replaceAll(',', '')),
            height: Number(el.querySelector('rect').getAttribute('height'))
        })),
        links: [...svg.querySelectorAll('path.flow-link')].map(el => ({
            source: el.dataset.source, target: el.dataset.target,
            amount: el.hasAttribute('data-amount') ? Number(el.dataset.amount) : null,
            width: Number(el.getAttribute('stroke-width'))
        }))
    })""")
    nodes = {node["id"]: node for node in geometry["nodes"]}
    links = geometry["links"]
    assert links, "No financial connections were rendered"
    for link in links:
        assert link["source"] in nodes and link["target"] in nodes
        if link["amount"] is None:
            # This hierarchy has one parent per category. Every edge carries
            # the smaller endpoint's amount, including receipt-to-pool edges.
            link["amount"] = min(nodes[link["source"]]["amount"], nodes[link["target"]]["amount"])
        assert link["amount"] > 0 and math.isfinite(link["width"])
        assert link["width"] > 0, f"A positive financial flow is invisible: {link}"
    largest = max(links, key=lambda link: link["amount"])
    scale = largest["width"] / largest["amount"]
    for link in links:
        expected = link["amount"] * scale
        assert math.isclose(link["width"], expected, rel_tol=1e-6, abs_tol=1e-6), (
            f"Flow widths do not share one amount scale: {link}; expected {expected}"
        )
    for node in nodes.values():
        incoming = [link["amount"] for link in links if link["target"] == node["id"]]
        outgoing = [link["amount"] for link in links if link["source"] == node["id"]]
        for direction, amounts in (("incoming", incoming), ("outgoing", outgoing)):
            if amounts:
                assert sum(amounts) == node["amount"], (
                    f"Rendered {direction} connections do not reconcile with {node['id']}: "
                    f"{sum(amounts)} versus {node['amount']}"
                )
        # Tiny nodes may have a visible minimum-size hit marker; their links
        # must still preserve the exact proportional width checked above.
        expected = node["amount"] * scale
        if expected >= 2:
            assert math.isclose(node["height"], expected, rel_tol=1e-6, abs_tol=1e-6), (
                f"Category block height misrepresents its amount: {node}; expected {expected}"
            )


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
        fiscal_year = page.get_by_role("combobox", name="Fiscal year").input_value()
        assert re.fullmatch(r"20\d{2}", fiscal_year), "The selected budget year is invalid"
        expect(page.locator("body")).to_contain_text(fiscal_year)
        expect(page.locator("body")).not_to_contain_text(re.compile(r"\b(?:NaN|undefined|Infinity)\b"))
        data_link = page.locator('a[download][href$=".json"]')
        # Use the browser's same-origin connection, including its configured
        # proxy, instead of a separate direct APIRequestContext connection.
        dataset = page.evaluate("""async href => {
            const response = await fetch(href);
            if (!response.ok) throw new Error(`Dataset unavailable: ${response.status}`);
            return response.json();
        }""", data_link.get_attribute("href"))
        assert str(dataset["fiscalYear"]) == fiscal_year
        flow = page.get_by_test_id("budget-flow")
        expect(flow).to_be_visible()
        nodes = flow.locator("[data-node-id]")
        initial_count = nodes.count()
        assert initial_count > 25, "The detailed flow did not render its categories"
        ministry_picker = page.get_by_role("combobox", name="Explore ministry")
        expect(ministry_picker).to_be_visible()
        assert flow.locator('[data-role="programme"]').count() > 0, "The agency/programme column is missing"
        assert flow.locator("path.flow-link").count() > 25, "Budget connections are missing"
        check_label_spacing(flow)
        check_amount_geometry(flow)
        assert flow.locator("rect").evaluate_all(
            "els => els.every(el => ['x','y','width','height'].every(attr => "
            "Number.isFinite(Number(el.getAttribute(attr)))) && "
            "Number(el.getAttribute('width')) > 0 && Number(el.getAttribute('height')) > 0)"
        ), "A rendered category has invalid geometry"

        search = page.get_by_role("searchbox", name="Search budget categories")
        search.fill("COE")
        expect(page.locator("#search-status")).to_contain_text("matching categor")
        expect(flow.locator('[data-node-id="fees-and-charges"]')).not_to_have_class(re.compile("is-muted"))
        for query, focus_id, programme_name in (
            ("HDB", "social-development:national-development", "Public Housing Development"),
            ("LTA", "economic-development:transport", "Land Transport Authority"),
        ):
            search.fill(query)
            expect(ministry_picker).to_have_value(focus_id)
            programme = page.get_by_test_id("budget-flow").get_by_role(
                "button", name=re.compile(f"^{re.escape(programme_name)}:")
            )
            expect(programme).to_be_visible()
            expect(programme).not_to_have_class(re.compile("is-muted"))
            check_label_spacing(page.get_by_test_id("budget-flow"))
            check_amount_geometry(page.get_by_test_id("budget-flow"))
        search.fill("health")
        expect(page.locator("#search-status")).to_contain_text("matching categor")
        expect(flow.get_by_role("button", name=re.compile(r"^Health:"))).not_to_have_class(re.compile("is-muted"))
        search.fill("no-such-budget-category-123")
        expect(page.locator("#search-status")).to_contain_text("No matching category")
        page.get_by_role("button", name="Clear search", exact=True).click()
        expect(search).to_have_value("")

        revenue = flow.locator('[data-role="revenue"]').first
        revenue.focus()
        revenue.press("Enter")
        detail = page.get_by_role("complementary", name="Selected category details")
        expect(detail).to_be_visible()
        expect(detail).to_contain_text("REVENUE")
        expect(detail).not_to_contain_text(re.compile(r"Official programme", re.I))
        page.get_by_role("button", name="Close category details").click()

        health = flow.get_by_role("button", name=re.compile(r"^Health:"))
        health.focus()
        health.press("Enter")
        expect(detail).to_be_visible()
        expect(detail.get_by_role("heading", name="Health", exact=True)).to_be_visible()
        expect(health).to_have_attribute("aria-pressed", "true")
        expect(detail.get_by_role("link", name="Official source")).to_have_attribute(
            "href", re.compile(r"^https://(?:cms\.)?singaporebudget\.gov\.sg/")
        )
        page.get_by_role("button", name="Close category details").click()
        expect(detail).to_be_hidden()
        expect(health).to_have_attribute("aria-pressed", "false")
        expect(ministry_picker).to_have_value("social-development:health")
        check_label_spacing(page.get_by_test_id("budget-flow"))
        check_amount_geometry(page.get_by_test_id("budget-flow"))

        page.get_by_role("button", name="Ministries", exact=True).click()
        ministry_count = page.get_by_test_id("budget-flow").locator("[data-node-id]").count()
        assert ministry_count < initial_count
        expect(ministry_picker).to_be_hidden()
        page.get_by_role("button", name="Sectors", exact=True).click()
        expect(page.get_by_role("button", name="Sectors", exact=True)).to_have_attribute("aria-pressed", "true")
        assert page.get_by_test_id("budget-flow").locator("[data-node-id]").count() < ministry_count
        check_label_spacing(page.get_by_test_id("budget-flow"))
        check_amount_geometry(page.get_by_test_id("budget-flow"))
        page.get_by_role("button", name="Ministries", exact=True).click()
        assert page.get_by_test_id("budget-flow").locator("[data-node-id]").count() == ministry_count

        page.get_by_role("button", name="Agencies & programmes", exact=True).click()
        expect(ministry_picker).to_be_visible()
        for focus_id in ("social-development:education", "security-external-relations:home-affairs"):
            ministry_picker.select_option(focus_id)
            selected_sector, selected_ministry = focus_id.split(":", 1)
            ministry_data = next(
                ministry for sector in dataset["sectors"] if sector["id"] == selected_sector
                for ministry in sector["ministries"] if ministry["id"] == selected_ministry
            )
            updated_flow = page.get_by_test_id("budget-flow")
            assert updated_flow.locator('[data-role="programme"]').count() == len(ministry_data["children"])
            check_label_spacing(updated_flow)
            check_amount_geometry(updated_flow)
        police = page.get_by_test_id("budget-flow").get_by_role("button", name=re.compile(r"^Police:"))
        police.focus()
        police.press("Enter")
        expect(detail.get_by_role("heading", name="Police", exact=True)).to_be_visible()
        expect(detail).to_contain_text("OFFICIAL BUDGET PROGRAMME")
        expect(detail).to_contain_text("P-C")
        page.keyboard.press("Escape")
        expect(detail).to_be_hidden()

        page.get_by_role("button", name="Data table", exact=True).click()
        table = page.get_by_role("table")
        expect(table).to_be_visible()
        expect(page.get_by_test_id("budget-flow")).to_be_hidden()
        expect(page.get_by_role("button", name="Ministries", exact=True)).to_be_disabled()
        table_values = table.locator("tbody tr").evaluate_all(
            "rows => rows.map(row => { const c = row.querySelectorAll('td'); "
            "return [c[1].childNodes[0].textContent, c[2].textContent.replaceAll(',', '')]; })"
        )
        assert len(table_values) > 25, "The exact-value data table is incomplete"
        for sector in dataset["sectors"]:
            for ministry in sector["ministries"]:
                for programme in ministry.get("children", []):
                    row_id = f"{sector['id']}:{ministry['id']}:{programme['id']}"
                    row = table.locator(f'tr[data-row-id="{row_id}"]')
                    expect(row).to_have_count(1)
                    assert int(row.locator("td").nth(2).inner_text().replace(",", "")) == programme["amount"], (
                        f"Programme {row_id} is missing or its exact table value is wrong"
                    )
        search.fill("health")
        expect(table.get_by_role("row").filter(
            has=page.get_by_role("cell", name="Health", exact=True)
        )).not_to_have_class(re.compile("table-muted"))
        page.get_by_role("button", name="Clear search", exact=True).click()

        with page.expect_download() as downloaded:
            page.get_by_role("button", name="Download budget data as CSV").click()
        download = downloaded.value
        assert download.suggested_filename == f"singapore-budget-{fiscal_year}.csv"
        csv_text = Path(download.path()).read_text(encoding="utf-8-sig")
        csv_rows = list(csv.DictReader(io.StringIO(csv_text)))
        assert [(row["Budget line"], row["Amount SGD"]) for row in csv_rows] == [
            tuple(row) for row in table_values
        ], "The CSV differs from the exact values shown in the data table"
        assert all(row["Fiscal year"] == fiscal_year for row in csv_rows)
        page.get_by_role("button", name="Flow diagram", exact=True).click()
        expect(page.get_by_test_id("budget-flow")).to_be_visible()
        expect(table).to_be_hidden()

        page.get_by_text("How do the calculations reconcile?", exact=True).click()
        expect(page.locator("#rounding-explanation")).to_be_visible()

        # A wide flow diagram may scroll within its own labelled container;
        # the page itself must still fit a phone screen.
        assert page.evaluate(
            "document.documentElement.scrollWidth <= window.innerWidth + 1"
        ), f"The {name} page overflows the viewport horizontally"
        assert not errors, f"Browser errors on {name}: {errors}"
        page.evaluate("window.scrollTo(0, 0)")
        page.locator("#flow-view").evaluate("el => { el.scrollLeft = 0; }")
        page.locator("body").evaluate("() => document.activeElement?.blur()")
        page.mouse.move(0, 0)
        page.screenshot(path=str(artifacts / f"budget-{name}.png"), full_page=True)
        page.screenshot(path=str(artifacts / f"budget-{name}-viewport.png"))
        print(f"PASS {name}: rendering, amount geometry, search, keyboard selection, detail levels, table, CSV, methodology, and viewport fit")
    except BaseException:
        page.screenshot(path=str(artifacts / f"budget-{name}-failure.png"), full_page=True)
        raise
    finally:
        context.close()



def check_failed_script_fallback(browser, url: str):
    """Reproduce the white-screen trigger: the published entry script is missing."""
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    try:
        page.route("**/assets/*.js", lambda route: route.fulfill(status=404, body="missing", content_type="text/javascript"))
        page.goto(url, wait_until="networkidle")
        expect(page.get_by_role("heading", name="Singapore Budget", exact=True)).to_be_visible()
        expect(page.get_by_role("link", name="read the official budget")).to_be_visible()
        assert not page.get_by_test_id("budget-flow").count(), "The failure probe did not block the entry script"
        print("PASS missing-script fallback: useful content remains instead of a blank page")
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
            check_page(browser, args.url, args.artifacts, "wide", 1920, 1080)
            check_page(browser, args.url, args.artifacts, "mobile", 390, 844)
            check_failed_script_fallback(browser, args.url)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
