# Singapore Budget data

The default dataset is **FY2026, Estimated**, presented to Parliament on **12 February 2026**, covering **1 April 2026–31 March 2027**. Sources were retrieved on 19 October 2026. This is the latest annual Budget publication; it is a Budget Day vintage, not a running forecast or actual expenditure. April and July 2026 support packages are later announcements and have not been mixed into the February estimates.

## Authoritative sources

- [MOF Revenue and Expenditure landing page](https://www.mof.gov.sg/singaporebudget/revenue-and-expenditure).
- [Revenue and Expenditure Estimates FY2026/2027](https://cms.singaporebudget.gov.sg/assets/031bf134-5b42-4668-80e2-8743b0fe6c97): printed pp. 1–4 for exact operating revenue; p. 10 for operating/development expenditure by sector and ministry; the programme tables listed below for exact programme detail; pp. 241 and 444 for exact direct special transfers and aggregate fund top-ups.
- [Analysis of Revenue and Expenditure FY2026](https://cms.singaporebudget.gov.sg/assets/032683cb-4369-4671-a58b-1844e5630ba1): Table 3.1a, printed p. 24, for independently rounded fiscal aggregates; Table 3.2a, p. 26, for revenue cross-checks; Table 2.4, p. 20, for fund top-ups.
- [MOF Government Operating Revenue on data.gov.sg](https://data.gov.sg/datasets/d_d6cd701a67607ac9d4f3d469d8c815e5/view) and [Government Fiscal Position](https://data.gov.sg/datasets/d_0f0800a6b2b4b391daffcd88b2cc97fd/view). The importer cross-checks every current-year/basis revenue type and fiscal aggregate against their snapshots. Those datasets publish S$ million; the PDF contains greater precision for revenue and ministry expenditure.

The source PDFs and API responses are committed in `data/sources/`. The annual manifest `data/config/2026.json` pins their SHA256 checksums and identifies each source row. No API key or other credential is stored in the dataset or sent to the browser. These public endpoints did not require the available data.gov.sg key.

## Granularity and accounting

The overview uses 15 revenue categories and four official expenditure sectors. Expanding a sector exposes its ministry portions, and ministry detail exposes **129 official budget programmes** covering all 20 ministry-sector portions. These are the categories from MOF's expenditure summary and programme tables, rather than a mix of ministry appropriations and outlays. The summary excludes loans, land-related transactions, and other non-expenditure outlays.

Revenue is pooled. The Sankey does not claim a tax is earmarked to a particular ministry. Revenue comprises operating revenue plus the Net Investment Returns Contribution (NIRC). Land sales, gross investment income, borrowing, and CPF contributions are not added to operating revenue.

Manpower appears in two sectors. Its social portion is the Financial Security for Singaporeans programme; the economic portion is separate. Digital Development and Information appears in three sectors, reflecting the MOF programme split. A repeated ministry name is not a duplicated whole-ministry allocation.

### Official programme detail

The programme tier comes directly from the **Total Expenditure by Programme** tables in the full Estimates PDF. Each line publishes running costs, transfers, operating expenditure, development expenditure and total expenditure. The importer uses the exact operating/development/total columns, verifies `running costs + transfers = operating` and `operating + development = total`, and matches every line to a ministry-sector portion. No residual or inferred programme is introduced.

Programme allocations are government budget lines, **not an agency’s complete financial statements**. For example, the Land Transport Authority Programme is S$5,519,709,600 of development expenditure and zero operating expenditure in this table, while the Ministry of Transport Administration Programme includes S$10,520,269,400 of other transport spending. The chart therefore calls the tier official programmes; it does not claim the first number is LTA’s whole budget. Likewise, the Public Housing Development Programme is not HDB’s complete expenditure or accounts.

The source sometimes retains a broad programme: National Defence, Foreign Affairs, and Health Services have no invented breakdown into armed-service branches, embassies or individual hospitals. Programmes such as Police, Civil Defence, Immigration and Checkpoint Control, National Environment Agency, universities and polytechnics retain their individual published lines.

| Ministry or sector portion | Programmes | Printed source page |
| --- | ---: | --- |
| Health | 3 | 126 |
| Education | 27 | 81 |
| National Development | 7 | 185 |
| Social and Family Development | 4 | 60 |
| Sustainability and the Environment | 4 | 96 |
| Culture, Community and Youth | 14 | 232 |
| Manpower · Social development | 1 | 176 |
| Digital Development and Information · Social development | 3 | 157 |
| Defence | 1 | 70 |
| Home Affairs | 9 | 139 |
| Foreign Affairs | 1 | 118 |
| Transport | 4 | 220 |
| Trade and Industry | 10 | 209 |
| Manpower · Economic development | 3 | 176 |
| Digital Development and Information · Economic development | 2 | 157 |
| Finance | 5 | 108 |
| Organs Of State | 10 | 18, 23, 28, 34, 39, 44, 50, 54 |
| Prime Minister's Office | 9 | 199 |
| Digital Development and Information · Government administration | 2 | 157 |
| Law | 10 | 167 |

The same MDDI or Manpower programme cannot appear twice across sectors. The social Manpower portion owns `S-Q`; its economic portion owns `S-R`, `S-S` and `S-T`. MDDI social owns `Q-A`, `Q-B`, `Q-J`; economic owns `Q-S`, `Q-T`; government administration owns `Q-U`, `Q-V`. These mappings reconcile exactly to the corresponding page 10 sector totals. Organs of State contains the ten programmes under Heads A–H.

Every ministry’s `children` array carries programme `id`, `kind: "programme"`, `label`, full official `sourceLabel`, `sourceCode`, printed `sourcePage`, `sourceId`, `amount`, `operating`, `development`, `runningCosts`, `transfers` and publication `precision`. The annual config holds reviewed programme codes, source labels and locators separately from the parser. `programmeCount` provides a generated completeness control. The small numeric programme code `K-1` (University of the Arts Singapore) is included.

Special transfers are separate from ministry expenditure and include statutory/trust fund top-ups. The dashboard does not also add later spending out of those funds, which would double count the same funding. Transfers to Singaporeans and businesses are kept at one exact category; the published rounded household/business and voucher subcategories are not presented as exact dollar subdivisions.

Fees and charges include vehicle quota premiums (COE). Their combined precise total avoids introducing an artificial rounding adjustment solely to split COE into a standalone rounded category. The 2026 chart-of-accounts changes also mean that FY2025/FY2026 fees and other operating revenue cannot be compared without adjusting the scope.

## Exact amounts and publication rounding

All machine amounts are safe integers in Singapore dollars. No floating point billion values enter the accounting. Display labels in billions and percentages are rounded only for presentation.

| Item | Source amount used (SGD) | Publication precision |
| --- | ---: | --- |
| Operating revenue | 134,753,943,000 | 1,000 |
| NIRC | 28,482,000,000 | 1,000,000 |
| Ministry expenditure | 137,323,443,300 | 100 |
| Operating expenditure | 103,269,171,800 | 100 |
| Development expenditure | 34,054,271,500 | 100 |
| Direct special transfers | 2,836,175,400 | 100 |
| Fund top-ups | 18,900,000,000 | 100 (aggregate); individual fund allocations are published in S$ million |
| Official overall budget surplus | 4,176,000,000 | 1,000,000 |
| Published-rounding reconciliation | 324,300 | Calculated difference; not spending |

NIRC and the budget balance are only published to the nearest S$1 million in the sources used. Mixing those rounded figures with the more precise revenue/expenditure figures leaves **S$324,300**. This is explicitly stored as `reconciliation`, with `includedInSpending: false` and `role: "reconciliation"`. It is not allocated to a ministry, counted in spending shares, or described as spending. The independently rounded official surplus is preserved.

```
134,753,943,000 + 28,482,000,000
= 137,323,443,300 + 21,736,175,400 + 4,176,000,000 + 324,300
  ministry expenditure   special transfers  surplus       rounding
```

`totals.totalRevenue` is a calculated visualization input using the published NIRC, not an assertion that MOF published an exact dollar NIRC or total revenue. `precision` records the precision of each total. `publishedRoundedTotals` preserves the unmodified S$ million fiscal table.

The **overall budget surplus** differs from the **overall fiscal position** because of SINGA capitalisation and financing adjustments:

```
4,176m budget surplus + 5,019m capitalisation
− 0m depreciation − 652m SINGA interest and loan expenses
= 8,543m overall fiscal position
```

Capitalisation is an accounting adjustment, not another revenue source. The overview uses the budget balance before this adjustment. The separate bridge explains the overall fiscal position without double counting infrastructure spending. Principal debt repayments are not included as ministry spending.

## Reproduce and refresh

Normal builds use the committed generated JSON and do not call external services:

```sh
npm run data:validate
npm test
npm run build
```

The importer needs Python 3 and Poppler (`pdftotext`; on Debian/Ubuntu: `apt-get install poppler-utils`). Python dependencies are standard-library only.

```sh
# Recreate the JSON from the pinned local source snapshots.
python scripts/import_budget.py --config data/config/2026.json

# Confirm the annual dataset and year index exactly match the pinned source/config.
python scripts/import_budget.py --config data/config/2026.json --check

# Refetch sources and require the same SHA256 pins before writing output.
python scripts/import_budget.py --config data/config/2026.json --fetch
```

An HTTP response, checksum change, unknown label, missing year/basis, new/unaccounted revenue type, incomplete sector/programme row, duplicate or unmapped programme code, a programme table that fails to sum, or cross-source disagreement fails the import. A changed upstream API snapshot is not silently accepted; inspect it before changing a checksum. PDF parsing assumes the known MOF four-year revenue table and operating/development/total expenditure columns. If their format changes, update the parser based on the new table, rather than guessing.

## Next annual Budget

1. Copy `data/config/2026.json` to `data/config/2027.json`. Set the actual fiscal year, Budget date, financial-year boundaries, retrieval date, and vintage note. Keep `basis: "Estimated"`; do not substitute revised FY2026 values for estimated FY2027.
2. Get the new official annual Analysis and Estimates PDFs from MOF, save them under distinct `data/sources/fy2027-*.pdf` filenames, and update manifest URLs, file paths, and SHA256 pins. Download new data.gov.sg snapshots under distinct annual filenames when they contain FY2027. Never overwrite the FY2026 source snapshots.
3. Review labels, revenue codes, ministry restructuring and the sector programme splits. Update `revenue`, `sectors`, `programmes`, each ministry’s `programmeCodes`, `fiscalItems`, `fundTopups`, and printed-page `locators` in the new config. The importer checks configured top-up amounts against the PDF.
4. Run the importer with the new config, then `npm run data:validate`. The output is `public/data/budget-2027.json`; the importer also regenerates `public/data/index.json` from all annual budget files, ordered newest first. Source checksum changes and new classifications require review; `--fetch` is designed to reject unpublished/unreviewed changes.
5. Update independent adversarial audit fixtures under `tests/` by reading the new original sources independently of the importer. Check every revenue, ministry and programme leaf (including its source code and printed page), every programme-to-sector mapping, all aggregates, publication precision, the surplus bridge and graph conservation. Keep FY2026 fixtures intact.
6. The frontend reads the generated annual index and defaults to its newest year, so no frontend source edit is needed to add FY2027. Preserve old files and their vintage labels for reproducibility. Run tests, the production build and browser checks before publishing through GitHub Pages.

The annual workflow deliberately requires review of the source manifest and independent audit fixtures. It does not automatically declare an unreviewed API response to be the new Budget.
