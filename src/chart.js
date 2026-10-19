import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { buildGraphData } from "./model.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, text) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
};
export const sectorColours = {
  "social-development": "#ec655f",
  "security-external-relations": "#dc4d57",
  "economic-development": "#eaa05f",
  "government-administration": "#b999d4",
};
export function nodeColour(n) {
  if (n.role === "revenue") return "#3881f3";
  if (n.role === "nirc") return "#49bfa8";
  if (n.role === "pool") return "#b7b9bd";
  if (n.role === "balance") return "#cbb980";
  if (n.role === "rounding") return "#8e9299";
  if (n.role.includes("transfer") || n.role === "fund") return "#be84d3";
  return sectorColours[n.sectorId || n.id] || "#ec655f";
}
const smallAmount = (value) =>
  value < 1e6
    ? `S$${(value / 1e3).toFixed(1)}k`
    : value < 1e9
      ? `S$${(value / 1e6).toFixed(1)}m`
      : `S$${(value / 1e9).toFixed(2)}b`;
const shorten = (label) =>
  label
    .replace("Digital Development and Information", "MDDI")
    .replace(
      "Sustainability and the Environment",
      "Sustainability & Environment",
    )
    .replace("Social and Family Development", "Social & Family Development")
    .replace("Culture, Community and Youth", "Culture, Community & Youth")
    .replace("Goods & services tax", "Goods & services tax (GST)")
    .replace(" (including COE)", " incl. COE")
    .replace(" (social portion)", " / social")
    .replace(" (economic portion)", " / economic")
    .replace(" (admin portion)", " / administration")
    .replace("Top-ups to statutory & trust funds", "Top-ups to funds")
    .replace(
      "Transfers to Singaporeans & businesses",
      "Direct special transfers",
    );
const truncate = (text, length) =>
  text.length > length ? `${text.slice(0, length - 1).trim()}…` : text;
function wrap(text, limit) {
  const rows = [""];
  for (const word of text.split(" ")) {
    const i = rows.length - 1;
    if (rows[i] && `${rows[i]} ${word}`.length > limit) rows.push(word);
    else rows[i] = `${rows[i]} ${word}`.trim();
  }
  return rows;
}

