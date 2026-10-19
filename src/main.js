import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { buildGraphData, tableRows, formatBridgeAmount } from "./model.js";
import "./style.css";

const $ = (selector) => document.querySelector(selector);
const esc = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const icon = (name, size = 16) => {
  const shapes = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    arrow: '<path d="M5 19 19 5M5 5h14v14"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
    leftRight: '<path d="M3 12h18M7 8l-4 4 4 4m10-8 4 4-4 4"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.info}</svg>`;
};
const fmt = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 });
const money = (value) =>
  Math.abs(value) < 1e6
    ? `S$${fmt.format(value)}`
    : `S$${(value / 1e9).toFixed(2)}b`;
const compact = (value) =>
  value < 1e6
    ? `S$${(value / 1e3).toFixed(1)}k`
    : value < 1e9
      ? `S$${(value / 1e6).toFixed(value < 10e6 ? 2 : 1)}m`
      : `S$${(value / 1e9).toFixed(2)}b`;
const exact = (value) => `S$${fmt.format(value)}`;
const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`;
const date = (str) =>
  new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(new Date(`${str}T00:00:00Z`));
const state = {
  budget: null,
  detail: "ministries",
  view: "flow",
  search: "",
  selected: null,
  graph: null,
};
const palette = {
  revenue: "#6394f8",
  nirc: "#69caaa",
  pool: "#a4abcb",
  sector: "#ae83e5",
  ministry: "#ae83e5",
  transfer: "#dba0c9",
  "transfer-detail": "#dba0c9",
  balance: "#d2bb83",
  rounding: "#94a0ae",
};
const sectorColors = ["#ba92ee", "#9388ec", "#c48de2", "#92a5d9"];
function color(n) {
  if (n.role === "sector")
    return (
      sectorColors[state.budget.sectors.findIndex((s) => s.id === n.id)] ||
      palette.sector
    );
  if (n.role === "ministry")
    return (
      sectorColors[
        state.budget.sectors.findIndex((s) => s.id === n.sectorId)
      ] || palette.ministry
    );
  return palette[n.role] || palette.revenue;
}

$("#app").innerHTML =
  '<div class="loading" role="status">Loading the official budget…</div>';

async function init() {
  const requestedYear = new URLSearchParams(location.search).get("year");
  let available = [
    { year: 2026, file: "budget-2026.json", label: "FY2026 · Estimates" },
  ];
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/index.json`);
    if (r.ok) {
      const index = await r.json();
      available = Array.isArray(index) ? index : index.budgets || available;
    }
  } catch {}
  const entry =
    available.find((e) => String(e.year || e.fiscalYear) === requestedYear) ||
    available[0];
  const response = await fetch(
    `${import.meta.env.BASE_URL}data/${entry.file || `budget-${entry.year || entry.fiscalYear}.json`}`,
  );
  if (!response.ok)
    throw new Error("The published budget dataset could not be loaded.");
  state.budget = await response.json();
  renderPage(available);
  renderChart();
  wire();
}
function renderPage(available) {
  const b = state.budget,
    t = b.totals,
    resources = t.operatingRevenue + t.nirc;
  document.title = `Singapore Budget, visualised — FY${b.fiscalYear}`;
  $("#app").innerHTML = `<div class="shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Singapore Budget home"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M3 5h7v22H3zM22 5h7v22h-7z" fill="#9ba6ed"/><path d="M10 5c12 0 0 22 12 22V16C10 16 22 5 10 5Z" fill="#bb94ee"/></svg><span>Singapore Budget<small>FOLLOW THE MONEY</small></span></a>
      <nav class="nav" aria-label="Main navigation"><a href="#explore">Explore</a><a href="#methodology">About the data</a><a class="repo" href="https://github.com/kush0511/singapore-budget" target="_blank" rel="noopener">${icon("code", 14)} Open source ${icon("arrow", 11)}</a></nav>
    </header>
    <main>
      <section class="intro" aria-labelledby="page-title"><div><div class="eyebrow">The nation’s finances, made visible</div><h1 id="page-title">Where the money <em>flows.</em></h1><p class="lede">Follow Singapore’s revenue and investment contribution through the budget, to the sectors and ministries it supports.</p></div><div class="year-block"><label for="budget-year">Fiscal year</label><select id="budget-year" aria-label="Fiscal year">${available.map((e) => `<option value="${esc(e.year || e.fiscalYear)}" ${Number(e.year || e.fiscalYear) === b.fiscalYear ? "selected" : ""}>${esc(e.label || `FY${e.year || e.fiscalYear} · Estimates`)}</option>`).join("")}</select><span class="year-note">${date(b.period.start)} – ${date(b.period.end)}<br>Budget Day estimates · ${date(b.budgetDate)}</span></div></section>
      <section class="metrics" aria-label="Budget at a glance">
        ${metric("Operating revenue", t.operatingRevenue, "Taxes, fees and other receipts", "blue")}
        ${metric("Investment contribution", t.nirc, "Net Investment Returns Contribution", "green")}
        ${metric("Ministry expenditure", t.totalExpenditure, "Operating + development expenditure", "violet")}
        ${metric(t.overallBudgetBalance >= 0 ? "Overall budget surplus" : "Overall budget deficit", Math.abs(t.overallBudgetBalance), "After special transfers and NIRC", "amber")}
      </section>
      <section id="explore" class="explorer" aria-labelledby="explore-title">
        <div class="explorer-heading"><div><h2 id="explore-title">One budget. The whole picture.</h2><p class="subtext">Explore the flows. Select a category for the figures behind it.</p></div><div class="segmented" role="group" aria-label="View"><button id="view-flow" aria-pressed="true">Flow diagram</button><button id="view-table" aria-pressed="false">Data table</button></div></div>
        <div class="toolbar"><div class="legend" aria-label="Flow legend"><span><i class="dot"></i>Operating revenue</span><span><i class="dot green"></i>Investment returns</span><span><i class="dot violet"></i>Budget uses</span></div><div class="tools"><div class="segmented" role="group" aria-label="Detail level"><button id="detail-sectors" aria-pressed="false">Sectors</button><button id="detail-ministries" aria-pressed="true">Ministries</button></div><div class="search">${icon("search", 14)}<input id="search" type="search" placeholder="Find a tax or ministry…" aria-label="Search budget categories" autocomplete="off"><button id="clear-search" class="clear-search" aria-label="Clear search" hidden>×</button></div><button class="download" id="download-csv" aria-label="Download budget data as CSV">${icon("download", 14)}<span>CSV</span></button></div></div>
        <div class="search-status" id="search-status" role="status" aria-live="polite"></div>
        <div class="mobile-hint">${icon("leftRight", 12)} Scroll the diagram sideways to follow the flows</div>
        <div class="chart-frame" id="chart-frame"><div class="chart-meta"><span><strong>FY${b.fiscalYear} ESTIMATES</strong> &nbsp; / &nbsp; All amounts in Singapore dollars</span><span class="desktop-info">Flow width = budget amount &nbsp; · &nbsp; ${money(resources)} in combined resources</span><button class="fullscreen" id="fullscreen" aria-label="Expand flow diagram">${icon("expand", 14)}</button></div><div id="flow-view" class="chart-scroll" role="region" aria-label="Interactive budget flow diagram" tabindex="0"></div><div id="table-view" class="table-wrap" hidden></div><div class="chart-bottom"><span>${icon("info", 13)} Revenue is pooled. No individual tax is earmarked to a ministry by this diagram.</span><span id="chart-footnote">Published figures; small rounding differences are reconciled.</span></div></div>
        <aside class="detail" id="selection-detail" aria-label="Selected category details" aria-live="polite" hidden></aside>
        <div class="explainer"><p>Ministry expenditure is <strong>${money(t.totalExpenditure)}</strong>. Special transfers of <strong>${money(t.specialTransfers)}</strong> are shown separately. These are the original Budget Day estimates; later support measures are not folded in.</p><a href="#methodology">Sources & methodology ↗</a></div>
      </section>
      <section class="balance-section" aria-labelledby="balance-title"><div><div class="eyebrow">Read the balance correctly</div><h2 id="balance-title">Two balances.<br>Different accounting views.</h2><p>The overall budget balance and overall fiscal position answer different questions. Here’s the official bridge between them.</p></div><div class="balance-equation">
        ${equation("", t.overallBudgetBalance, "Overall budget balance")}
        ${equation("+", t.capitalisation, "Capitalisation of nationally significant infrastructure")}
        ${equation("−", (t.singaInterest || 0) + (t.depreciation || 0), "SINGA interest / loan expenses" + (t.depreciation ? " and depreciation" : ""))}
        ${equation("=", t.overallFiscalPosition, "Overall fiscal position")}
        <p class="balance-note">Infrastructure capitalisation is an accounting adjustment, not additional revenue. SINGA finances nationally significant infrastructure. This bridge uses MOF’s published S$ million figures.</p>
      </div></section>
      <section id="methodology" class="methodology" aria-labelledby="methodology-title"><div><div class="eyebrow">Traceable by design</div><h2 id="methodology-title">The numbers have receipts.</h2><p class="methodology-intro">Official sources, explicit boundaries and a dataset that can be updated when the next budget arrives.</p><a href="${import.meta.env.BASE_URL}data/budget-${b.fiscalYear}.json" download class="download" style="color:#c4b3e5">${icon("download", 14)} Download the source-linked dataset</a></div><div>
        <details open><summary>What does this budget cover?</summary><p>FY${b.fiscalYear} runs from ${date(b.period.start)} to ${date(b.period.end)}. This view uses the <strong>${date(b.budgetDate)} Budget Day estimates</strong>, not actual spending. ${esc(b.vintageNote)} Updated estimates should be imported as a separate vintage, rather than mixed into this one.</p><p>Sources checked on ${date(b.retrievedAt || "2026-10-19")}. Inspired by <a href="https://usafacts.org/government-spending/" target="_blank" rel="noopener">USAFacts’ government spending visualisation</a>; this project is independent and is not a government website.</p></details>
        <details><summary>How do the flows add up?</summary><p>Operating revenue + NIRC = ministry expenditure + special transfers + overall budget surplus + a published-rounding reconciliation. The budget node pools these resources. Flows do not show which tax funds a specific ministry.</p><p id="rounding-explanation"></p><p>Every value is stored as an integer in Singapore dollars. Labels use billions (b) or millions (m), rounded for readability. Source precision still applies: additional digits do not imply additional forecast accuracy. Node spacing is for legibility; flow widths use one common scale within each view.</p></details>
        <details><summary>What is included, and what is kept separate?</summary><p>Ministry expenditure includes operating and development spending. Special transfers include direct support and top-ups to funds; these top-ups are not the same as the funds’ eventual spending. MOM and MDDI programme portions follow MOF’s sector classification and are labelled separately.</p><p>Fees and charges include COE premiums, counted once. NIRC is a contribution from investment returns, not all investment income. Land sales and gross debt issuance are not treated as operating revenue here. The overall fiscal position is shown separately from the overall budget balance.</p><p>In the data table, revenue shares use operating revenue as their base; sector and ministry shares use ministry expenditure. NIRC’s share uses combined resources (operating revenue + NIRC). Special-transfer components use total special transfers. Parent rows are subtotals: do not add them to their children.</p></details>
        <details><summary>Where did the data come from?</summary><ul>${b.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a></li>`).join("")}</ul><p>The detailed estimates provide whole-dollar categories. The fiscal summary supplies NIRC, the official balance and the infrastructure bridge. MOF datasets on data.gov.sg provide an independent cross-check. Snapshots, source hashes, extraction logic and an independent adversarial audit are in the <a href="https://github.com/kush0511/singapore-budget" target="_blank" rel="noopener">public repository</a>.</p></details>
        <details><summary>How can this be updated for next year?</summary><p>The visual reads a versioned JSON dataset, so a new year does not require a new design. Add a source configuration, pin the official documents, run the importer, and run the accounting checks. The year selector reads the generated budget index. The deployment pipeline blocks publication when accounting or browser checks fail.</p><p>Follow the <a href="https://github.com/kush0511/singapore-budget/blob/main/docs/DATA.md" target="_blank" rel="noopener">data update guide</a>. Changes to classifications or source formats require review; the pipeline must fail rather than silently guess.</p></details>
      </div></section>
    </main><footer class="footer"><div>Singapore Budget, visualised<br>Independent public data project · Built for understanding.</div><div class="footer-links"><a href="https://www.singaporebudget.gov.sg/revenue-and-expenditure" target="_blank" rel="noopener">Official Budget ↗</a><a href="https://github.com/kush0511/singapore-budget/blob/main/docs/AUDIT.md" target="_blank" rel="noopener">Audit record ↗</a><a href="https://github.com/kush0511/singapore-budget" target="_blank" rel="noopener">GitHub ↗</a></div></footer>
  </div><div id="tooltip" class="tooltip" role="tooltip" hidden></div>`;
}
function metric(label, value, note, c) {
  return `<div class="metric"><div class="metric-label"><i class="dot ${c}"></i>${label}</div><div class="metric-value"><span>S$</span>${(value / 1e9).toFixed(2)}<span>b</span></div><div class="metric-note">${note}</div></div>`;
}
function equation(sign, value, label) {
  return `<div class="equation-item"><div class="eq-value"><span class="eq-sign">${sign}</span>${formatBridgeAmount(value)}</div><div class="eq-label">${label}</div></div>`;
}

function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}
function wrapLabel(label, max = 27) {
  if (label.length <= max) return [label];
  const words = label.split(" ");
  let lines = [""];
  for (const w of words) {
    const last = lines.length - 1;
    if ((lines[last] + " " + w).trim().length > max && lines[last])
      lines.push(w);
    else lines[last] = (lines[last] + " " + w).trim();
  }
  return lines;
}
function renderChart() {
  const raw = buildGraphData(state.budget, state.detail);
  state.raw = raw;
  const detailed = state.detail === "ministries",
    width = 1460,
    height = detailed ? 1250 : 950;
  const x0 = 250,
    x1 = detailed ? 1190 : 1160,
    y0 = 100,
    y1 = height - 45;
  const graph = sankey()
    .nodeId((d) => d.id)
    .nodeAlign((d) => d.layer)
    .nodeWidth(12)
    .nodePadding(detailed ? 20 : 22)
    .nodeSort(null)
    .extent([
      [x0, y0],
      [x1, y1],
    ])
    .iterations(48)(structuredClone(raw));
  state.graph = graph;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    "aria-label": `Singapore FY${state.budget.fiscalYear} budget: operating revenue and NIRC flow into a pooled budget, then spending sectors${detailed ? " and ministries" : ""}.`,
    "data-testid": "budget-flow",
    role: "group",
  });
  svg.append(
    svgEl(
      "title",
      {},
      `Singapore Budget FY${state.budget.fiscalYear} estimates`,
    ),
  );
  svg.append(
    svgEl(
      "desc",
      {},
      "Interactive accounting flow. The budget pool combines revenue and NIRC. Tax flows are not earmarked to specific ministries. Use the data table for exact values.",
    ),
  );
  const columnX = [
    x0,
    graph.nodes.find((n) => n.role === "pool").x0,
    graph.nodes.find((n) => n.role === "sector").x0,
    x1,
  ];
  const headers = detailed
    ? [
        "01  REVENUE & RETURNS",
        "02  POOLED RESOURCES",
        "03  BUDGET USES",
        "04  MINISTRIES & TRANSFERS",
      ]
    : ["01  REVENUE & RETURNS", "02  POOLED RESOURCES", "03  BUDGET USES"];
  headers.forEach((h, i) => {
    let x = i === 0 ? 24 : columnX[i] - 4;
    if (i === 3) x = x1 - 6;
    svg.append(svgEl("text", { x, y: 35, class: "flow-column" }, h));
  });
  svg.append(
    svgEl("line", {
      x1: 24,
      y1: 52,
      x2: width - 24,
      y2: 52,
      stroke: "#2b333e",
      "stroke-width": 1,
    }),
  );
  const linksGroup = svgEl("g", { "aria-hidden": "true" });
  graph.links.forEach((l) => {
    const c = l.source.role === "pool" ? color(l.target) : color(l.source);
    const path = svgEl("path", {
      d: sankeyLinkHorizontal()(l),
      fill: "none",
      stroke: c,
      "stroke-width": l.width,
      opacity: l.target.role === "rounding" ? 0.5 : 0.23,
      class: "flow-link",
      "data-source": l.source.id,
      "data-target": l.target.id,
    });
    l.element = path;
    linksGroup.append(path);
  });
  svg.append(linksGroup);
  const nodesGroup = svgEl("g");
  graph.nodes.forEach((n) => {
    const g = svgEl("g", {
      class: "flow-node",
      tabindex: 0,
      role: "button",
      "aria-label": `${n.label}: ${exact(n.amount)}. Select for details.`,
      "aria-pressed": state.selected === n.id ? "true" : "false",
      "data-node-id": n.id,
    });
    g.append(
      svgEl("rect", {
        x: n.x0,
        y: n.y0,
        width: n.x1 - n.x0,
        height: Math.max(n.y1 - n.y0, 1.1),
        rx: 1,
        fill: color(n),
      }),
    );
    if (n.role === "pool") {
      const x = (n.x0 + n.x1) / 2;
      g.append(
        svgEl(
          "text",
          { x, y: 76, "text-anchor": "middle", class: "flow-pool-total" },
          money(raw.resources),
        ),
      );
      g.append(
        svgEl(
          "text",
          {
            x: x - 18,
            y: (n.y0 + n.y1) / 2,
            transform: `rotate(-90 ${x - 18} ${(n.y0 + n.y1) / 2})`,
            "text-anchor": "middle",
            class: "flow-pool-title",
          },
          "Revenue + NIRC",
        ),
      );
    } else {
      const left = n.layer === 0 || (detailed && n.layer === 2);
      const x = left ? n.x0 - 14 : n.x1 + 14;
      const displayLabel = n.label
        .replace(
          "Digital Development and Information",
          "Digital Development & Info.",
        )
        .replace(
          "Sustainability and the Environment",
          "Sustainability & Environment",
        )
        .replace("Social and Family Development", "Social & Family Development")
        .replace("Culture, Community and Youth", "Culture, Community & Youth");
      const lines = wrapLabel(displayLabel, n.layer === 3 ? 30 : 27);
      let y = (n.y0 + n.y1) / 2 - (lines.length - 1) * 7;
      // Rounding is a tiny separate accounting reconciliation; never inflate its flow.
      if (n.role === "rounding") y = Math.min(height - 28, y);
      const label = svgEl("text", {
        x,
        y: y - 6,
        "text-anchor": left ? "end" : "start",
        class: "flow-label",
      });
      label.append(
        svgEl("tspan", { x, dy: 0, class: "flow-amount" }, compact(n.amount)),
      );
      lines.forEach((line, i) =>
        label.append(svgEl("tspan", { x, dy: i === 0 ? 17 : 15 }, line)),
      );
      g.append(label);
      n.labelElement = label;
    }
    g.addEventListener("mouseenter", (e) => {
      highlight(n.id);
      showTooltip(e, n);
    });
    g.addEventListener("mousemove", (e) => showTooltip(e, n));
    g.addEventListener("mouseleave", () => {
      hideTooltip();
      applySearch();
    });
    g.addEventListener("focus", () => highlight(n.id));
    g.addEventListener("blur", () => applySearch());
    g.addEventListener("click", () => selectNode(n.id));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectNode(n.id);
      }
      if (e.key === "Escape") clearSelection();
    });
    n.element = g;
    nodesGroup.append(g);
  });
  svg.append(nodesGroup);
  $("#flow-view").replaceChildren(svg);
  resolveLabelCollisions(graph, svg, height);
  $("#chart-footnote").textContent =
    `${raw.rounding ? `${exact(Math.abs(raw.rounding))} published rounding · ` : ""}Select a node to inspect`;
  $("#rounding-explanation").textContent =
    `The detailed estimates use whole dollars, while NIRC and the overall budget balance are published to S$1 million. This leaves a ${exact(Math.abs(raw.rounding))} precision difference, shown as “Published rounding”. It is not an expenditure category. The official overall budget balance is preserved at ${exact(state.budget.totals.overallBudgetBalance)}.`;
  renderTable();
  applySearch();
  if (state.selected && !graph.nodes.some((n) => n.id === state.selected))
    clearSelection();
}

function resolveLabelCollisions(graph, svg, height) {
  // Keep the amount scale intact; move only text, with leaders to its true node.
  for (const layer of [0, 2, 3]) {
    const labels = graph.nodes
      .filter((n) => n.layer === layer && n.labelElement)
      .map((n) => ({ n, box: n.labelElement.getBBox() }))
      .sort((a, b) => a.box.y - b.box.y);
    if (!labels.length) continue;
    const gap = 7,
      minY = 88,
      maxY = height - 22;
    let bottom = minY - gap;
    for (const item of labels) {
      item.top = Math.max(item.box.y, bottom + gap);
      bottom = item.top + item.box.height;
    }
    if (bottom > maxY) {
      let next = maxY + gap;
      for (let i = labels.length - 1; i >= 0; i--) {
        const item = labels[i];
        item.top = Math.min(item.top, next - gap - item.box.height);
        next = item.top;
      }
    }
    for (const item of labels) {
      const { n, box, top } = item,
        delta = top - box.y;
      n.labelElement.setAttribute("transform", `translate(0 ${delta})`);
      if (Math.abs(delta) > 4) {
        const left =
          n.layer === 0 || (state.detail === "ministries" && n.layer === 2);
        const x = left ? n.x0 : n.x1,
          tx = left ? n.x0 - 10 : n.x1 + 10;
        const y = (n.y0 + n.y1) / 2,
          ty = top + box.height / 2;
        const path = svgEl("path", {
          d: `M${x},${y}L${tx},${ty}`,
          fill: "none",
          stroke: color(n),
          "stroke-width": 0.7,
          opacity: 0.55,
          "aria-hidden": "true",
          class: "label-leader",
        });
        n.element.insertBefore(path, n.labelElement);
      }
    }
  }
}

function highlight(id) {
  const n = state.graph.nodes.find((n) => n.id === id);
  if (!n) return;
  const relevant = new Set([id]);
  // Highlight immediate flows only. Do not imply a tax is assigned to a ministry.
  const links = state.graph.links.filter(
    (l) => l.source.id === id || l.target.id === id,
  );
  links.forEach((l) => {
    relevant.add(l.source.id);
    relevant.add(l.target.id);
  });
  state.graph.nodes.forEach((x) =>
    x.element.classList.toggle("is-muted", !relevant.has(x.id)),
  );
  state.graph.links.forEach((l) =>
    l.element.setAttribute("opacity", links.includes(l) ? 0.58 : 0.055),
  );
}
function applySearch() {
  const q = state.search.toLowerCase().trim();
  const matches = state.graph.nodes.filter(
    (n) =>
      n.role !== "pool" &&
      (
        n.label +
        " " +
        (n.sectorLabel || "") +
        " " +
        (n.description || "") +
        " " +
        (n.id === "goods-and-services-tax" ? "GST" : "")
      )
        .toLowerCase()
        .includes(q),
  );
  const ids = new Set(matches.map((n) => n.id));
  state.graph.nodes.forEach((n) => {
    n.element.classList.toggle("is-muted", Boolean(q) && !ids.has(n.id));
    n.element.classList.toggle("is-selected", n.id === state.selected);
    n.element.setAttribute("aria-pressed", String(n.id === state.selected));
  });
  state.graph.links.forEach((l) =>
    l.element.setAttribute(
      "opacity",
      q ? (ids.has(l.source.id) || ids.has(l.target.id) ? 0.5 : 0.045) : 0.23,
    ),
  );
  $("#search-status").textContent = q
    ? matches.length
      ? `${matches.length} matching ${matches.length === 1 ? "category" : "categories"} · ${matches
          .slice(0, 3)
          .map((n) => n.label)
          .join(" / ")}${matches.length > 3 ? " / …" : ""}`
      : "No matching category. Try “health”, “GST” or “COE”."
    : "";
  $("#clear-search").hidden = !q;
  document
    .querySelectorAll("tr[data-row-id]")
    .forEach((r) =>
      r.classList.toggle(
        "table-muted",
        Boolean(q) && !(r.dataset.search || "").includes(q),
      ),
    );
}
function showTooltip(e, n) {
  const tip = $("#tooltip");
  tip.innerHTML = `<strong>${esc(n.label)}</strong>${exact(n.amount)}${n.role === "ministry" || n.role === "sector" ? ` · ${pct(n.amount, state.budget.totals.totalExpenditure)} of ministry expenditure` : ""}<span>${n.role === "revenue" || n.role === "nirc" ? "Pooled resources; not earmarked to specific ministries." : "Select for source and accounting context."}</span>`;
  tip.hidden = false;
  tip.style.left = `${Math.min(e.clientX + 16, window.innerWidth - tip.offsetWidth - 12)}px`;
  tip.style.top = `${Math.min(e.clientY + 16, window.innerHeight - tip.offsetHeight - 12)}px`;
}
function hideTooltip() {
  $("#tooltip").hidden = true;
}
function selectNode(id) {
  const n = state.graph.nodes.find((n) => n.id === id);
  if (!n) return;
  state.selected = id;
  hideTooltip();
  const source =
    state.budget.sources.find(
      (s) => s.id === (n.sourceId || "mof-estimates"),
    ) || state.budget.sources[0];
  const operating =
    n.operating !== undefined
      ? `Operating: ${exact(n.operating)} · Development: ${exact(n.development)}`
      : "";
  $("#selection-detail").hidden = false;
  $("#selection-detail").innerHTML =
    `<div><div class="detail-kicker">${esc(n.sectorLabel || n.role.replaceAll("-", " "))}</div><h3>${esc(n.label)}</h3><div class="detail-value">${compact(n.amount)}</div><div class="detail-exact">${exact(n.amount)}${n.role === "nirc" || n.role === "balance" ? "<br>Published in S$ millions" : ""}${operating ? `<br>${operating}` : ""}</div></div><p class="detail-description">${esc(n.description)}${n.role === "ministry" || n.role === "sector" ? `<br>${pct(n.amount, state.budget.totals.totalExpenditure)} of ministry expenditure.` : ""}</p><a href="${esc(source.url)}" target="_blank" rel="noopener">Official source ↗</a><button class="close-detail" id="close-detail" aria-label="Close category details">×</button>`;
  $("#close-detail").addEventListener("click", clearSelection);
  applySearch();
}
function clearSelection() {
  state.selected = null;
  $("#selection-detail").hidden = true;
  applySearch();
}
function renderTable() {
  const rows = tableRows(state.budget);
  state.rows = rows;
  $("#table-view").innerHTML =
    `<table><caption class="table-caption">Exact source amounts in SGD. Parent sectors are subtotals; do not add them again to ministries. Shares use each row’s stated base.</caption><thead><tr><th scope="col">Category / share base</th><th scope="col">Budget line</th><th scope="col">Singapore dollars</th><th scope="col">Share</th></tr></thead><tbody>${rows.map((r) => `<tr class="${r.kind === "sector" ? "table-sector" : r.kind === "ministry" || r.kind === "transfer-detail" ? "table-child" : ""}" data-row-id="${esc(r.id)}" data-search="${esc((r.label + " " + r.group + " " + (r.id === "goods-and-services-tax" ? "GST" : "")).toLowerCase())}"><td>${esc(r.group)}${r.shareBase ? `<br><small>Share base: ${esc(r.shareBase)}</small>` : ""}</td><td>${esc(r.label)}</td><td>${fmt.format(r.amount)}</td><td>${r.denominator ? pct(r.amount, r.denominator) : "—"}</td></tr>`).join("")}</tbody></table>`;
}
function downloadCSV() {
  const b = state.budget;
  const header = [
    "Fiscal year",
    "Basis",
    "Group",
    "Share base",
    "Budget line",
    "Row type (parents are subtotals)",
    "Amount SGD",
    "Share denominator SGD",
    "Share percent",
    "Source URL",
  ];
  const sourceFor = (r) =>
    b.sources.find((s) => s.id === (r.sourceId || "mof-estimates"))?.url ||
    b.sourcePage;
  const cell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [
    header,
    ...state.rows.map((r) => [
      b.fiscalYear,
      b.basis,
      r.group,
      r.shareBase || (r.denominator ? r.group : ""),
      r.label,
      r.kind || "line",
      r.amount,
      r.denominator || "",
      r.denominator ? ((r.amount / r.denominator) * 100).toFixed(6) : "",
      sourceFor(r),
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
      $("#fullscreen").hidden = view !== "flow";
      document
        .querySelectorAll('[id^="detail-"]')
        .forEach((x) => (x.disabled = view === "table"));
      hideTooltip();
    }),
  );
  ["sectors", "ministries"].forEach((detail) =>
    $(`#detail-${detail}`).addEventListener("click", () => {
      state.detail = detail;
      $("#detail-sectors").setAttribute(
        "aria-pressed",
        String(detail === "sectors"),
      );
      $("#detail-ministries").setAttribute(
        "aria-pressed",
        String(detail === "ministries"),
      );
      hideTooltip();
      renderChart();
    }),
  );
  $("#search").addEventListener("input", (e) => {
    state.search = e.target.value;
    applySearch();
  });
  $("#clear-search").addEventListener("click", () => {
    state.search = "";
    $("#search").value = "";
    applySearch();
    $("#search").focus();
  });
  $("#download-csv").addEventListener("click", downloadCSV);
  if (!document.fullscreenEnabled) $("#fullscreen").hidden = true;
  $("#fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $("#chart-frame").requestFullscreen();
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
    `<main class="fatal"><h1>The budget could not be loaded.</h1><p>${esc(error.message)}</p><p><a href="${esc(location.pathname)}">Reload the page</a> or <a href="https://www.singaporebudget.gov.sg/revenue-and-expenditure">read the official budget</a>.</p></main>`;
  console.error(error);
});
