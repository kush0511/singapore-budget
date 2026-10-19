// Independent controls transcribed from separately retrieved MOF publications.
// Do not regenerate these expected values using the application's importer.
// Keep this FY2026 fixture when adding a new year's independently checked fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateBudget } from '../scripts/validate-data.mjs';
import { buildGraphData, tableRows, formatBridgeAmount } from '../src/model.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const json = (path) => JSON.parse(read(path));
const budget = json('public/data/budget-2026.json');
const sum = (rows, key = 'amount') => rows.reduce((total, row) => total + row[key], 0);

// Full Estimates printed pp.1–2. C00 includes vehicle quota premiums.
const revenueControls = {
  'corporate-income-tax': 37_768_490_000,
  'personal-income-tax': 21_797_023_000,
  'goods-and-services-tax': 22_254_882_000,
  'fees-and-charges': 13_328_102_000,
  'foreign-worker-levy': 7_455_384_000,
  'asset-taxes': 7_318_084_000,
  'stamp-duty': 6_918_906_000,
  'customs-excise-carbon': 4_155_109_000,
  'betting-taxes': 3_772_189_000,
  'motor-vehicle-taxes': 2_800_101_000,
  'withholding-tax': 2_625_446_000,
  'other-revenue': 2_007_975_000,
  'other-taxes': 1_634_405_000,
  'statutory-board-contributions': 507_847_000,
  'water-conservation-tax': 410_000_000,
};

// Full Estimates printed p.10: [operating, development, total].
const sectorControls = {
  'social-development': [58_904_385_000, 6_905_621_100, 65_810_006_100],
  'security-external-relations': [33_145_346_500, 4_127_607_000, 37_272_953_500],
  'economic-development': [7_242_115_500, 22_506_943_800, 29_749_059_300],
  'government-administration': [3_977_324_800, 514_099_600, 4_491_424_400],
};
const ministryControls = {
  health: [20_035_362_700, 2_467_566_400, 22_502_929_100],
  education: [15_265_000_000, 1_185_000_000, 16_450_000_000],
  'national-development': [8_640_058_800, 1_447_092_900, 10_087_151_700],
  'social-family-development': [5_811_958_800, 259_759_300, 6_071_718_100],
  'sustainability-environment': [2_890_704_400, 802_209_000, 3_692_913_400],
  'culture-community-youth': [2_407_711_100, 677_912_500, 3_085_623_600],
  'manpower-social': [2_652_572_800, 0, 2_652_572_800],
  'digital-social': [1_201_016_400, 66_081_000, 1_267_097_400],
  defence: [23_315_060_400, 1_618_819_600, 24_933_880_000],
  'home-affairs': [9_232_333_600, 2_462_087_400, 11_694_421_000],
  'foreign-affairs': [597_952_500, 46_700_000, 644_652_500],
  transport: [3_109_174_200, 13_040_422_500, 16_149_596_700],
  'trade-industry': [1_861_576_000, 9_241_525_400, 11_103_101_400],
  'manpower-economic': [1_268_426_600, 178_690_100, 1_447_116_700],
  'digital-economic': [1_002_938_700, 46_305_800, 1_049_244_500],
  finance: [1_252_306_600, 68_615_100, 1_320_921_700],
  'organs-of-state': [855_133_600, 28_245_200, 883_378_800],
  'prime-ministers-office': [716_843_400, 123_553_300, 840_396_700],
  'digital-administration': [780_732_100, 6_638_400, 787_370_500],
  law: [372_309_100, 287_047_600, 659_356_700],
};

// Analysis Table 3.1a, printed p.24. All controls here are published S$m.
const fiscalMillionControls = {
  operatingRevenue: 134_754,
  totalExpenditure: 137_323,
  operatingExpenditure: 103_269,
  developmentExpenditure: 34_054,
  primaryBalance: -2_570,
  specialTransfers: 21_736,
  directTransfers: 2_836,
  basicBalance: -5_406,
  fundTopups: 18_900,
  nirc: 28_482,
  overallBudgetBalance: 4_176,
  capitalisation: 5_019,
  depreciation: 0,
  singaInterest: 652,
  overallFiscalPosition: 8_543,
};

