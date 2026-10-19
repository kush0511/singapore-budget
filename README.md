# Singapore Budget, visualised

An interactive, source-linked flow of **Singapore Budget 2026 estimates**, from operating revenue and the Net Investment Returns Contribution (NIRC) to spending sectors, ministry portions, and 129 official programme allocations. Inspired by [USAFacts](https://usafacts.org/government-spending/), adapted to Singapore’s budget accounting.

**Live site:** [kush0511.github.io/singapore-budget](https://kush0511.github.io/singapore-budget/)

## Explore

- Switch between sectors, ministries, and agencies/programmes. Select a ministry or use the ministry selector to reveal its official programme allocations; search categories, including GST and COE.
- Select or keyboard-focus a flow block for its exact amount, scope, source code and official PDF page. The red-and-ivory civic masthead, Singapore flag and broad saturated blocks foreground the budget rather than a dashboard template.
- Open the accessible data table or download a CSV / source-linked JSON dataset.
- Read the separate bridge from overall budget balance to overall fiscal position.
- On phones, scroll within the diagram; the rest of the page fits the viewport.

## Run locally

Requires Node.js 22+, Python 3.12+, and Poppler (`pdftotext`) for source import checks.

```sh
npm ci
npm run dev
```

```sh
npm run build       # independent accounting tests + structural validation + static build
npm run preview
npm run data:validate
npm run data:refresh
python scripts/import_budget.py --config data/config/2026.json --check
```

Optional real-browser checks:

```sh
python -m pip install playwright==1.58.0
python -m playwright install chromium
python tests/browser_smoke.py --serve --artifacts artifacts
```

## Data and accounting

This is the **12 February 2026 Budget Day vintage**, for 1 April 2026–31 March 2027. Later support announcements are not incorporated into a partial, mixed-vintage revision. These are estimates, not actual outturns. Sources were retrieved on 19 October 2026.

The primary evidence is MOF’s detailed estimates and fiscal analysis, cross-checked against MOF’s data.gov.sg datasets. Official documents and data snapshots are pinned with hashes in `data/sources/`. Public API reads used for this release did not require a key; no API credentials are shipped to browsers or committed.

All calculations retain integer SGD amounts at their source precision. NIRC and fiscal balances are published to S$1 million; a **S$324,300 published-rounding reconciliation**, explicitly excluded from spending, reconciles those with the detailed estimates. The official S$4.176 billion overall budget surplus is preserved. The separate overall fiscal position is S$8.543 billion.

Receipts enter a common pool. The graphic does not trace or earmark individual taxes to particular ministries. Special transfers, fund top-ups, SINGA adjustments, and programme portions are kept explicit to avoid double-counting. The deeper tier consists of official programme allocations, not assumed whole-agency budgets. For example, an LTA-labelled programme is not LTA’s full funding, and the Defence/MFA tables do not publish an internal departmental split.

See [data definitions and annual update guide](docs/DATA.md) and the [independent adversarial audit](docs/AUDIT.md).

## Updating next year

Add the new official source configuration, import it, and review its source anchors and accounting tests. The importer builds `public/data/index.json` automatically; the year selector discovers the new dataset. The frontend and visual layout are shared between years. Changes to source formats, classifications, or accounting definitions require an explicit parser/audit update; failures must not be papered over.

## Deployment

In repository **Settings → Pages → Build and deployment**, select **Source: GitHub Actions**. Do not publish the `main` branch directly: its HTML is a Vite source template, not the compiled site. The workflow publishes `dist/`.

Push to `main` to run the GitHub Pages workflow. Publication is gated on deterministic source regeneration, independent accounting tests (including deliberately corrupted inputs), dataset validation, and desktop/mobile browser checks. After deployment, the same interaction and calculation checks run against the actual public URL. Browser screenshots are retained as CI artifacts. The HTML also provides readable fallback content if the entry script cannot load. The build is static; there is no server, database, runtime API key, or paid hosting dependency.

The Vite base is relative, so the build works under a GitHub Pages project path. To use another repository, update the project links in `src/main.js` and this README.

## Structure

- `data/config/`: reviewed annual source mappings
- `data/sources/`: pinned official source evidence
- `scripts/import_budget.py`: deterministic annual extraction and public index
- `scripts/validate-data.mjs`: release accounting invariants
- `public/data/`: generated versioned browser datasets
- `src/model.js`: pure integer-SGD graph and table model
- `src/chart.js`: broad-block Sankey renderer with a common dollar scale
- `src/main.js`, `src/style.css`: responsive, build-time-only frontend
- `tests/audit-budget.test.mjs`: independently transcribed source controls and graph checks
- `tests/browser_smoke.py`: real-browser interaction and layout checks
- `.github/workflows/pages.yml`: validated GitHub Pages deployment

Independent project; not affiliated with the Singapore Government or USAFacts. Source materials retain their original ownership and terms.
