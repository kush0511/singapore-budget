/** Pure accounting graph. All computations retain the source integer SGD amounts. */
export const sum = (values) => values.reduce((a, b) => a + b, 0);

// The fiscal bridge is published in S$ million. Keeping all three decimal
// places in billions prevents its displayed terms from contradicting the sum.
export const formatBridgeAmount = (value) => `S$${(value / 1e9).toFixed(3)}b`;

export function buildGraphData(budget, detail = "ministries") {
  const t = budget.totals;
  const nodes = [];
  const links = [];
  const add = (node) => {
    nodes.push(node);
    return node.id;
  };
  const link = (source, target, value) => {
    if (value > 0) links.push({ source, target, value });
  };
  const resources = t.operatingRevenue + t.nirc;
  const surplus = Math.max(0, t.overallBudgetBalance);
  const deficit = Math.max(0, -t.overallBudgetBalance);
  const rounding =
    resources + deficit - t.totalExpenditure - t.specialTransfers - surplus;
  const poolTotal = resources + deficit + Math.max(0, -rounding);
  add({
    id: "budget-pool",
    label: "Pooled budget",
    amount: poolTotal,
    layer: 1,
    role: "pool",
    sourceId: "mof-analysis",
    description:
      "Operating revenue and the Net Investment Returns Contribution enter a common budget. The diagram does not assign individual taxes to ministries.",
  });
  for (const row of budget.revenue) {
    add({
      ...row,
      layer: 0,
      role: "revenue",
      description:
        row.description ||
        (row.id === "fees-and-charges"
          ? "Government fees and charges, including Certificate of Entitlement (COE) premiums. COE is included here, not counted again as a separate receipt."
          : "An operating revenue category in the official Revenue and Expenditure Estimates."),
    });
    link(row.id, "budget-pool", row.amount);
  }
  add({
    id: "nirc",
    label: "Net investment returns",
    amount: t.nirc,
    layer: 0,
    role: "nirc",
    sourceId: "mof-analysis",
    description:
      "Net Investment Returns Contribution (NIRC): the contribution to the budget from investing Singapore’s reserves. This is separate from operating revenue; it is not the total investment return.",
  });
  link("nirc", "budget-pool", t.nirc);
  if (deficit) {
    add({
      id: "deficit",
      label: "Budget deficit",
      amount: deficit,
      layer: 0,
      role: "balance",
      sourceId: "mof-analysis",
      description:
        "The published overall budget deficit; shown as a balancing requirement, not as tax revenue.",
    });
    link("deficit", "budget-pool", deficit);
  }
  for (const sector of budget.sectors) {
    add({
      ...sector,
      layer: 2,
      role: "sector",
      description:
        "A spending sector in the official Ministry of Finance classification. Its ministries and programme portions add to this sector total.",
    });
    link("budget-pool", sector.id, sector.amount);
    if (detail === "ministries")
      for (const ministry of sector.ministries) {
        const id = `${sector.id}:${ministry.id}`;
        const portion =
          ministry.id.startsWith("digital-") ||
          ministry.id.startsWith("manpower-");
        const label = portion
          ? `${ministry.label} (${sector.id === "social-development" ? "social" : sector.id === "economic-development" ? "economic" : "admin"} portion)`
          : ministry.label;
        add({
          ...ministry,
          id,
          label,
          layer: 3,
          role: "ministry",
          sectorId: sector.id,
          sectorLabel: sector.label,
          description:
            ministry.description ||
            ministry.note ||
            ministry.notes ||
            "A ministry or programme portion in this spending sector. Operating and development expenditure are included.",
        });
        link(sector.id, id, ministry.amount);
      }
  }
  add({
    id: "special-transfers",
    label: "Special transfers",
    amount: t.specialTransfers,
    layer: 2,
    role: "transfer",
    sourceId: "mof-estimates",
    description:
      "Special transfers include transfers to households and businesses, plus top-ups to endowment and trust funds. These are separate from ministry expenditure.",
  });
  link("budget-pool", "special-transfers", t.specialTransfers);
  if (detail === "ministries")
    for (const row of budget.specialTransfers || []) {
      add({
        ...row,
        id: `transfer:${row.id}`,
        layer: 3,
        role: "transfer-detail",
        sourceId: row.sourceId || "mof-analysis",
        description:
          row.description ||
          "A component of special transfers; excluded from the ministry expenditure total.",
      });
      link("special-transfers", `transfer:${row.id}`, row.amount);
    }
  if (surplus) {
    add({
      id: "budget-surplus",
      label: "Overall budget surplus",
      amount: surplus,
      layer: 2,
      role: "balance",
      sourceId: "mof-analysis",
      description:
        "The published overall budget balance, before the separate infrastructure capitalisation and SINGA financing adjustments. This is unspent balance, not expenditure.",
    });
    link("budget-pool", "budget-surplus", surplus);
  }
  if (rounding) {
    add({
      id: "published-rounding",
      label: "Published rounding",
      amount: Math.abs(rounding),
      layer: rounding > 0 ? 2 : 0,
      role: "rounding",
      sourceId: "mof-analysis",
      description:
        "A precision reconciliation between whole-dollar estimates and NIRC / overall budget balance published to S$1 million. This is not spending or revenue.",
    });
    link(
      rounding > 0 ? "budget-pool" : "published-rounding",
      rounding > 0 ? "published-rounding" : "budget-pool",
      Math.abs(rounding),
    );
  }
  return { nodes, links, resources, poolTotal, rounding };
}

export function tableRows(budget) {
  const t = budget.totals;
  const rows = budget.revenue.map((r) => ({
    ...r,
    group: "Operating revenue",
    denominator: t.operatingRevenue,
  }));
  rows.push({
    id: "nirc",
    label: "Net Investment Returns Contribution",
    amount: t.nirc,
    group: "Combined resources",
    sourceId: "mof-analysis",
    denominator: t.operatingRevenue + t.nirc,
  });
  for (const s of budget.sectors) {
    rows.push({
      ...s,
      group: "Ministry expenditure",
      kind: "sector",
      shareBase: "Ministry expenditure",
      denominator: t.totalExpenditure,
    });
    for (const m of s.ministries)
      rows.push({
        ...m,
        id: `${s.id}:${m.id}`,
        group: s.label,
        shareBase: "Ministry expenditure",
        kind: "ministry",
        denominator: t.totalExpenditure,
      });
  }
  rows.push({
    id: "special-transfers",
    label: "Special transfers",
    amount: t.specialTransfers,
    group: "Separate budget uses",
    sourceId: "mof-estimates",
    denominator: null,
  });
  for (const row of budget.specialTransfers || [])
    rows.push({
      ...row,
      id: `transfer:${row.id}`,
      group: "Special transfers",
      kind: "transfer-detail",
      denominator: t.specialTransfers,
    });
  rows.push({
    id: "budget-balance",
    label: "Overall budget balance",
    amount: t.overallBudgetBalance,
    group: "Budget balance",
    sourceId: "mof-analysis",
    denominator: null,
  });
  const rounding = buildGraphData(budget, "sectors").rounding;
  if (rounding)
    rows.push({
      id: "published-rounding",
      label: "Published rounding reconciliation",
      amount: rounding,
      group: "Precision reconciliation",
      sourceId: "mof-analysis",
      denominator: null,
    });
  return rows;
}