test('audit: annual vintage, estimate basis, fiscal period and units are explicit', () => {
  assert.equal(budget.fiscalYear, 2026);
  assert.equal(budget.basis, 'Estimated');
  assert.equal(budget.unit, 'SGD');
  assert.equal(budget.budgetDate, '2026-02-12');
  assert.deepEqual(budget.period, { start: '2026-04-01', end: '2027-03-31' });
  assert.match(budget.vintageNote, /April and July/);
  assert.match(budget.vintageNote, /not folded/);
});

test('audit: independently downloaded official PDFs match immutable source evidence', () => {
  const controls = {
    'mof-analysis': '9e26d6b489add446e206b8df0e882039eac14fb3775ca5ff7d8987418c556561',
    'mof-estimates': '3455edce0d89ab1c5ef7101b813d1d668c065de43de12512b1238b6a4d08ca97',
  };
  for (const [id, expected] of Object.entries(controls)) {
    const source = budget.sources.find((item) => item.id === id);
    assert.ok(source, `Missing source ${id}`);
    assert.equal(source.sha256, expected, `${id} changed: independently re-audit the publication`);
    assert.equal(createHash('sha256').update(read(source.file)).digest('hex'), expected);
  }
});

test('audit: every revenue category matches independent exact-dollar controls', () => {
  assert.equal(budget.revenue.length, 15);
  assert.deepEqual(Object.fromEntries(budget.revenue.map((row) => [row.id, row.amount])), revenueControls);
  assert.equal(sum(budget.revenue), 134_753_943_000);
  assert.equal(budget.totals.operatingRevenue, 134_753_943_000);
  assert.match(budget.revenue.find((row) => row.id === 'fees-and-charges').label, /including COE/);
});

test('audit: every sector and each ministry portion matches independent source controls', () => {
  const triplets = (rows) => Object.fromEntries(rows.map((row) => [row.id, [row.operating, row.development, row.amount]]));
  assert.equal(budget.sectors.length, 4);
  assert.deepEqual(triplets(budget.sectors), sectorControls);
  assert.deepEqual(triplets(budget.sectors.flatMap((row) => row.ministries)), ministryControls);
  for (const sector of budget.sectors) {
    assert.equal(sector.operating + sector.development, sector.amount);
    for (const field of ['operating', 'development', 'amount']) {
      assert.equal(sum(sector.ministries, field), sector[field], `${sector.id} ${field} does not reconcile`);
    }
    for (const ministry of sector.ministries) {
      assert.equal(ministry.operating + ministry.development, ministry.amount, ministry.id);
    }
  }
  assert.equal(sum(budget.sectors), 137_323_443_300);
  assert.equal(sum(budget.sectors, 'operating'), 103_269_171_800);
  assert.equal(sum(budget.sectors, 'development'), 34_054_271_500);
});

test('audit: preserve all official fiscal controls without replacing published balances', () => {
  for (const [key, millions] of Object.entries(fiscalMillionControls)) {
    assert.equal(budget.publishedRoundedTotals[key], millions * 1_000_000, key);
    assert.ok(Math.abs(budget.totals[key] - millions * 1_000_000) <= 500_000, `${key}: outside source rounding precision`);
  }
  for (const key of ['primaryBalance', 'basicBalance', 'nirc', 'overallBudgetBalance', 'capitalisation', 'singaInterest', 'overallFiscalPosition']) {
    assert.equal(budget.totals[key], fiscalMillionControls[key] * 1_000_000, key);
    assert.equal(budget.precision[key], 1_000_000, `${key}: do not imply dollar precision`);
  }
});

