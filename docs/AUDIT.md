# Independent adversarial accounting audit

Audit date: 19 October 2026. This report records an independent check against the Ministry of Finance publications, rather than relying only on the application's transformation code. Automated checks supplement this audit; they do not guarantee that future source data are correct.

## Authoritative vintage and scope

The latest annual budget is **Budget 2026**, presented on **12 February 2026**, for **1 April 2026 to 31 March 2027**. These are the original Budget Day estimates, not final spending or the revised estimates that will accompany Budget 2027.

Primary evidence:

- [MOF Revenue and Expenditure page](https://www.singaporebudget.gov.sg/revenue-and-expenditure).
- [Analysis of Revenue and Expenditure, FY2026](https://cms.singaporebudget.gov.sg/assets/032683cb-4369-4671-a58b-1844e5630ba1), especially printed pages 13–20 and Tables 3.1a, 3.2a and 3.3 on printed pages 24, 26 and 28.
- [Revenue and Expenditure Estimates FY2026/2027](https://cms.singaporebudget.gov.sg/assets/031bf134-5b42-4668-80e2-8743b0fe6c97), revenue estimates on printed pages 1–4 and the expenditure-by-sector table on printed page 10. These provide dollar figures where the analysis document rounds to millions.
- [Subsequent April/July support announcements](https://www.singaporebudget.gov.sg/enhanced-support). The official page describes approximately S$2 billion of additional support across these packages. Do not simply add this headline amount to the original fiscal table: it includes changes in tax relief and timing, and no complete revised annual fiscal table is supplied there.

## Independent control totals

The following numbers are **S$ million**, as published in Table 3.1a of the analysis document. Parentheses in that table denote a negative figure.

| Measure | FY2026 estimate |
| --- | ---: |
| Operating revenue | 134,754 |
| Operating expenditure | 103,269 |
| Development expenditure | 34,054 |
| Total ministry expenditure | 137,323 |
| Primary balance | −2,570 |
| Direct special transfers, excluding fund top-ups | 2,836 |
| Top-ups to statutory and trust funds | 18,900 |
| Total special transfers, including top-ups | 21,736 |
| Basic balance | −5,406 |
| Net Investment Returns Contribution (NIRC) | 28,482 |
| Overall budget surplus | 4,176 |
| SINGA infrastructure capitalisation | 5,019 |
| Infrastructure depreciation | 0 |
| SINGA interest costs and loan expenses | 652 |
| Overall fiscal surplus | 8,543 |

The dollar-precision expenditure table independently gives operating expenditure **S$103,269,171,800**, development expenditure **S$34,054,271,500**, and ministry expenditure **S$137,323,443,300**. The revenue estimates give operating revenue **S$134,753,943,000**. Direct special transfers are **S$2,836,175,400** in the Head Z summary. Fund top-ups total **S$18,900,000,000**.

## Accounting identities and precision

Use these identities with the precision of the source, not an arbitrary floating-point tolerance:

1. Operating revenue − ministry expenditure = primary balance.
2. Primary balance − direct special transfers = basic balance.
3. Basic balance − fund top-ups + NIRC = overall budget balance.
4. Overall budget balance + capitalisation − depreciation − SINGA interest and loan expenses = overall fiscal position.

The published rounded figures do not always sum exactly. For example, 134,754 − 137,323 equals −2,569, while MOF reports the primary balance as −2,570. This is a rounding consequence, not permission to change MOF's published balance.

NIRC and official budget/fiscal balances are available only to the nearest S$1 million in the selected source. Combining exact-dollar revenue, ministry expenditure and transfers with NIRC of S$28,482 million produces a calculated budget balance of **S$4,176,324,300**. The published official balance is **S$4,176 million**. A graph that preserves the published balance must expose the **S$324,300** difference as a rounding reconciliation, exclude it from expenditure, and explain that it arises from mixed source precision. It must not invent a programme to absorb the difference or suggest that NIRC is known to the dollar.

SINGA must remain a separate bridge between the budget balance and fiscal position. Capitalisation is an accounting adjustment that removes qualifying infrastructure cost from the fiscal measure, not another tax or reserve-income receipt.

## Double-counting traps

- Ministry expenditure already includes operating plus development expenditure. Do not add those three totals together.
- Special transfers already include statutory/trust fund top-ups. Show either their parent or their non-overlapping children in any total.
- Fund top-ups are transfers into funds. Spending from those funds, separately reported as S$13,714 million, is not another addition to this budget accounting flow.
- Vehicle quota premiums (COE) are included in the displayed aggregate fees-and-charges revenue category. Do not add a separate COE node on top of that aggregate. MOF's headline revenue table instead shows COE separately alongside fees excluding COE; these are alternative non-overlapping presentations.
- Manpower and Digital Development and Information appear in several expenditure sectors. Keep their sector-specific values distinct; a ministry search can highlight multiple nodes without counting duplicate ministry totals.
- NIRC is a budget contribution from investment returns, not the entire return on Singapore's reserves. Land-sale capital receipts and ordinary borrowing are not operating revenue.
- Full estimates outlays include public debt principal, financial investments, land-related items and other amounts outside ministry expenditure. Their S$513 billion gross outlays total is not the ministry spending total used here.
- From FY2026, a new public-sector chart of accounts changes some revenue-category scopes. Fees and charges and other revenue should not receive unqualified year-on-year claims against FY2025.

## Release gate

Before release, check independently anchored figures, integer units, hierarchy sums, non-overlapping graph links, official versus computed balances, source precision, and the SINGA bridge. Review labels and tooltips as well as numerical tests: a conserved graph can still tell a false accounting story. Run this audit suite on every build and deployment, and repeat source verification when adding a new annual vintage.

The independent FY2026 audit suite in `tests/audit-budget.test.mjs` checks every displayed revenue category, all 20 ministry/programme portions (operating, development and total), four sector totals, five fund allocations, 15 fiscal controls, document hashes, both graph detail levels, exact link conservation, and the table's percentage denominators. It also deliberately introduces eight accounting corruptions and verifies that the release validator rejects them. These controls are transcribed independently from the original publications; they must not be regenerated by the importer being checked.

The source and graph audit found no numerical errors in the generated FY2026 dataset. The release review identified and corrected minimum-width inflation of the tiny rounding flow, omitted programme-scope notes, an ambiguous NIRC share denominator, CSV source attribution, and inconsistent arithmetic caused by rounding the displayed fiscal bridge to two decimal places in billions. The reviewed renderer uses actual flow widths, keeps programme notes attached to repeated ministry portions, labels NIRC's combined-resources share base, and preserves CSV source publications. The bridge now displays **S$4.176b + S$5.019b − S$0.652b = S$8.543b**; a regression check parses those displayed terms back into million-dollar integers and verifies the equation. Correct underlying data do not by themselves make a correct visual explanation.
