import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

await import('./gates-model.js');
await import('./quick-model.js');
const Q = globalThis.QuickModel;
const near = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= (tolerance || 1e-6), actual + ' is not ' + expected);

// One year, bought and sold at 8%, no costs: a level monthly income and the price back at the end.
const flat = {basis: 'price', price: 1000000, rent1: 100000, opexPct: 20, growthPct: 0, costsPct: 0, ltvPct: 50, ratePct: 6, entryMonth: '2027-01', exitMonth: '2028-01', exitYieldPct: 8, saleCostsPct: 0};

test('months run from the entry month to the month before the sale', () => {
  const out = Q.compute(flat);
  assert.equal(out.ok, true);
  assert.equal(out.months, 12);
  assert.equal(out.rows.length, 12);
  assert.equal(out.rows[0].label, 'Jan 2027');
  assert.equal(out.rows[11].label, 'Dec 2027');
  assert.equal(out.saleLabel, 'Jan 2028');
  assert.equal(Q.compute(Object.assign({}, flat, {entryMonth: '2027-03', exitMonth: '2028-09'})).months, 18);
});

test('a flat deal bought and sold at 8% returns the monthly income rate, compounded', () => {
  const out = Q.compute(flat);
  near(out.rows[0].noi, 80000 / 12);
  near(out.exitValue, 1000000);
  // Unlevered: 6,666.67 a month on 1,000,000, and the 1,000,000 back. Monthly rate 0.6667%.
  near(out.unleveredIrr, Math.pow(1 + 80000 / 12 / 1000000, 12) - 1, 1e-9);
  // Levered: 6,666.67 less 2,500 interest on 500,000 of equity. Monthly rate 0.8333%.
  near(out.equity, 500000);
  near(out.leveredIrr, Math.pow(1 + (80000 / 12 - 2500) / 500000, 12) - 1, 1e-9);
  near(out.multiple, 1.10);
  near(out.interestCover, 80000 / 30000);
  near(out.cashOnCash, 50000 / 500000);
  near(out.breakEvenYield, 80000 / 950000);
});

test('entry on a NIY basis gives the same price as typing the price', () => {
  const byYield = Q.compute(Object.assign({}, flat, {basis: 'niy', price: '', niyPct: 8}));
  near(byYield.price, 1000000, 0.01);
  const withCosts = Q.compute(Object.assign({}, flat, {basis: 'niy', price: '', niyPct: 5, costsPct: 6.8}));
  near(withCosts.noi1 / withCosts.allIn, 0.05);
  near(withCosts.allIn, withCosts.price * 1.068, 0.01);
});

test('rent steps up on each anniversary of entry and the sale uses the next twelve months', () => {
  const out = Q.compute(Object.assign({}, flat, {growthPct: 3, entryMonth: '2027-04', exitMonth: '2029-10', costsPct: 6.8, saleCostsPct: 2}));
  assert.equal(out.months, 30);
  near(out.rows[11].rent, 100000 / 12);
  near(out.rows[12].rent, 103000 / 12);
  assert.equal(out.rows[12].label, 'Apr 2028');
  near(out.rows[29].rent, 100000 * 1.03 * 1.03 / 12);
  // Months 31 to 36 are still in year three, months 37 to 42 are in year four.
  near(out.exitNoi, 0.8 * (6 * 100000 * Math.pow(1.03, 2) / 12 + 6 * 100000 * Math.pow(1.03, 3) / 12), 0.01);
  near(out.netSale, out.exitValue * 0.98, 0.01);
  assert.equal(out.years.length, 3);
  assert.equal(out.years[2].months, 6);
  assert.equal(out.years[2].from, 'Apr 2029');
  assert.equal(out.years[2].to, 'Sep 2029');
  near(out.years.reduce((sum, year) => sum + year.cash, 0), out.rows.reduce((sum, row) => sum + row.cash, 0), 0.01);
  // The stated yearly IRR, turned back into a monthly rate, discounts the monthly flows to nil.
  const monthly = Math.pow(1 + out.leveredIrr, 1 / 12) - 1;
  near(out.flows.levered.reduce((sum, flow, month) => sum + flow / Math.pow(1 + monthly, month), 0), 0, 1);
  assert.equal(out.flows.levered.length, 31);
});

test('a hold of under a year still gives yearly cover and cash on cash', () => {
  const out = Q.compute(Object.assign({}, flat, {exitMonth: '2027-07'}));
  assert.equal(out.months, 6);
  near(out.interestCover, 80000 / 30000);
  near(out.cashOnCash, 50000 / 500000);
});

test('no debt means levered equals unlevered and interest cover is not shown', () => {
  const out = Q.compute(Object.assign({}, flat, {ltvPct: 0, exitMonth: '2030-01'}));
  near(out.leveredIrr, out.unleveredIrr, 1e-9);
  assert.equal(out.interestCover, null);
});

test('it names what is missing and never guesses a rent, a price or a date', () => {
  const out = Q.compute({basis: 'price', opexPct: 20, exitYieldPct: 6});
  assert.equal(out.ok, false);
  assert.deepEqual(out.missing, ['year one rent', 'purchase price', 'entry month', 'exit month']);
  assert.deepEqual(Q.compute(Object.assign({}, flat, {opexPct: ''})).missing, ['opex']);
  assert.deepEqual(Q.compute(Object.assign({}, flat, {exitMonth: '2027-01'})).missing, ['an exit month after the entry month']);
  assert.deepEqual(Q.compute(Object.assign({}, flat, {exitMonth: '2026-06'})).missing, ['an exit month after the entry month']);
});

test('month helpers round trip', () => {
  assert.equal(Q.monthLabel(Q.monthIndex('2027-12')), 'Dec 2027');
  assert.equal(Q.monthText(Q.monthIndex('2027-01') + 14), '2028-03');
  assert.ok(Number.isNaN(Q.monthIndex('2027-13')));
});