test('audit: special transfers use disjoint direct-transfer and fund top-up children', () => {
  assert.equal(budget.totals.directTransfers, 2_836_175_400);
  assert.equal(budget.totals.fundTopups, 18_900_000_000);
  assert.equal(budget.totals.specialTransfers, 21_736_175_400);
  assert.equal(sum(budget.specialTransfers), budget.totals.specialTransfers);
  const funds = budget.specialTransfers.find((row) => row.id === 'fund-topups');
  assert.deepEqual(Object.fromEntries(funds.children.map((row) => [row.id, row.amount])), {
    'changi-airport-development-fund': 6_000_000_000,
    'national-productivity-fund': 6_000_000_000,
    'national-research-fund': 5_000_000_000,
    'financial-sector-development-fund': 1_500_000_000,
    'long-term-care-support-fund': 400_000_000,
  });
  assert.equal(sum(funds.children), funds.amount);
});

test('audit: all amounts use safe integer SGD, with no synthetic negative spending', () => {
  const rows = [...budget.revenue, ...budget.sectors, ...budget.sectors.flatMap((row) => row.ministries), ...budget.specialTransfers,
    ...budget.specialTransfers.flatMap((row) => row.children ?? [])];
  for (const row of rows) {
    assert.ok(Number.isSafeInteger(row.amount) && row.amount >= 0, row.id);
  }
  for (const [key, amount] of Object.entries(budget.totals)) assert.ok(Number.isSafeInteger(amount), key);
});

test('audit: SINGA adjustments bridge the budget balance to fiscal position separately', () => {
  const t = budget.totals;
  assert.equal(t.overallBudgetBalance + t.capitalisation - t.depreciation - t.singaInterest, 8_543_000_000);
  assert.equal(t.overallFiscalPosition, 8_543_000_000);
  assert.equal(t.totalRevenue, t.operatingRevenue + t.nirc);
  assert.equal(t.totalOutlays, t.totalExpenditure + t.specialTransfers);
  assert.equal(t.totalOutlays, 159_059_618_700);
  assert.notEqual(t.totalExpenditure, t.totalOutlays);
  assert.notEqual(t.overallBudgetBalance, t.overallFiscalPosition);
});

test('audit: rounding reconciles exactly and cannot be counted as a spending programme', () => {
  const t = budget.totals;
  const rounding = budget.reconciliation;
  assert.equal(rounding.amount, 324_300);
  assert.equal(rounding.role, 'reconciliation');
  assert.equal(rounding.includedInSpending, false);
  assert.ok(Math.abs(rounding.amount) <= 1_000_000);
  assert.equal(t.totalRevenue, t.totalExpenditure + t.specialTransfers + t.overallBudgetBalance + rounding.amount);
  assert.match(rounding.note, /nearest S\$1 million/);
  assert.match(rounding.note, /not government spending/);
  assert.equal(budget.sectors.some((row) => row.id === rounding.id), false);
});

test('audit: independent MOF data.gov snapshot agrees on all fiscal balances', () => {
  const snapshot = json('data/sources/data-gov-fiscal.json').result;
  assert.equal(snapshot.records.length, snapshot.total, 'Snapshot must not be a truncated API page');
  const rows = snapshot.records.filter((row) => row.year_of_balance === '2026' && row.actual_revised_estimated === 'Estimated');
  const controls = {
    'Basic Balance': -5_406,
    'Capitalisation of Nationally Significant Infrastructure': 5_019,
    'Depreciation of Nationally Significant Infrastructure': 0,
    'Net Investment Income/Returns Contribution': 28_482,
    'Operating Revenue': 134_754,
    'Overall Budget Balance': 4_176,
    'Overall Fiscal Position': 8_543,
    'Primary Balance': -2_570,
    'SINGA Interest Costs and Loan Expenses': 652,
    'Special Transfers Excluding Top-ups to Statutory and Trust Funds': 2_836,
    'Top-ups to Statutory and Trust Funds': 18_900,
    'Total Expenditure': 137_323,
  };
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.item, Number(row.amount_in_millions)])), controls);
});

