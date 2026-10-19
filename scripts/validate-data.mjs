/** Structural/accounting gates. Independent source anchors live in tests/. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const sum = (items, field = 'amount') => items.reduce((total, item) => total + item[field], 0);
const integer = (value, name, allowNegative = false) => {
  assert(Number.isSafeInteger(value), `${name} must be an exact safe integer in SGD`);
  assert(allowNegative || value >= 0, `${name} must be non-negative`);
};
const close = (actual, published, tolerance, label) => assert(Math.abs(actual - published) <= tolerance, `${label}: ${actual} differs from ${published} by more than ${tolerance}`);

export function validateBudget(data, { verifySources = true } = {}) {
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.unit, 'SGD');
  assert(['Estimated', 'Revised', 'Actual'].includes(data.basis));
  assert(Number.isInteger(data.fiscalYear));
  assert.equal(data.period.start, `${data.fiscalYear}-04-01`);
  assert.equal(data.period.end, `${data.fiscalYear + 1}-03-31`);
  assert.match(data.budgetDate, /^\d{4}-\d{2}-\d{2}$/);
  assert(data.vintageNote && data.notes.length >= 5);
  const sources = new Map(data.sources.map(source => [source.id, source]));
  assert.equal(sources.size, data.sources.length, 'Source IDs must be unique');
  if (verifySources) for (const source of data.sources) {
    assert(source.url.startsWith('https://'));
    const actualHash = createHash('sha256').update(readFileSync(path.resolve(root, source.file))).digest('hex');
    assert.equal(actualHash, source.sha256, `${source.id} checksum changed`);
  }
  const ids = new Set();
  const row = (item, context) => {
    assert(item.id && item.label, `${context} lacks ID or label`);
    assert(!ids.has(item.id), `Duplicate ID: ${item.id}`);
    ids.add(item.id);
    integer(item.amount, `${item.id}.amount`);
    assert(sources.has(item.sourceId), `${item.id} has no known source`);
    integer(item.precision, `${item.id}.precision`);
    assert(item.precision > 0);
  };
  for (const item of data.revenue) row(item, 'revenue');
  assert(data.revenue.length > 0);
  for (const sector of data.sectors) {
    row(sector, 'sector');
    integer(sector.operating, `${sector.id}.operating`);
    integer(sector.development, `${sector.id}.development`);
    assert.equal(sector.amount, sector.operating + sector.development, `${sector.id} expenditure split`);
    assert(sector.ministries.length > 0);
    for (const ministry of sector.ministries) {
      row(ministry, 'ministry');
      integer(ministry.operating, `${ministry.id}.operating`);
      integer(ministry.development, `${ministry.id}.development`);
      assert.equal(ministry.amount, ministry.operating + ministry.development, `${ministry.id} expenditure split`);
    }
    for (const field of ['amount', 'operating', 'development']) assert.equal(sum(sector.ministries, field), sector[field], `${sector.id} ministries sum (${field})`);
  }
  for (const transfer of data.specialTransfers) {
    row(transfer, 'transfer');
    if (transfer.children) {
      for (const child of transfer.children) row(child, 'transfer child');
      assert.equal(sum(transfer.children), transfer.amount, `${transfer.id} children sum`);
    }
  }
  const t = data.totals;
  for (const [key, value] of Object.entries(t)) integer(value, `totals.${key}`, /Balance|Position/.test(key));
  assert.equal(sum(data.revenue), t.operatingRevenue, 'revenue sums to operating revenue');
  assert.equal(sum(data.sectors), t.totalExpenditure, 'sectors sum to total expenditure');
  assert.equal(sum(data.sectors, 'operating'), t.operatingExpenditure);
  assert.equal(sum(data.sectors, 'development'), t.developmentExpenditure);
  assert.equal(t.operatingExpenditure + t.developmentExpenditure, t.totalExpenditure);
  assert.equal(sum(data.specialTransfers), t.specialTransfers);
  assert.equal(t.directTransfers + t.fundTopups, t.specialTransfers);
  assert.equal(t.totalRevenue, t.operatingRevenue + t.nirc);
  assert.equal(t.totalOutlays, t.totalExpenditure + t.specialTransfers);
  const r = data.reconciliation;
  assert.equal(r.role, 'reconciliation');
  assert.equal(r.includedInSpending, false);
  integer(r.amount, 'rounding reconciliation', true);
  assert(Math.abs(r.amount) <= r.maximumAbsoluteAmount && r.maximumAbsoluteAmount <= 1_000_000, 'Rounding must stay within the stated publication precision');
  assert.equal(t.totalRevenue, t.totalOutlays + t.overallBudgetBalance + r.amount, 'pooled budget conserves every SGD including explicit published rounding');
  // Do not replace the source's independently rounded balances with arithmetic results.
  close(t.operatingRevenue - t.totalExpenditure, t.primaryBalance, 500_000, 'primary balance');
  close(t.operatingRevenue - t.totalExpenditure - t.directTransfers, t.basicBalance, 500_000, 'basic balance');
  close(t.overallBudgetBalance + t.capitalisation - t.depreciation - t.singaInterest, t.overallFiscalPosition, 2_000_000, 'SINGA bridge');
  for (const [key, published] of Object.entries(data.publishedRoundedTotals)) close(t[key], published, 500_000, `source rounded total ${key}`);
  return { fiscalYear: data.fiscalYear, revenue: data.revenue.length, ministries: data.sectors.flatMap(s => s.ministries).length, reconciliation: r.amount };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readdirSync(path.resolve(root, 'public/data')).filter(file => /^budget-\d{4}\.json$/.test(file));
  assert(files.length > 0, 'No annual budget datasets found');
  const basisLabels = { Estimated: 'Estimates', Revised: 'Revised estimates', Actual: 'Actuals' };
  const expectedIndex = [];
  for (const file of files) {
    const data = JSON.parse(readFileSync(path.resolve(root, 'public/data', file), 'utf8'));
    const result = validateBudget(data);
    assert.equal(file, `budget-${data.fiscalYear}.json`, 'Annual filename and fiscal year must agree');
    expectedIndex.push({ year: data.fiscalYear, file, label: `FY${data.fiscalYear} · ${basisLabels[data.basis]}` });
    console.log(`Validated FY${result.fiscalYear}: ${result.revenue} revenue categories, ${result.ministries} ministry portions, S$${result.reconciliation.toLocaleString('en-SG')} published rounding.`);
  }
  expectedIndex.sort((a, b) => b.year - a.year);
  const index = JSON.parse(readFileSync(path.resolve(root, 'public/data/index.json'), 'utf8'));
  assert.deepEqual(index, expectedIndex, 'Annual index is stale; rerun the importer');
}