test('the quick screen uses the site hurdle settings', () => {
  const config = JSON.parse(readFileSync(new URL('../data/market-entry/gates.json', import.meta.url)));
  const limits = globalThis.GatesModel.thresholds(Object.assign({}, config, {anchors: Object.assign({}, config.anchors, {holdYears: 1})}));
  const out = Q.compute(flat);
  const rows = Q.screen(out, limits);
  assert.equal(rows.length, 8);
  const by = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.equal(by['Yield on cost'].limit, limits.yoc);
  assert.equal(by['Yield on cost'].pass, 0.08 >= limits.yoc);
  assert.equal(by['Unlevered IRR'].pass, out.unleveredIrr >= limits.unleveredIrr);
  assert.equal(by['Loan share of price'].pass, true);
});

// 500,000 at 6% over 25 years. The level payment and the balance are checked against the standard closed forms.
const repay = Object.assign({}, flat, {loanType: 'amort', termYears: 25, exitMonth: '2030-01'});
const r = 0.06 / 12;
const pay = 500000 * r / (1 - Math.pow(1 + r, -300));
const owed = (k) => 500000 * Math.pow(1 + r, k) - pay * (Math.pow(1 + r, k) - 1) / r;

test('a repayment loan pays one level amount, with interest falling and principal rising', () => {
  const out = Q.compute(repay);
  near(pay, 3221.51, 0.01);
  near(out.payment, pay, 1e-6);
  near(out.rows[0].interest, 2500);
  near(out.rows[0].principal, pay - 2500, 1e-6);
  out.rows.forEach((row) => near(row.interest + row.principal, pay, 1e-6));
  assert.ok(out.rows[35].interest < out.rows[0].interest);
  assert.ok(out.rows[35].principal > out.rows[0].principal);
  near(out.rows[11].balance, owed(12), 0.01);
  near(out.loanAtExit, owed(36), 0.01);
  near(out.loanRepaid, 500000 - owed(36), 0.01);
});

test('only the balance still owed comes out of the sale, and the yearly cash is after the full payment', () => {
  const io = Q.compute(Object.assign({}, flat, {exitMonth: '2030-01'}));
  const out = Q.compute(repay);
  near(out.rows[35].sale, out.netSale - owed(36), 0.01);
  near(out.rows[0].cash, 80000 / 12 - pay, 1e-6);
  near(out.years[0].principal, 500000 - owed(12), 0.01);
  near(out.years[2].balance, owed(36), 0.01);
  // The property is the same, so the return before debt does not move.
  near(out.unleveredIrr, io.unleveredIrr, 1e-12);
  near(out.equity, io.equity);
  // Total cash to equity: three years of NOI, less interest actually paid, plus the sale less the original loan.
  const interestPaid = out.rows.reduce((sum, row) => sum + row.interest, 0);
  near(out.multiple * out.equity, 240000 - interestPaid + out.netSale - 500000, 0.01);
  const monthly = Math.pow(1 + out.leveredIrr, 1 / 12) - 1;
  near(out.flows.levered.reduce((sum, flow, month) => sum + flow / Math.pow(1 + monthly, month), 0), 0, 1);
});

test('cover and cash on cash on a repayment loan count principal as well as interest', () => {
  const out = Q.compute(repay);
  near(out.debtCover, 80000 / (12 * pay), 1e-9);
  near(out.cashOnCash, (80000 - 12 * pay) / 500000, 1e-9);
  assert.ok(out.interestCover > out.debtCover);
  near(out.exitLtv, owed(36) / out.exitValue, 1e-9);
  near(out.breakEvenYield, out.exitNoi / (out.equity - out.rows.reduce((sum, row) => sum + row.cash, 0) + owed(36)), 1e-9);
  const config = JSON.parse(readFileSync(new URL('../data/market-entry/gates.json', import.meta.url)));
  const rows = Q.screen(out, globalThis.GatesModel.thresholds(config));
  const cover = rows.find((row) => row.name === 'Debt service cover');
  assert.ok(cover && !rows.some((row) => row.name === 'Interest cover'));
  near(cover.value, out.debtCover);
});

test('a term shorter than the hold clears the loan and then stops paying', () => {
  const out = Q.compute(Object.assign({}, repay, {termYears: 2}));
  assert.equal(out.rows[23].balance, 0);
  assert.equal(out.loanAtExit, 0);
  near(out.rows[24].interest + out.rows[24].principal, 0);
  near(out.rows[35].sale, out.netSale, 1e-6);
  near(out.rows.reduce((sum, row) => sum + row.principal, 0), 500000, 0.01);
  assert.ok(out.rows.every((row) => row.balance >= 0 && row.principal >= 0));
});

test('a repayment loan at a nil rate repays in equal parts, and interest only is unchanged', () => {
  const nil = Q.compute(Object.assign({}, repay, {ratePct: 0, termYears: 10}));
  near(nil.rows[0].principal, 500000 / 120, 1e-6);
  near(nil.loanAtExit, 500000 - 36 * 500000 / 120, 0.01);
  const io = Q.compute(Object.assign({}, flat, {loanType: 'io', termYears: 25}));
  near(io.loanAtExit, 500000);
  near(io.debtCover, io.interestCover);
  assert.ok(io.rows.every((row) => row.principal === 0));
});

test('a repayment loan needs a term, and no loan needs none', () => {
  assert.deepEqual(Q.compute(Object.assign({}, repay, {termYears: ''})).missing, ['loan term, in years']);
  assert.equal(Q.compute(Object.assign({}, repay, {termYears: '', ltvPct: 0})).ok, true);
});