test('audit: release validator rejects deliberate accounting corruptions', async (t) => {
  const corruptions = {
    'millions mistakenly supplied as SGD': (data) => { data.revenue[0].amount /= 1_000_000; },
    'one ministry allocation silently increases': (data) => { data.sectors[0].ministries[0].amount += 1; },
    'funds counted again as extra direct special transfers': (data) => { data.totals.specialTransfers += data.totals.fundTopups; },
    'official fiscal position substituted for budget balance': (data) => { data.totals.overallBudgetBalance = data.totals.overallFiscalPosition; },
    'rounding remainder silently discarded': (data) => { data.reconciliation.amount = 0; },
    'rounding counted as programme expenditure': (data) => { data.reconciliation.includedInSpending = true; },
    'ordinary borrowing added to operating revenue': (data) => { data.revenue.push({ ...data.revenue[0], id: 'borrowing', label: 'Borrowing', amount: 1_000_000_000 }); },
    'one ministry portion duplicated across sectors': (data) => { data.sectors[1].ministries.push(data.sectors[0].ministries[0]); },
  };
  for (const [label, mutate] of Object.entries(corruptions)) {
    await t.test(label, () => {
      const changed = structuredClone(budget);
      mutate(changed);
      assert.throws(() => validateBudget(changed, { verifySources: false }), label);
    });
  }
});

test('audit: both graph detail levels conserve every integer SGD at every intermediate node', async (t) => {
  for (const detail of ['sectors', 'ministries']) await t.test(detail, () => {
    const graph = buildGraphData(budget, detail);
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    assert.equal(nodes.size, graph.nodes.length, 'Graph node IDs must be unique');
    const incoming = new Map(), outgoing = new Map();
    for (const link of graph.links) {
      assert.ok(nodes.has(link.source), `Unknown source ${link.source}`);
      assert.ok(nodes.has(link.target), `Unknown target ${link.target}`);
      assert.ok(Number.isSafeInteger(link.value) && link.value > 0, 'Links use positive exact integer SGD');
      incoming.set(link.target, (incoming.get(link.target) ?? 0) + link.value);
      outgoing.set(link.source, (outgoing.get(link.source) ?? 0) + link.value);
    }
    for (const node of graph.nodes) {
      if (incoming.has(node.id)) assert.equal(incoming.get(node.id), node.amount, `${node.id} incoming`);
      if (outgoing.has(node.id)) assert.equal(outgoing.get(node.id), node.amount, `${node.id} outgoing`);
      if (incoming.has(node.id) && outgoing.has(node.id)) assert.equal(incoming.get(node.id), outgoing.get(node.id), `${node.id} conservation`);
    }
    const sources = graph.nodes.filter((node) => !incoming.has(node.id));
    const destinations = graph.nodes.filter((node) => !outgoing.has(node.id));
    assert.equal(sum(sources), 163_235_943_000);
    assert.equal(sum(destinations), 163_235_943_000);
    assert.equal(graph.resources, 163_235_943_000);
    assert.equal(graph.rounding, 324_300);
    assert.equal(nodes.get('budget-surplus').amount, 4_176_000_000);
    assert.equal(nodes.get('special-transfers').amount, 21_736_175_400);
    assert.equal(nodes.get('published-rounding').amount, 324_300);
    assert.equal(nodes.get('published-rounding').role, 'rounding');
    assert.equal(graph.nodes.some((node) => ['capitalisation', 'singaInterest', 'overallFiscalPosition'].includes(node.id)), false, 'SINGA is a separate accounting bridge');
    assert.equal(graph.nodes.filter((node) => node.role === 'ministry').length, detail === 'ministries' ? 20 : 0);
  });
});

test('audit: graph flows preserve independently anchored categories and never draw earmarked tax-to-ministry paths', () => {
  const graph = buildGraphData(budget, 'ministries');
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.deepEqual(Object.fromEntries(graph.nodes.filter((node) => node.role === 'revenue').map((node) => [node.id, node.amount])), revenueControls);
  assert.equal(nodes.get('nirc').amount, 28_482_000_000);
  assert.deepEqual(Object.fromEntries(graph.nodes.filter((node) => node.role === 'sector').map((node) => [node.id, node.amount])), Object.fromEntries(Object.entries(sectorControls).map(([id, controls]) => [id, controls[2]])));
  for (const link of graph.links) {
    const source = nodes.get(link.source), target = nodes.get(link.target);
    if (['revenue', 'nirc'].includes(source.role)) assert.equal(target.role, 'pool');
    if (target.role === 'ministry') assert.equal(source.role, 'sector');
    if (source.role === 'sector') assert.equal(target.role, 'ministry');
  }
  for (const sector of budget.sectors) for (const ministry of sector.ministries) {
    assert.equal(nodes.get(`${sector.id}:${ministry.id}`).amount, ministryControls[ministry.id][2]);
  }
});

