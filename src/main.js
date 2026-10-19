import { tableRows, formatBridgeAmount } from "./model.js";
import { renderBudgetChart, nodeColour } from "./chart.js";
import "./style.css";

const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = new Intl.NumberFormat("en-SG");
const exact = (n) => `S$${fmt.format(n)}`;
const money = (n) => `S$${(n / 1e9).toFixed(2)}b`;
const percentage = (n, d) => `${((n / d) * 100).toFixed(1)}%`;
const date = (v) =>
  new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(`${v}T00:00:00Z`));
const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${{ search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>', expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>', arrow: '<path d="M5 19 19 5M5 5h14v14"/>' }[name] || ""}</svg>`;
function flag() {
  return `<svg class="sg-flag" viewBox="0 0 60 40" aria-label="Singapore flag" role="img"><path fill="#fff" d="M0 0h60v40H0z"/><path fill="#df2237" d="M0 0h60v20H0z"/><circle fill="#fff" cx="11" cy="10" r="7"/><circle fill="#df2237" cx="14" cy="8.7" r="6"/><g fill="#fff"><path id="star" d="m24 3 1 2.6 2.8.2-2.2 1.8.6 2.7L24 8.8l-2.2 1.5.6-2.7-2.2-1.8 2.8-.2z"/><use href="#star" x="-5" y="5"/><use href="#star" x="5" y="5"/><use href="#star" x="-3" y="11"/><use href="#star" x="3" y="11"/></g></svg>`;
}
const state = {
  budget: null,
  detail: "departments",
  focus: "security-external-relations:home-affairs",
  view: "flow",
  query: "",
  selected: null,
  chart: null,
};
$("#app").innerHTML =
  '<p class="loading" role="status">Loading Singapore Budget figures…</p>';

async function init() {
  const registryResponse = await fetch(
    `${import.meta.env.BASE_URL}data/index.json`,
  );
  if (!registryResponse.ok)
    throw new Error("The budget index could not be loaded.");
  const entries = await registryResponse.json();
  const requested = new URLSearchParams(location.search).get("year");
  const entry = entries.find((e) => String(e.year) === requested) || entries[0];
  const response = await fetch(`${import.meta.env.BASE_URL}data/${entry.file}`);
  if (!response.ok) throw new Error("The budget dataset could not be loaded.");
  state.budget = await response.json();
  const ministries = state.budget.sectors.flatMap((s) =>
    s.ministries.map((m) => `${s.id}:${m.id}`),
  );
  if (!ministries.includes(state.focus)) state.focus = ministries[0];
  render(entries);
  draw();
  wire();
}
function render(entries) {
  const b = state.budget,
    t = b.totals,
    resources = t.operatingRevenue + t.nirc;
  document.title = `Singapore Budget ${b.fiscalYear} — Follow the public money`;
  $("#app").innerHTML = `
  <header class="masthead paper-shell"><a class="wordmark" href="#" aria-label="Singapore Budget home">${flag()}<span>SINGAPORE<br><b>BUDGET</b></span></a><nav aria-label="Main navigation"><a href="#explore">The money trail</a><a href="#methodology">Sources & notes</a><a href="https://github.com/kush0511/singapore-budget" target="_blank" rel="noopener">Open workings </a></nav><span class="independent">AN INDEPENDENT<br>PUBLIC DATA PROJECT</span></header>
  <main>
  <section class="intro paper-shell" aria-labelledby="page-title"><div class="intro-title"><p class="edition">FY${b.fiscalYear} / BUDGET DAY ESTIMATES</p><h1 id="page-title">The Singapore Budget.</h1><p class="standfirst">From the taxes we pay to the services we use. Follow the allocations, right down to the official programmes.</p></div><div class="year-block"><label for="budget-year">CHOOSE A FINANCIAL YEAR</label><select id="budget-year" aria-label="Fiscal year">${entries.map((e) => `<option value="${e.year}" ${e.year === b.fiscalYear ? "selected" : ""}>${esc(e.label)}</option>`).join("")}</select><p>${date(b.period.start)} — ${date(b.period.end)}<br>Presented ${date(b.budgetDate)}</p></div></section>
  <section class="ledger paper-shell" aria-label="Budget at a glance">
    ${ledger("OPERATING REVENUE", t.operatingRevenue, "Taxes, fees & other receipts", "revenue")}
    ${ledger("INVESTMENT CONTRIBUTION", t.nirc, "NIRC · from investing the reserves", "investment")}
    ${ledger("MINISTRY EXPENDITURE", t.totalExpenditure, "Operating + development", "spending")}
    ${ledger("SPECIAL TRANSFERS", t.specialTransfers, "Direct support + top-ups to funds", "transfers")}
    ${ledger(t.overallBudgetBalance >= 0 ? "BUDGET SURPLUS" : "BUDGET DEFICIT", Math.abs(t.overallBudgetBalance), "Before infrastructure adjustments", "balance")}
  </section>
  <section id="explore" class="explorer" aria-labelledby="explore-title"><div class="flow-shell">
    <div class="explorer-heading"><div><span class="section-number">01 / THE MONEY TRAIL</span><h2 id="explore-title">${money(resources)} in. Follow it through.</h2></div><div class="segmented view-switch" role="group" aria-label="View"><button id="view-flow" aria-pressed="true">Flow diagram</button><button id="view-table" aria-pressed="false">Data table</button></div></div>
    <div class="toolbar"><div class="detail-controls"><span class="control-label">SHOW</span><div class="segmented" role="group" aria-label="Detail level"><button id="detail-sectors" aria-pressed="false">Sectors</button><button id="detail-ministries" aria-pressed="false">Ministries</button><button id="detail-departments" aria-pressed="true">Agencies & programmes</button></div></div><div class="tools"><div class="search">${icon("search")}<input id="search" type="search" aria-label="Search budget categories" placeholder="Find GST, Police, housing…" autocomplete="off"><button id="clear-search" aria-label="Clear search" hidden>×</button></div><button id="download-csv" class="download" aria-label="Download budget data as CSV">${icon("download")} CSV</button><button id="fullscreen" class="expand" aria-label="Expand flow diagram">${icon("expand")}</button></div></div>
    <div class="focus-controls" id="focus-controls"><label for="explore-ministry">EXPLORE A MINISTRY</label><select id="explore-ministry" aria-label="Explore ministry">${b.sectors.map((s) => `<optgroup label="${esc(s.label)}">${s.ministries.map((m) => `<option value="${esc(s.id + ":" + m.id)}" ${state.focus === s.id + ":" + m.id ? "selected" : ""}>${esc(m.label)}${/^(manpower|digital)-/.test(m.id) ? ` (${esc(s.label)})` : ""}</option>`).join("")}</optgroup>`).join("")}</select><p id="programme-scope"></p><span class="flow-hint">Select any ministry block to open its programmes →</span></div>
    <div class="search-status" id="search-status" role="status" aria-live="polite"></div>
    <div id="chart-frame" class="chart-frame"><div id="flow-view" class="chart-scroll" role="region" aria-label="Interactive budget flow diagram" tabindex="0"></div><div id="table-view" class="table-wrap" hidden></div></div>
    <div class="chart-caption"><p><span class="legend-dot revenue"></span>Revenue <span class="legend-dot investment"></span>NIRC <span class="legend-dot spending"></span>Allocations &nbsp; / &nbsp; Block height and flow width show the same dollar scale.</p><p id="chart-footnote"></p></div>
    <aside id="selection-detail" class="detail" aria-label="Selected category details" aria-live="polite" hidden></aside>
    <p class="pool-note">All receipts enter a common budget. This diagram does not earmark an individual tax to a ministry. Programme allocations are government budget lines; agency-named lines may cover only part of an agency’s funding.</p>
  </div></section>
  <section class="notes paper-shell" id="methodology" aria-labelledby="methodology-title"><div class="accounting"><span class="section-number">02 / THE BALANCE</span><h2>Two ways to read the balance.</h2><p class="notes-intro">The budget surplus and the overall fiscal position are different official measures. The infrastructure adjustments connect them.</p><div class="balance-equation">
    ${bridge("Overall budget balance", t.overallBudgetBalance, "")}
    ${bridge("Capitalisation of nationally significant infrastructure", t.capitalisation, "+")}
    ${bridge("SINGA interest / loan expenses" + (t.depreciation ? " + depreciation" : ""), (t.singaInterest || 0) + (t.depreciation || 0), "−")}
    ${bridge("Overall fiscal position", t.overallFiscalPosition, "=")}
  </div><p class="fine-print">Shown at MOF’s S$ million precision. Capitalisation is an accounting adjustment, not revenue. SINGA finances nationally significant infrastructure.</p></div>
  <div class="methodology"><span class="section-number">03 / THE SOURCE NOTES</span><h2 id="methodology-title">Check the workings.</h2>
    <details open><summary>Which budget is this?</summary><p>FY${b.fiscalYear}, ${date(b.period.start)} to ${date(b.period.end)}. ${esc(b.vintageNote)} Sources checked ${date(b.retrievedAt)}.</p></details>
    <details><summary>How deep does the breakdown go?</summary><p>The ${b.sectors.length} sectors split into ${b.sectors.flatMap((s) => s.ministries).length} ministry and programme portions, then ${b.sectors.flatMap((s) => s.ministries.flatMap((m) => m.children || [])).length} official Budget programmes. Choose a ministry to open its final column. All programmes are available together in the table and download.</p><p>These are <strong>programme allocations</strong>, not a directory of every department’s full budget. For example, the LTA programme line is a particular development allocation; other transport funding sits under MOT Administration. Defence and Foreign Affairs have one programme each, so no unsupported internal split is invented. MOM and MDDI portions follow MOF’s sectors.</p></details>
    <details><summary>How do the calculations reconcile?</summary><p>Operating revenue + NIRC = ministry expenditure + special transfers + overall budget balance + published rounding. Special transfers include fund top-ups; the funds’ subsequent spending is not added again.</p><p id="rounding-explanation"></p><p>Calculations use integer Singapore dollars at the source’s precision. Labels use b (billions) and m (millions), rounded for reading. Programme shares use their parent ministry portion; ministry and sector shares use total ministry expenditure; revenue shares use operating revenue. NIRC uses combined resources. Fund shares use the parent fund top-up allocation. Parent rows are subtotals — do not add them again to their children.</p></details>
    <details><summary>Official documents & open data</summary><ul>${b.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} </a></li>`).join("")}</ul><p>Evidence snapshots, document hashes and the <a href="https://github.com/kush0511/singapore-budget/blob/main/docs/AUDIT.md" target="_blank" rel="noopener">independent adversarial audit</a> are public. Receipts and ministry figures come from the detailed estimates, checked against MOF’s data.gov.sg datasets.</p></details>
    <details><summary>Next year’s budget</summary><p>The chart reads versioned datasets. The <a href="https://github.com/kush0511/singapore-budget/blob/main/docs/DATA.md" target="_blank" rel="noopener">annual import guide</a> covers source mappings, programme extraction and independent checks. Importing a reviewed year adds it to the selector. Publication is blocked if source regeneration, accounting checks or browser checks fail.</p></details>
    <div class="data-links"><a href="${import.meta.env.BASE_URL}data/budget-${b.fiscalYear}.json" download>${icon("download")} Source-linked JSON</a><a href="https://github.com/kush0511/singapore-budget" target="_blank" rel="noopener">Repository </a></div>
  </div></section>
  </main>
  <footer class="footer paper-shell"><span>${flag()} SINGAPORE BUDGET / ${b.fiscalYear}</span><p>Independent visualisation. Sources: Ministry of Finance & data.gov.sg.<br>Inspired by <a href="https://usafacts.org/government-spending/" target="_blank" rel="noopener">USAFacts</a>. Not affiliated with the Singapore Government.</p><a href="https://www.singaporebudget.gov.sg/revenue-and-expenditure" target="_blank" rel="noopener">Official Singapore Budget </a></footer>
  <div id="tooltip" class="tooltip" role="tooltip" hidden></div>`;
}
function ledger(label, amount, note, colour) {
  return `<div class="ledger-item"><p><span class="legend-dot ${colour}"></span>${label}</p><strong>${money(amount)}</strong><span>${note}</span></div>`;
}
function bridge(label, amount, sign) {
  return `<div class="equation-item"><span class="eq-sign">${sign}</span><span class="eq-label">${label}</span><strong class="eq-value">${formatBridgeAmount(amount)}</strong></div>`;
}
function focusMinistry() {
  return state.budget.sectors
    .flatMap((s) =>
      s.ministries.map((m) => ({
        ...m,
        id: `${s.id}:${m.id}`,
        sectorLabel: s.label,
      })),
    )
    .find((m) => m.id === state.focus);
}
function draw() {
  state.chart = renderBudgetChart($("#flow-view"), state.budget, {
    detail: state.detail,
    expandedMinistryId: state.focus,
    getSearch: () => state.query,
    onSelect: selectNode,
    onHover: showTooltip,
    onMove: showTooltip,
    onLeave: () => {
      hideTooltip();
      applySearch();
    },
  });
  const focus = focusMinistry();
  $("#programme-scope").textContent =
    `${focus?.children?.length || 0} official programme${focus?.children?.length === 1 ? "" : "s"} · ${focus?.label || ""}`;
  $("#focus-controls").hidden =
    state.detail !== "departments" || state.view === "table";
  $("#explore-ministry").value = state.focus;
  for (const detail of ["sectors", "ministries", "departments"])
    $(`#detail-${detail}`).setAttribute(
      "aria-pressed",
      String(state.detail === detail),
    );
  $("#chart-footnote").textContent =
    `${exact(Math.abs(state.chart.raw.rounding))} published rounding, shown separately.`;
  $("#rounding-explanation").textContent =
    `NIRC and the overall budget balance are published to S$1 million, while the detailed estimates provide finer amounts. The ${exact(Math.abs(state.chart.raw.rounding))} difference is shown as “Published rounding”. It is neither a spending programme nor revenue. The official budget balance is preserved at ${exact(state.budget.totals.overallBudgetBalance)}.`;
  renderTable();
  applySearch();
}
const aliases = {
  SPF: "police",
  SCDF: "civil defence",
  ICA: "immigration",
  HTX: "science",
  SPS: "offender",
  HDB: "public housing",
  LTA: "land transport authority",
  CAAS: "civil aviation",
  NUS: "national university of singapore",
  NTU: "nanyang technological university",
  SMU: "singapore management university",
  GST: "goods & services tax",
};
function normalQuery(q) {
  return aliases[q.trim().toUpperCase()] || q.trim().toLowerCase();
}
function applySearch() {
  const q = normalQuery(state.query),
    matches = state.chart.applyFilter(q, state.selected);
  const allRows = state.rows || [];
  const allMatches = allRows.filter((r) =>
    `${r.label} ${r.sourceLabel || ""} ${r.group} ${r.id}`
      .toLowerCase()
      .includes(q),
  );
  $("#search-status").textContent = state.query.trim()
    ? matches.length
      ? `${matches.length} matching categories in this flow${allMatches.length > matches.length ? ` · ${allMatches.length} matching lines in the complete table` : ""}`
      : allMatches.length
        ? `${allMatches.length} matching lines in the data table. Choose the relevant ministry to see its programmes.`
        : "No matching category. Try “health”, “GST” or “COE”."
    : "";
  $("#clear-search").hidden = !state.query;
  document
    .querySelectorAll("tr[data-row-id]")
    .forEach((r) =>
      r.classList.toggle(
        "table-muted",
        Boolean(q) && !r.dataset.search.includes(q),
      ),
    );
}
function selectNode(node) {
  hideTooltip();
  if (node.role === "ministry") {
    state.focus = node.id;
    state.detail = "departments";
    draw();
    node = state.chart.graph.nodes.find((n) => n.id === node.id) || node;
  }
  state.selected = node.id;
  const source =
    state.budget.sources.find(
      (s) => s.id === (node.sourceId || "mof-estimates"),
    ) || state.budget.sources[0];
  const precision =
    node.precision ||
    (node.role === "nirc" || node.role === "balance" ? 1e6 : null);
  const breakdown =
    node.operating !== undefined
      ? `<br>Operating ${exact(node.operating)} · Development ${exact(node.development)}`
      : "";
  const share =
    node.role === "programme"
      ? `${percentage(node.amount, focusMinistry().amount)} of this ministry portion.`
      : ["ministry", "sector"].includes(node.role)
        ? `${percentage(node.amount, state.budget.totals.totalExpenditure)} of ministry expenditure.`
        : "";
  $("#selection-detail").hidden = false;
  $("#selection-detail").innerHTML =
    `<div class="detail-heading"><span class="detail-type" style="color:${nodeColour(node)}">${esc(node.role === "programme" ? "OFFICIAL BUDGET PROGRAMME" : node.role.replaceAll("-", " ").toUpperCase())}</span><h3>${esc(node.label)}</h3><strong>${exact(node.amount)}</strong><small>${breakdown}${precision ? `<br>Published precision: ${exact(precision)}` : ""}</small></div><div><p>${esc(node.description || node.note || "Official allocation in the Revenue and Expenditure Estimates.")} ${share}</p>${node.sourceCode ? `<small>Official source code ${esc(node.sourceCode)}${node.sourceLabel ? " · " + esc(node.sourceLabel) : ""}</small>` : ""}<p><a href="${esc(source.url)}" target="_blank" rel="noopener">Official source${node.sourcePage ? `, printed p. ${esc(node.sourcePage)}` : ""} </a></p></div><button id="close-detail" class="close-detail" aria-label="Close category details">×</button>`;
  $("#close-detail").addEventListener("click", clearSelection);
  applySearch();
}
function clearSelection() {
  state.selected = null;
  $("#selection-detail").hidden = true;
  applySearch();
}
function showTooltip(node, event) {
  const tip = $("#tooltip");
  tip.innerHTML = `<strong>${esc(node.label)}</strong><b>${exact(node.amount)}</b><span>${node.role === "ministry" ? "Select to expand its official programmes." : node.role === "programme" ? "Official programme allocation; select for scope and source." : "Select for the source and accounting context."}</span>`;
  tip.hidden = false;
  tip.style.left = `${Math.max(8, Math.min(event.clientX + 14, window.innerWidth - tip.offsetWidth - 12))}px`;
  tip.style.top = `${Math.max(8, Math.min(event.clientY + 14, window.innerHeight - tip.offsetHeight - 12))}px`;
}
function hideTooltip() {
  $("#tooltip").hidden = true;
}
function renderTable() {
  state.rows = tableRows(state.budget);
  $("#table-view").innerHTML =
    `<table><caption>Complete FY${state.budget.fiscalYear} dataset, including every official programme. Parent rows are subtotals; do not add them to their children.</caption><thead><tr><th scope="col">Group / share base</th><th scope="col">Budget line</th><th scope="col">Singapore dollars</th><th scope="col">Share</th></tr></thead><tbody>${state.rows.map((r) => `<tr class="table-${esc(r.kind || "line")}" data-row-id="${esc(r.id)}" data-search="${esc(`${r.label} ${r.sourceLabel || ""} ${r.group} ${r.id}`.toLowerCase())}"><td>${esc(r.group)}${r.shareBase ? `<br><small>Share base: ${esc(r.shareBase)}</small>` : ""}</td><td>${esc(r.label)}${r.kind === "programme" ? `<small class="programme-code">Programme ${esc(r.sourceCode)}</small>` : ""}</td><td>${fmt.format(r.amount)}</td><td>${r.denominator ? percentage(r.amount, r.denominator) : "—"}</td></tr>`).join("")}</tbody></table>`;
}
function downloadCSV() {
  const b = state.budget,
    sourceFor = (r) =>
      b.sources.find((s) => s.id === (r.sourceId || "mof-estimates"))?.url ||
      b.sourcePage;
  const fields = [
    "Fiscal year",
    "Basis",
    "Group",
    "Share base",
    "Budget line",
    "Row type (parents are subtotals)",
    "Official source code",
    "Amount SGD",
    "Operating SGD",
    "Development SGD",
    "Share denominator SGD",
    "Share percent",
    "Source URL",
    "Printed source page",
    "Scope note",
  ];
  const cell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [
    fields,
    ...state.rows.map((r) => [
      b.fiscalYear,
      b.basis,
      r.group,
      r.shareBase || (r.denominator ? r.group : ""),
      r.label,
      r.kind || "line",
      r.sourceCode || "",
      r.amount,
      r.operating ?? "",
      r.development ?? "",
      r.denominator || "",
      r.denominator ? ((r.amount / r.denominator) * 100).toFixed(6) : "",
      sourceFor(r),
      r.sourcePage || "",
      r.note || "",
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `singapore-budget-${b.fiscalYear}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function wire() {
  $("#budget-year").addEventListener("change", (e) => {
    const url = new URL(location.href);
    url.searchParams.set("year", e.target.value);
    location.href = url;
  });
  ["flow", "table"].forEach((view) =>
    $(`#view-${view}`).addEventListener("click", () => {
      state.view = view;
      $("#flow-view").hidden = view !== "flow";
      $("#table-view").hidden = view !== "table";
      $("#view-flow").setAttribute("aria-pressed", String(view === "flow"));
      $("#view-table").setAttribute("aria-pressed", String(view === "table"));
      $("#focus-controls").hidden =
        view === "table" || state.detail !== "departments";
      document
        .querySelectorAll('[id^="detail-"]')
        .forEach((b) => (b.disabled = view === "table"));
      hideTooltip();
    }),
  );
  ["sectors", "ministries", "departments"].forEach((detail) =>
    $(`#detail-${detail}`).addEventListener("click", () => {
      state.detail = detail;
      clearSelection();
      draw();
    }),
  );
  $("#explore-ministry").addEventListener("change", (e) => {
    state.focus = e.target.value;
    state.selected = null;
    $("#selection-detail").hidden = true;
    draw();
  });
  $("#search").addEventListener("input", (e) => {
    state.query = e.target.value;
    const q = normalQuery(state.query);
    const programmeParents = new Set(
      (state.rows || [])
        .filter(
          (r) =>
            r.kind === "programme" &&
            `${r.label} ${r.sourceLabel || ""} ${r.group} ${r.id}`
              .toLowerCase()
              .includes(q),
        )
        .map((r) => r.id.split(":").slice(0, 2).join(":")),
    );
    // An unambiguous programme search opens its actual parent ministry.
    if (
      state.view === "flow" &&
      q.length >= 3 &&
      programmeParents.size === 1 &&
      (state.focus !== [...programmeParents][0] ||
        state.detail !== "departments")
    ) {
      state.focus = [...programmeParents][0];
      state.detail = "departments";
      state.selected = null;
      $("#selection-detail").hidden = true;
      draw();
    } else applySearch();
  });
  $("#clear-search").addEventListener("click", () => {
    state.query = "";
    $("#search").value = "";
    applySearch();
    $("#search").focus();
  });
  $("#download-csv").addEventListener("click", downloadCSV);
  if (!document.fullscreenEnabled) $("#fullscreen").hidden = true;
  $("#fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $(".explorer").requestFullscreen();
    } catch {}
  });
  window.addEventListener("scroll", hideTooltip, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideTooltip();
      clearSelection();
    }
  });
}
init().catch((error) => {
  $("#app").innerHTML =
    `<main class="fatal"><h1>The budget could not be loaded.</h1><p>${esc(error.message)}</p><a href="${esc(location.pathname)}">Reload</a> · <a href="https://www.singaporebudget.gov.sg/revenue-and-expenditure">Official Budget</a></main>`;
  console.error(error);
});
