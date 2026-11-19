import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

await import('./gates-model.js');
await import('./quick-model.js');
const Q = globalThis.QuickModel;
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= (tolerance || 1e-6), actual + ' is not ' + expected);

const flat = {basis: 'price', price: 1000000, rent1: 100000, opexPct: 20, growthPct: 0, costsPct: 0, ltvPct: 50, ratePct: 6, holdYears: 1, exitYieldPct: 8, saleCostsPct: 0};

test('a flat one year deal bought and sold at 8% returns 8% unlevered and 10% levered', () => {
  const out = Q.compute(flat);
  assert.equal(out.ok, true);
  near(out.noi1, 80000);
  near(out.exitValue, 1000000);
  near(out.unleveredIrr, 0.08);
  near(out.equity, 500000);
  near(out.leveredIrr, 0.10);
  near(out.multiple, 1.10);
  near(out.interestCover, 80000 / 30000);
  near(out.breakEvenYield, 80000 / 950000);
});

test('entry on a NIY basis gives the same price as typing the price', () => {
  const byYield = Q.compute(Object.assign({}, flat, {basis: 'niy', price: '', niyPct: 8}));
  near(byYield.price, 1000000, 0.01);
  const withCosts = Q.compute(Object.assign({}, flat, {basis: 'niy', price: '', niyPct: 5, costsPct: 6.8}));
  near(withCosts.noi1 / withCosts.allIn, 0.05);
  near(withCosts.allIn, withCosts.price * 1.068, 0.01);
});

test('rent growth lifts each year and the exit uses the year after sale', () => {
  const out = Q.compute(Object.assign({}, flat, {growthPct: 3, holdYears: 5, costsPct: 6.8, saleCostsPct: 2}));
  near(out.years[4].rent, 100000 * Math.pow(1.03, 4), 0.01);
  near(out.exitNoi, 80000 * Math.pow(1.03, 5), 0.01);
  near(out.netSale, out.exitValue * 0.98, 0.01);
  assert.equal(out.flows.levered.length, 6);
  near(out.flows.unlevered[0], -1068000, 0.01);
  // The stated IRR discounts the stated cash flows to nil.
  const npv = out.flows.levered.reduce((sum, flow, year) => sum + flow / Math.pow(1 + out.leveredIrr, year), 0);
  near(npv, 0, 1);
});

test('no debt means levered equals unlevered and interest cover is not shown', () => {
  const out = Q.compute(Object.assign({}, flat, {ltvPct: 0, holdYears: 3}));
  near(out.leveredIrr, out.unleveredIrr, 1e-9);
  assert.equal(out.interestCover, null);
});

test('it names what is missing and never guesses a rent or a price', () => {
  const out = Q.compute({basis: 'price', opexPct: 20, holdYears: 3, exitYieldPct: 6});
  assert.equal(out.ok, false);
  assert.deepEqual(out.missing, ['year one rent', 'purchase price']);
  assert.deepEqual(Q.compute(Object.assign({}, flat, {opexPct: ''})).missing, ['opex']);
});

test('the quick screen uses the site hurdle settings', () => {
  const config = JSON.parse(readFileSync(new URL('../data/market-entry/gates.json', import.meta.url)));
  const limits = globalThis.GatesModel.thresholds(Object.assign({}, config, {anchors: Object.assign({}, config.anchors, {holdYears: 1})}));
  const rows = Q.screen(Q.compute(flat), limits);
  assert.equal(rows.length, 8);
  const by = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.equal(by['Yield on cost'].limit, limits.yoc);
  assert.equal(by['Yield on cost'].pass, 0.08 >= limits.yoc);
  assert.equal(by['Unlevered IRR'].pass, 0.08 >= limits.unleveredIrr);
  assert.equal(by['Loan share of price'].pass, true);
});

test('no fee mode ignores any fee figures left in the boxes', () => {
  const plain = Q.compute(flat);
  const stale = Q.compute(Object.assign({}, flat, {feeMode: 'none', feeAnnualPct: 1, feeEntryPct: 1, feeExitPct: 0.5}));
  near(stale.leveredIrr, plain.leveredIrr, 1e-12);
  assert.equal(stale.fees.total, 0);
});

test('a yearly fee comes out of cash each year but leaves the sale value alone', () => {
  const plain = Q.compute(Object.assign({}, flat, {holdYears: 3}));
  const out = Q.compute(Object.assign({}, flat, {holdYears: 3, feeMode: 'annual', feeAnnualPct: 1, feeEntryPct: 5, feeExitPct: 5}));
  near(out.fees.yearly, 10000);
  near(out.exitValue, plain.exitValue);
  near(out.netSale, plain.netSale);
  near(out.allIn, plain.allIn);
  near(out.years[0].cash, plain.years[0].cash - 10000);
  near(out.interestCover, 70000 / 30000);
  near(out.cashOnCash, 40000 / 500000);
  near(out.fees.total, 30000);
  assert.ok(out.leveredIrr < plain.leveredIrr);
});

test('entry and exit fees change what you pay in and what you get out, not the yearly cash', () => {
  const plain = Q.compute(flat);
  const out = Q.compute(Object.assign({}, flat, {feeMode: 'entryexit', feeEntryPct: 1, feeExitPct: 0.5, feeAnnualPct: 9}));
  near(out.fees.entry, 10000);
  near(out.allIn, 1010000);
  near(out.equity, 510000);
  near(out.fees.exit, 5000);
  near(out.netSale, 995000);
  near(out.years[0].cash, plain.years[0].cash);
  near(out.niy, plain.niy);
  near(out.yieldOnCost, 80000 / 1010000);
  // 80,000 income less 30,000 interest, plus 995,000 less the 500,000 loan, on 510,000 of equity.
  near(out.leveredIrr, 545000 / 510000 - 1);
});

test('both together charge all three', () => {
  const out = Q.compute(Object.assign({}, flat, {feeMode: 'both', feeAnnualPct: 1, feeEntryPct: 1, feeExitPct: 0.5}));
  near(out.fees.total, 10000 + 10100 + 5000);
  near(out.breakEvenYield, 80000 / ((510000 - (80000 - 10100 - 30000) + 500000) / 0.995));
});