export function renderBudgetChart(container, budget, options) {
  const expanded = options.detail === "departments";
  const ministryView = options.detail !== "sectors";
  const raw = buildGraphData(budget, options.detail, {
    expandedMinistryId: options.expandedMinistryId,
  });
  const width = expanded ? 2080 : ministryView ? 1660 : 1360;
  const height = ministryView ? 1220 : 980;
  const nodeWidth = expanded ? 245 : ministryView ? 280 : 310;
  const graph = sankey()
    .nodeId((n) => n.id)
    .nodeAlign((n) => n.layer)
    .nodeSort(null)
    .nodeWidth(nodeWidth)
    .nodePadding(25)
    .extent([
      [22, 74],
      [width - 22, height - 45],
    ])
    .iterations(64)(structuredClone(raw));
  // Give the common budget a narrow spine while retaining the exact flow scale.
  for (const n of graph.nodes)
    if (n.role === "pool") {
      const centre = (n.x0 + n.x1) / 2;
      n.x0 = centre - 22;
      n.x1 = centre + 22;
    }
  const svg = el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "group",
    "data-testid": "budget-flow",
    "aria-label": `Singapore Budget FY${budget.fiscalYear}, revenue to sectors, ministries${expanded ? " and official budget programmes" : ""}`,
    class: expanded ? "agency-chart" : "overview-chart",
  });
  svg.append(
    el(
      "title",
      {},
      `Singapore Budget ${budget.fiscalYear}: follow the public money`,
    ),
  );
  svg.append(
    el(
      "desc",
      {},
      "All flow widths and block heights share the same dollar scale. Revenue enters a common budget; taxes are not earmarked to ministries. The last column shows official allocations for the selected ministry and fund top-ups, not entire agency budgets.",
    ),
  );
  const headings = [
    "01 / REVENUE & RETURNS",
    "02 / BUDGET",
    "03 / SECTORS",
    "04 / MINISTRIES",
    "05 / AGENCIES & PROGRAMMES",
  ];
  for (let layer = 0; layer <= (expanded ? 4 : ministryView ? 3 : 2); layer++) {
    const node = graph.nodes.find((n) => n.layer === layer);
    if (!node) continue;
    const x = layer === 1 ? node.x0 - 45 : node.x0;
    svg.append(el("text", { x, y: 23, class: "flow-column" }, headings[layer]));
    svg.append(
      el("line", {
        x1: x,
        x2: layer === 1 ? x + 150 : x + nodeWidth,
        y1: 36,
        y2: 36,
        stroke: "#50504e",
        "stroke-width": 0.7,
      }),
    );
  }
  const pool = graph.nodes.find((n) => n.role === "pool");
  svg.append(
    el(
      "text",
      {
        x: (pool.x0 + pool.x1) / 2,
        y: 61,
        "text-anchor": "middle",
        class: "pool-amount",
      },
      smallAmount(raw.resources),
    ),
  );
  const linkGroup = el("g", { "aria-hidden": "true" });
  for (const l of graph.links) {
    const c =
      l.source.role === "pool" ? nodeColour(l.target) : nodeColour(l.source);
    const path = el("path", {
      d: sankeyLinkHorizontal()(l),
      fill: "none",
      stroke: c,
      "stroke-width": l.width,
      opacity: 0.43,
      class: "flow-link",
      "data-source": l.source.id,
      "data-target": l.target.id,
      "data-amount": l.value,
    });
    l.element = path;
    linkGroup.append(path);
  }
  svg.append(linkGroup);
  const nodes = el("g");
  for (const n of graph.nodes) {
    const blockHeight = n.y1 - n.y0;
    const group = el("g", {
      class: "flow-node",
      tabindex: 0,
      role: "button",
      "aria-label": `${n.label}: S$${new Intl.NumberFormat("en-SG").format(n.amount)}. Select for details.`,
      "aria-pressed": "false",
      "data-node-id": n.id,
      "data-amount": n.amount,
      "data-role": n.role,
    });
    group.append(el("title", {}, `${n.label} · ${smallAmount(n.amount)}`));
    group.append(
      el("rect", {
        x: n.x0,
        y: n.y0,
        width: n.x1 - n.x0,
        height: blockHeight,
        fill: nodeColour(n),
      }),
    );
    if (n.role === "pool") {
      const x = (n.x0 + n.x1) / 2,
        y = (n.y0 + n.y1) / 2;
      group.append(
        el(
          "text",
          {
            x,
            y,
            transform: `rotate(-90 ${x} ${y})`,
            "text-anchor": "middle",
            class: "pool-label",
          },
          "OPERATING REVENUE + NIRC",
        ),
      );
    } else {
      const name = shorten(n.label),
        x = n.x0 + 12;
      const label = el("text", {
        class: `flow-label ${blockHeight < 42 ? "small-flow-label" : "block-label"}`,
        "data-label-for": n.id,
      });
      if (blockHeight >= 80) {
        const lines = wrap(name, Math.floor((n.x1 - n.x0 - 24) / 8.5)).slice(
          0,
          3,
        );
        const top = (n.y0 + n.y1) / 2 - (lines.length * 19 + 27) / 2 + 20;
        label.append(
          el(
            "tspan",
            { x, y: top, class: "flow-amount" },
            smallAmount(n.amount),
          ),
        );
        lines.forEach((line, i) =>
          label.append(
            el(
              "tspan",
              { x, dy: i === 0 ? 25 : 19 },
              i === lines.length - 1 ? truncate(line, 30) : line,
            ),
          ),
        );
      } else if (blockHeight >= 42) {
        const y = (n.y0 + n.y1) / 2 - 3;
        label.append(
          el(
            "tspan",
            { x, y, class: "flow-amount medium-amount" },
            smallAmount(n.amount),
          ),
        );
        label.append(
          el(
            "tspan",
            { x, dy: 20 },
            truncate(name, Math.floor((n.x1 - n.x0 - 24) / 7.5)),
          ),
        );
      } else {
        const y = (n.y0 + n.y1) / 2 + 5;
        label.append(
          el(
            "tspan",
            { x: n.x0 + 3, y, class: "flow-amount inline-amount" },
            smallAmount(n.amount),
          ),
        );
        label.append(
          el(
            "tspan",
            { x: n.x0 + 92, y },
            truncate(name, Math.floor((n.x1 - n.x0 - 95) / 7.1)),
          ),
        );
      }
      group.append(label);
    }
    group.addEventListener("mouseenter", (e) => {
      options.onHover?.(n, e);
      highlight(n.id);
    });
    group.addEventListener("mousemove", (e) => options.onMove?.(n, e));
    group.addEventListener("mouseleave", () => {
      options.onLeave?.();
      applyFilter(options.getSearch?.() || "");
    });
    group.addEventListener("focus", () => highlight(n.id));
    group.addEventListener("blur", () =>
      applyFilter(options.getSearch?.() || ""),
    );
    group.addEventListener("click", () => options.onSelect(n));
    group.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        options.onSelect(n);
      }
    });
    n.element = group;
    nodes.append(group);
  }
  svg.append(nodes);
  container.replaceChildren(svg);
  function highlight(id) {
    const links = graph.links.filter(
      (l) => l.source.id === id || l.target.id === id,
    );
    const ids = new Set([id]);
    links.forEach((l) => {
      ids.add(l.source.id);
      ids.add(l.target.id);
    });
    graph.nodes.forEach((n) =>
      n.element.classList.toggle("is-muted", !ids.has(n.id)),
    );
    graph.links.forEach((l) =>
      l.element.setAttribute("opacity", links.includes(l) ? 0.75 : 0.08),
    );
  }
  function applyFilter(query = "", selected) {
    const q = query.trim().toLowerCase();
    const matches = graph.nodes.filter(
      (n) =>
        n.role !== "pool" &&
        `${n.label} ${n.description || ""} ${n.id} ${n.ministryLabel || ""} ${n.label.includes("services tax") ? "GST" : ""}`
          .toLowerCase()
          .includes(q),
    );
    const ids = new Set(matches.map((n) => n.id));
    graph.nodes.forEach((n) => {
      n.element.classList.toggle("is-muted", Boolean(q) && !ids.has(n.id));
      n.element.classList.toggle("is-selected", n.id === selected);
      n.element.setAttribute("aria-pressed", String(n.id === selected));
    });
    graph.links.forEach((l) =>
      l.element.setAttribute(
        "opacity",
        q ? (ids.has(l.source.id) || ids.has(l.target.id) ? 0.7 : 0.06) : 0.43,
      ),
    );
    return matches;
  }
  return { graph, raw, applyFilter };
}