test('audit: table amounts and share denominators follow disjoint accounting scopes', () => {
  const rows = tableRows(budget);
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.equal(byId.size, rows.length);
  for (const [id, amount] of Object.entries(revenueControls)) {
    assert.equal(byId.get(id).amount, amount);
    assert.equal(byId.get(id).denominator, 134_753_943_000, id);
  }
  assert.equal(byId.get('nirc').denominator, 163_235_943_000);
  assert.match(byId.get('nirc').shareBase ?? byId.get('nirc').group, /Combined resources/);
  assert.equal(byId.get('nirc').sourceId, 'mof-analysis');
  for (const sector of budget.sectors) {
    assert.equal(byId.get(sector.id).denominator, 137_323_443_300);
    for (const ministry of sector.ministries) assert.equal(byId.get(`${sector.id}:${ministry.id}`).denominator, 137_323_443_300);
  }
  for (const transfer of budget.specialTransfers) assert.equal(byId.get(`transfer:${transfer.id}`).denominator, 21_736_175_400);
  assert.equal(byId.get('budget-balance').amount, 4_176_000_000);
  assert.equal(byId.get('budget-balance').denominator, null);
  assert.equal(byId.get('budget-balance').sourceId, 'mof-analysis');
  assert.equal(byId.get('published-rounding').amount, 324_300);
  assert.equal(byId.get('published-rounding').denominator, null);
  assert.equal(byId.get('published-rounding').sourceId, 'mof-analysis');
});

test('audit: repeated ministries retain the official programme-scope explanations', () => {
  const graph = buildGraphData(budget, 'ministries');
  const lookup = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.match(lookup.get('social-development:manpower-social').description, /Financial Security for Singaporeans/);
  assert.match(lookup.get('economic-development:manpower-economic').description, /Economic-development portion/);
  assert.match(lookup.get('economic-development:digital-economic').description, /Cyber Security Agency/);
  assert.match(lookup.get('government-administration:digital-administration').description, /Government Technology Agency/);
  for (const id of ['social-development:manpower-social', 'economic-development:manpower-economic', 'social-development:digital-social', 'economic-development:digital-economic', 'government-administration:digital-administration']) {
    assert.match(lookup.get(id).label, /·|\(|portion/i, `Distinguish the scope of repeated ministry ${id}`);
  }
});

test('audit: displayed fiscal bridge retains the published million-dollar precision and adds up visibly', () => {
  const totals = budget.totals;
  const shown = [totals.overallBudgetBalance, totals.capitalisation,
    totals.singaInterest + totals.depreciation, totals.overallFiscalPosition].map(formatBridgeAmount);
  assert.deepEqual(shown, ['S$4.176b', 'S$5.019b', 'S$0.652b', 'S$8.543b']);
  // Read the displayed terms, not their hidden source amounts, back into
  // integers in S$ million. Two-decimal-billion labels would fail this check.
  const displayedMillions = shown.map((text) => {
    const match = /^S\$(-?\d+)\.(\d{3})b$/.exec(text);
    assert.ok(match, `Bridge label loses published precision: ${text}`);
    const negative = match[1].startsWith('-');
    return Number(match[1]) * 1_000 + (negative ? -1 : 1) * Number(match[2]);
  });
  assert.equal(displayedMillions[0] + displayedMillions[1] - displayedMillions[2], displayedMillions[3]);
  assert.equal(formatBridgeAmount(0), 'S$0.000b');
  assert.equal(formatBridgeAmount(-4_176_000_000), 'S$-4.176b');
});
