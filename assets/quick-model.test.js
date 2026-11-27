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

const blankLease = {
  reviewEvery: '', reviewType: 'off', reviewUpliftPct: '', reviewCapPct: '', reviewCollarPct: '', rentFreeMonths: '', rentFreeOpex: 'off',
  headlease: 'off', headleaseRent: '', headleaseEvery: '', headleaseUpliftPct: '', headleaseTerm: '',
  groundBasis: 'off', groundRent: '', groundPct: '', groundEvery: '', groundUpliftPct: '',
  scBasis: 'off', scPsf: '', scTotal: '', scRecoverPct: '', nia: '', gia: '',
  capexBasis: 'amount', capexAmount: '', capexPct: '', renoPsf: '', renoArea: 'gia', capexFrom: '', capexTo: '',
  acqAmount: '', acqFeePct: '', acqExitFeePct: '', acqDraw: '', acqRepay: '', acqInterest: 'serviced',
  acqRefiMonth: '', acqRefiAmount: '', acqRefiLtvPct: '', acqRefiRatePct: '', acqRefiFeePct: '',
  devBasis: 'off', devAmount: '', devLtcPct: '', devRatePct: '', devFeePct: '', devExitFeePct: '',
  devDrawFrom: '', devDrawTo: '', devRepay: '', devInterest: 'rolled'
};

test('blank lease, area, capex and debt fields leave the original result unchanged', () => {
  const before = Q.compute(flat);
  const after = Q.compute(Object.assign({}, flat, blankLease));
  ['price', 'niy', 'allIn', 'noi1', 'equity', 'debt', 'unleveredIrr', 'leveredIrr', 'multiple', 'profit', 'interestCover', 'debtCover', 'exitLtv', 'breakEvenYield', 'loanAtExit', 'exitValue', 'cashOnCash'].forEach((key) => near(after[key], before[key], 1e-9));
  assert.equal(after.rows.length, before.rows.length);
  after.rows.forEach((row, index) => {
    near(row.rent, before.rows[index].rent, 1e-9);
    near(row.noi, before.rows[index].noi, 1e-9);
    near(row.interest, before.rows[index].interest, 1e-9);
    near(row.cash, before.rows[index].cash, 1e-9);
    near(row.sale, before.rows[index].sale, 1e-9);
  });
  assert.equal(after.flags.any, false);
});

test('a fixed review steps the rent, and a cap and collar limit it', () => {
  const reviewed = Q.compute(Object.assign({}, flat, {reviewType: 'fixed', reviewEvery: 2, reviewUpliftPct: 10, exitMonth: '2030-01', ltvPct: 0}));
  near(reviewed.rows[23].rent, 100000 / 12);
  near(reviewed.rows[24].rent, 110000 / 12);
  assert.equal(reviewed.rows[24].label, 'Jan 2029');
  const capped = Q.compute(Object.assign({}, flat, {reviewType: 'fixed', reviewEvery: 2, reviewUpliftPct: 10, reviewCapPct: 4, reviewCollarPct: 1, exitMonth: '2030-01', ltvPct: 0}));
  near(capped.rows[24].rent, 104000 / 12);
  const floored = Q.compute(Object.assign({}, flat, {reviewType: 'fixed', reviewEvery: 1, reviewUpliftPct: 0, reviewCollarPct: 3, exitMonth: '2029-01', ltvPct: 0}));
  near(floored.rows[12].rent, 103000 / 12);
  assert.ok(Q.compute(Object.assign({}, flat, {reviewType: 'index', reviewEvery: 5, reviewCapPct: 1, reviewCollarPct: 3})).missing.includes('rent review cap below the collar'));
});

test('an RPI review compounds the capped annual rate and replaces annual growth', () => {
  const indexed = Q.compute(Object.assign({}, flat, {growthPct: 5, reviewType: 'index', reviewEvery: 3, reviewUpliftPct: 6, reviewCapPct: 4, reviewCollarPct: 1, exitMonth: '2031-01', ltvPct: 0}));
  const uplift = Math.pow(1.04, 3) - 1;
  near(indexed.rows[35].rent, 100000 / 12);
  near(indexed.rows[36].rent, 100000 * (1 + uplift) / 12);
  // The 5% growth box is not applied as well.
  near(indexed.rows[12].rent, 100000 / 12);
  const exitMonths = 12;
  let expect = 0;
  for (let month = indexed.months + 1; month <= indexed.months + exitMonths; month += 1) {
    const steps = Math.floor((month - 1) / 36);
    expect += 100000 * Math.pow(1 + uplift, steps) / 12 * 0.8;
  }
  near(indexed.exitNoi, expect, 0.01);
});

test('rent-free is zero rent at the start, then the passing rent, and reviews are not delayed', () => {
  const out = Q.compute(Object.assign({}, flat, {rentFreeMonths: 3, reviewType: 'fixed', reviewEvery: 1, reviewUpliftPct: 10, exitMonth: '2029-01', ltvPct: 0}));
  assert.equal(out.rows[0].rent, 0);
  assert.equal(out.rows[2].rent, 0);
  near(out.rows[3].rent, 100000 / 12);
  near(out.rows[12].rent, 110000 / 12);
  near(out.noi1, 100000 * 0.8 * 9 / 12, 0.01);
});

test('headlease, ground rent and unrecovered service charge come off the rent', () => {
  const out = Q.compute(Object.assign({}, flat, {
    ltvPct: 0, exitMonth: '2030-01',
    headlease: 'on', headleaseRent: 12000, headleaseEvery: 1, headleaseUpliftPct: 10, headleaseTerm: 2,
    groundBasis: 'pct', groundPct: 5,
    scBasis: 'psf', scPsf: 2, scRecoverPct: 75, nia: 1000
  }));
  // Month 1: rent 8,333.33, opex 20%, headlease 1,000, ground 5% of rent, service 2,000 x 25% / 12.
  near(out.rows[0].headlease, 1000);
  near(out.rows[0].ground, (100000 / 12) * 0.05);
  near(out.rows[0].service, 2000 * 0.25 / 12);
  near(out.rows[0].noi, 100000 / 12 * 0.8 - 1000 - (100000 / 12) * 0.05 - 2000 * 0.25 / 12);
  near(out.rows[12].headlease, 1100);
  assert.equal(out.rows[24].headlease, 0);
  // A percentage ground rent is zero while the tenant pays nothing.
  const free = Q.compute(Object.assign({}, flat, {ltvPct: 0, rentFreeMonths: 2, groundBasis: 'pct', groundPct: 10}));
  assert.equal(free.rows[0].ground, 0);
  near(free.rows[2].ground, (100000 / 12) * 0.1);
});

test('capex can be a percentage plus a rate per sq ft, spent over the months named', () => {
  const out = Q.compute(Object.assign({}, flat, {ltvPct: 0, capexBasis: 'pct', capexPct: 10, renoPsf: 20, renoArea: 'gia', gia: 5000, capexFrom: 1, capexTo: 4}));
  near(out.totalCapex, 1000000 * 0.1 + 20 * 5000);
  near(out.allIn, 1000000 + out.totalCapex);
  near(out.rows[0].capex, out.totalCapex / 4);
  near(out.rows.slice(0, 4).reduce((sum, row) => sum + row.capex, 0), out.totalCapex, 0.01);
  assert.equal(out.rows[4].capex, 0);
  near(out.flows.unlevered[0], -1000000);
  // Areas on their own do not move the cash.
  const areas = Q.compute(Object.assign({}, flat, {nia: 8000, gia: 10000}));
  near(areas.noi1, Q.compute(flat).noi1, 1e-9);
  near(areas.leveredIrr, Q.compute(flat).leveredIrr, 1e-12);
  near(areas.areas.efficiency, 0.8);
  near(areas.areas.rentPsf, 100000 / 8000);
});

// Worked example used in the pull request. Round inputs so each line can be checked by hand.
const worked = {
  basis: 'price', price: 1000000, rent1: 120000, opexPct: 20, growthPct: 0, costsPct: 0,
  ltvPct: 50, ratePct: 6, loanType: 'io', entryMonth: '2027-01', exitMonth: '2030-01', exitYieldPct: 8, saleCostsPct: 0,
  reviewType: 'fixed', reviewEvery: 2, reviewUpliftPct: 10, rentFreeMonths: 3,
  headlease: 'on', headleaseRent: 6000, headleaseEvery: 2, headleaseUpliftPct: 10, headleaseTerm: 99,
  groundBasis: 'pa', groundRent: 1200,
  scBasis: 'total', scTotal: 6000, scRecoverPct: 50,
  nia: 5000, gia: 6250,
  capexBasis: 'pct', capexPct: 10, renoPsf: 20, renoArea: 'gia', capexFrom: 1, capexTo: 3,
  acqFeePct: 1, acqExitFeePct: 1,
  devBasis: 'ltc', devLtcPct: 80, devRatePct: 9, devFeePct: 1, devInterest: 'rolled', devRepay: 12
};

test('the worked example ties rent, costs, capex and both loans into the returns', () => {
  const out = Q.compute(worked);
  assert.equal(out.ok, true);
  assert.equal(out.months, 36);
  near(out.totalCapex, 225000);
  near(out.allIn, 1225000);
  near(out.debt, 500000);
  near(out.devDebt, 180000);
  near(out.ltc, 0.8);
  near(out.areas.efficiency, 0.8);
  near(out.areas.rentPsf, 24);
  near(out.areas.pricePsf, 200);
  near(out.areas.giaPricePsf, 160);
  // Three rent-free months, then full rent. Costs are £850 a month throughout year one.
  assert.equal(out.rows[0].rent, 0);
  assert.equal(out.rows[2].rent, 0);
  near(out.rows[0].noi, -850);
  near(out.rows[3].rent, 10000);
  near(out.rows[3].noi, 7150);
  near(out.noi1, 61800);
  near(out.niy, 0.0618);
  near(out.yieldOnCost, 61800 / 1225000);
  // First review is month 25. The exit year, months 37 to 48, is still on that reviewed rent.
  near(out.rows[24].rent, 11000);
  near(out.rows[24].headlease, 550);
  near(out.rows[24].noi, 7900);
  near(out.exitNoi, 94800);
  near(out.exitValue, 1185000);
  // Capex and the construction loan share the same three months. 80% of £75,000 is £60,000.
  near(out.rows[0].capex, 75000);
  near(out.rows[0].draw, 60000);
  near(out.rows[0].fee, 1800);
  near(out.rows[0].acqInterest, 2500);
  near(out.rows[0].devInterest, 450);
  near(out.rows[0].cash, -850 + 60000 - 2500 - 1800);
  near(out.equity, 505000);
  // Rolled interest is the gap between £180,000 drawn and the balance repaid in month 12.
  let balance = 0;
  for (let month = 1; month <= 12; month += 1) {
    if (month <= 3) balance += 60000;
    balance += balance * 0.09 / 12;
  }
  near(out.rows[11].principal, balance, 0.01);
  near(out.finance.devInterest, balance - 180000, 0.01);
  near(out.finance.acqInterest, 36 * 2500);
  near(out.finance.acqFees, 10000);
  near(out.rows[11].devBalance, 0);
  near(out.rows[35].sale, 1185000 - 500000 - 5000);
  near(out.loanAtExit, 500000);
  near(out.exitLtv, 500000 / 1185000);
  // Interest cover uses accrued interest. Debt service cover uses cash interest only, not the rolled-up balance or the bullet.
  const yearDev = out.rows.slice(0, 12).reduce((sum, row) => sum + row.devInterest, 0);
  near(out.interestCover, 61800 / (30000 + yearDev));
  near(out.debtCover, 61800 / 30000);
  const monthly = Math.pow(1 + out.leveredIrr, 1 / 12) - 1;
  near(out.flows.levered.reduce((sum, flow, month) => sum + flow / Math.pow(1 + monthly, month), 0), 0, 1);
  const monthlyUnlev = Math.pow(1 + out.unleveredIrr, 1 / 12) - 1;
  near(out.flows.unlevered.reduce((sum, flow, month) => sum + flow / Math.pow(1 + monthlyUnlev, month), 0), 0, 1);
  assert.ok(out.profitOnCost != null);
});

test('a refinance and a later drawdown use their own dates', () => {
  const out = Q.compute(Object.assign({}, flat, {acqRefiMonth: 6, acqRefiAmount: 300000, acqRefiRatePct: 0, exitMonth: '2028-01'}));
  near(out.rows[4].acqInterest, 2500);
  near(out.rows[5].acqInterest, 0);
  near(out.rows[5].draw, 300000);
  near(out.rows[5].principal, 500000);
  near(out.loanAtExit, 300000);
  const drawn = Q.compute(Object.assign({}, flat, {acqDraw: 3, ltvPct: 50}));
  near(drawn.equity, 1000000);
  assert.equal(drawn.rows[0].acqInterest, 0);
  near(drawn.rows[2].draw, 500000);
  near(drawn.rows[2].acqInterest, 2500);
});

test('an amount overrides the LTV, and a per sq ft service charge uses the net area', () => {
  const out = Q.compute(Object.assign({}, flat, {acqAmount: 400000, ltvPct: 80}));
  near(out.debt, 400000);
  near(out.rows[0].interest, 400000 * 0.06 / 12);
  near(out.ltv, 0.4);
  const charge = Q.compute(Object.assign({}, flat, {ltvPct: 0, scBasis: 'psf', scPsf: 4, scRecoverPct: 50, nia: 2500, gia: 4000}));
  near(charge.rows[0].service, 4 * 2500 * 0.5 / 12);
  const missingArea = Q.compute(Object.assign({}, flat, {scBasis: 'psf', scPsf: 4}));
  assert.equal(missingArea.rows[0].service, 0);
  assert.ok(missingArea.warnings.some((line) => /net internal area/.test(line)));
});

// £1m, £100k rent, 20% opex, £12k flat headlease, 8% exit yield, 3-year hold, no debt.
const leasehold = {
  basis: 'price', price: 1000000, rent1: 100000, opexPct: 20, growthPct: 0, costsPct: 0, ltvPct: 0,
  entryMonth: '2027-01', exitMonth: '2030-01', exitYieldPct: 8, saleCostsPct: 0,
  headlease: 'on', headleaseRent: 12000
};

test('a headlease that outlasts the hold is still valued on the exit yield', () => {
  const long = Q.compute(Object.assign({}, leasehold, {headleaseTerm: 99}));
  const open = Q.compute(Object.assign({}, leasehold, {headleaseTerm: ''}));
  const covered = Q.compute(Object.assign({}, leasehold, {headleaseTerm: 4}));
  [long, open, covered].forEach((out) => {
    assert.equal(out.ok, true);
    assert.equal(out.exitBasis, 'yield');
    near(out.exitNoi, 68000);
    near(out.exitValue, 850000);
    near(out.years[2].noi, 68000);
    assert.ok(!out.warnings.some((line) => /exit value is nil|not capitalised/i.test(line)));
  });
  near(long.unleveredIrr, open.unleveredIrr, 1e-12);
  near(long.unleveredIrr * 100, 1.96, 0.02);
  near(long.rows[35].noi, 68000 / 12);
  near(long.rows[35].headlease, 1000);
});

test('a headlease that expires at the sale has income through the hold and a nil residual', () => {
  const out = Q.compute(Object.assign({}, leasehold, {headleaseTerm: 3}));
  assert.equal(out.ok, true);
  assert.equal(out.exitBasis, 'expired');
  assert.equal(out.exitValue, 0);
  assert.equal(out.exitNoi, 0);
  assert.equal(out.breakEvenYield, null);
  near(out.years[2].noi, 68000);
  near(out.rows[35].rent, 100000 / 12);
  near(out.rows[35].headlease, 1000);
  near(out.rows[35].noi, 68000 / 12);
  near(out.rows[35].sale, 0);
  assert.ok(out.unleveredIrr < 0);
  assert.ok(out.warnings.some((line) => /expires at the sale/.test(line) && /nil/.test(line)));
  // The loan is still repaid out of a nil sale.
  const geared = Q.compute(Object.assign({}, leasehold, {headleaseTerm: 3, ltvPct: 50, ratePct: 6}));
  near(geared.loanAtExit, 500000);
  near(geared.rows[35].sale, -500000);
  near(geared.rows[35].acqInterest, 2500);
});

test('a headlease that expires during the hold stops the income and leaves no residual', () => {
  const out = Q.compute(Object.assign({}, leasehold, {headleaseTerm: 2, groundBasis: 'pa', groundRent: 1200, scBasis: 'total', scTotal: 2400, scRecoverPct: 0}));
  assert.equal(out.ok, true);
  assert.equal(out.exitBasis, 'expired');
  assert.equal(out.exitValue, 0);
  near(out.rows[23].rent, 100000 / 12);
  assert.ok(out.rows[23].headlease > 0);
  assert.equal(out.rows[24].rent, 0);
  assert.equal(out.rows[24].opex, 0);
  assert.equal(out.rows[24].headlease, 0);
  assert.equal(out.rows[24].ground, 0);
  assert.equal(out.rows[24].service, 0);
  assert.equal(out.rows[24].noi, 0);
  near(out.years[2].noi, 0);
  near(out.years[2].rent, 0);
  assert.ok(out.warnings.some((line) => /expires in month 24/.test(line)));
  const geared = Q.compute(Object.assign({}, leasehold, {headleaseTerm: 2, ltvPct: 50, ratePct: 6}));
  assert.equal(geared.rows[30].rent, 0);
  near(geared.rows[30].acqInterest, 2500);
  near(geared.rows[35].sale, -500000);
});

test('a headlease that ends within a year of the sale is worth the income left, not a yield', () => {
  const out = Q.compute(Object.assign({}, leasehold, {headleaseTerm: 3.5}));
  assert.equal(out.exitBasis, 'remainder');
  assert.equal(out.months, 36);
  near(out.rows[35].noi, 68000 / 12);
  near(out.exitNoi, 6 * 68000 / 12);
  near(out.exitValue, 34000);
  assert.ok(Math.abs(out.exitValue - 34000 / 0.08) > 1000);
  assert.ok(out.warnings.some((line) => /6 months left/.test(line) && /not capitalised/.test(line)));
});

test('interest cover on the quick screen uses accrued interest, not only the cash debt service', () => {
  const config = JSON.parse(readFileSync(new URL('../data/market-entry/gates.json', import.meta.url)));
  const limits = globalThis.GatesModel.thresholds(config);
  const out = Q.compute(Object.assign({}, worked, {ratePct: 8}));
  const yearDev = out.rows.slice(0, 12).reduce((sum, row) => sum + row.devInterest, 0);
  near(out.interestCover, 61800 / (40000 + yearDev));
  near(out.debtCover, 61800 / 40000);
  assert.ok(out.interestCover < limits.dscr);
  assert.ok(out.debtCover >= limits.dscr);
  const rows = Q.screen(out, limits);
  const interest = rows.find((row) => row.name === 'Interest cover');
  const cash = rows.find((row) => row.name === 'Cash debt cover');
  near(interest.value, out.interestCover);
  assert.equal(interest.pass, false);
  near(cash.value, out.debtCover);
  assert.equal(cash.pass, true);
  const plain = Q.screen(Q.compute(flat), limits);
  const covers = plain.filter((row) => /cover/i.test(row.name));
  assert.deepEqual(covers.map((row) => row.name), ['Interest cover']);
  near(covers[0].value, Q.compute(flat).interestCover);
  near(covers[0].value, Q.compute(flat).debtCover);
  // Rolled up, nothing is paid monthly, so cash cover is blank. The screen still tests the accrued interest.
  const rolled = Q.compute(Object.assign({}, flat, {acqInterest: 'rolled', ratePct: 20, exitMonth: '2028-01'}));
  const accrued = rolled.rows.reduce((sum, row) => sum + row.interest, 0);
  assert.equal(rolled.debtCover, null);
  assert.ok(accrued > 100000);
  near(rolled.interestCover, 80000 / accrued);
  const rolledRows = Q.screen(rolled, limits);
  const rolledCover = rolledRows.find((row) => row.name === 'Interest cover');
  near(rolledCover.value, rolled.interestCover);
  assert.equal(rolledCover.pass, false);
  assert.equal(rolledRows.some((row) => row.name === 'Cash debt cover'), false);
});

test('a blank refinance rate uses the purchase loan rate, and a typed rate is kept', () => {
  const blank = Q.compute(Object.assign({}, flat, {acqRefiMonth: 6, acqRefiAmount: 300000, exitMonth: '2028-01'}));
  near(blank.rows[4].acqInterest, 2500);
  near(blank.rows[5].acqInterest, 300000 * 0.06 / 12);
  assert.equal(blank.refiRateAssumed, true);
  assert.ok(blank.warnings.some((line) => /refinance rate was left blank/i.test(line) && /purchase loan rate/i.test(line)));
  const zero = Q.compute(Object.assign({}, flat, {acqRefiMonth: 6, acqRefiAmount: 300000, acqRefiRatePct: 0, exitMonth: '2028-01'}));
  near(zero.rows[5].acqInterest, 0);
  assert.equal(zero.refiRateAssumed, false);
  assert.ok(!zero.warnings.some((line) => /refinance rate/i.test(line)));
  assert.ok(blank.leveredIrr < zero.leveredIrr);
  const priced = Q.compute(Object.assign({}, flat, {acqRefiMonth: 6, acqRefiAmount: 300000, acqRefiRatePct: 7, exitMonth: '2028-01'}));
  near(priced.rows[5].acqInterest, 300000 * 0.07 / 12);
  assert.equal(priced.refiRateAssumed, false);
});

test('a blank construction loan rate is not treated as zero', () => {
  const blank = Q.compute(Object.assign({}, flat, {devBasis: 'amount', devAmount: 100000, capexAmount: 100000}));
  assert.equal(blank.ok, false);
  assert.deepEqual(blank.missing, ['construction loan rate']);
  assert.equal(blank.leveredIrr, undefined);
  const byCost = Q.compute(Object.assign({}, flat, {capexAmount: 100000, devBasis: 'ltc', devLtcPct: 50}));
  assert.equal(byCost.ok, false);
  assert.ok(byCost.missing.includes('construction loan rate'));
  const zero = Q.compute(Object.assign({}, flat, {devBasis: 'amount', devAmount: 100000, devRatePct: 0, capexAmount: 100000}));
  assert.equal(zero.ok, true);
  assert.equal(zero.rows[0].devInterest, 0);
  const negative = Q.compute(Object.assign({}, flat, {devBasis: 'amount', devAmount: 100000, devRatePct: -1, capexAmount: 100000}));
  assert.equal(negative.ok, false);
  assert.ok(negative.missing.includes('construction loan rate'));
});

test('percentage ground rent stays that share of the reviewed rent', () => {
  const stepped = Q.compute(Object.assign({}, flat, {
    ltvPct: 0, exitMonth: '2029-01', reviewType: 'fixed', reviewEvery: 1, reviewUpliftPct: 10,
    groundBasis: 'pct', groundPct: 5, groundEvery: 1, groundUpliftPct: 10
  }));
  near(stepped.rows[0].ground, 100000 / 12 * 0.05);
  near(stepped.rows[12].rent, 110000 / 12);
  near(stepped.rows[12].ground, 110000 / 12 * 0.05);
  assert.ok(Math.abs(stepped.rows[12].ground - 110000 / 12 * 0.055) > 1);
  assert.ok(stepped.warnings.some((line) => /percentage of the passing rent/i.test(line)));
  const plain = Q.compute(Object.assign({}, flat, {
    ltvPct: 0, exitMonth: '2029-01', reviewType: 'fixed', reviewEvery: 1, reviewUpliftPct: 10,
    groundBasis: 'pct', groundPct: 5
  }));
  near(plain.rows[12].ground, 110000 / 12 * 0.05);
  assert.ok(!plain.warnings.some((line) => /percentage of the passing rent/i.test(line)));
});

test('year-one cash on cash leaves capex out, and peak debt includes the construction loan', () => {
  const out = Q.compute(worked);
  near(out.cashOnCash, (61800 - 30000) / 505000);
  assert.ok(out.cashOnCash > 0);
  const operating = out.rows.slice(0, 12).reduce((sum, row) => sum + row.noi - row.debtService, 0);
  const equityCash = out.rows.slice(0, 12).reduce((sum, row) => sum + row.cash - row.capex, 0);
  near(out.yearOperatingCash, operating, 0.01);
  near(out.yearEquityCash, equityCash, 0.01);
  near(out.yearEquityCash, -210423, 1);
  near(out.peakDebt, 500000 + out.rows[11].principal, 0.01);
  near(out.peakLtv, out.peakDebt / 1000000);
  assert.ok(out.peakLtv > 0.69 && out.peakLtv < 0.70);
  near(out.exitFees, 5000);
  near(out.ltc, 0.8);
  const config = JSON.parse(readFileSync(new URL('../data/market-entry/gates.json', import.meta.url)));
  const rows = Q.screen(out, globalThis.GatesModel.thresholds(config));
  const purchase = rows.find((row) => row.name === 'Loan share of price');
  const peak = rows.find((row) => row.name === 'Peak debt / price');
  near(purchase.value, 0.5);
  assert.equal(purchase.pass, true);
  near(peak.value, out.peakLtv);
  assert.equal(peak.pass, false);
});

function sameFlows(actual, expected) {
  assert.equal(actual.ok, true);
  assert.equal(expected.ok, true);
  ['noi1', 'exitNoi', 'exitValue', 'unleveredIrr', 'leveredIrr', 'niy'].forEach((key) => near(actual[key], expected[key], 1e-9));
  assert.equal(actual.rows.length, expected.rows.length);
  actual.rows.forEach((row, index) => {
    near(row.ground, expected.rows[index].ground, 1e-6);
    near(row.noi, expected.rows[index].noi, 1e-6);
    near(row.rent, expected.rows[index].rent, 1e-6);
    near(row.sale, expected.rows[index].sale, 1e-6);
  });
  actual.years.forEach((year, index) => near(year.ground, expected.years[index].ground, 1e-6));
}

test('a legacy single ground rent matches one row, and a blank list adds nothing', () => {
  const legacy = Q.compute(worked);
  const listed = Q.compute(Object.assign({}, worked, {groundRents: [{label: '', basis: 'pa', amount: 1200}]}));
  sameFlows(listed, legacy);
  assert.equal(listed.groundLines.length, 1);
  assert.equal(listed.groundLines[0].label, '');
  assert.equal(listed.flags.ground, true);
  // The list is the whole charge. Leaving the old fields beside an empty list does not bring the old rent back.
  const cleared = Q.compute(Object.assign({}, flat, {
    groundBasis: 'pa', groundRent: 2400, groundEvery: 5, groundUpliftPct: 10, groundRents: []
  }));
  assert.equal(cleared.rows[0].ground, 0);
  assert.equal(cleared.flags.ground, false);
  near(cleared.noi1, Q.compute(flat).noi1, 1e-9);
  near(cleared.exitNoi, Q.compute(flat).exitNoi, 1e-9);
  const blank = Q.compute(Object.assign({}, flat, blankLease));
  const none = Q.compute(Object.assign({}, flat, blankLease, {groundRents: []}));
  sameFlows(none, blank);
  const oldShare = Q.compute(Object.assign({}, flat, {
    ltvPct: 0, exitMonth: '2029-01', reviewType: 'fixed', reviewEvery: 1, reviewUpliftPct: 10,
    groundBasis: 'pct', groundPct: 5, groundEvery: 1, groundUpliftPct: 10
  }));
  const oneShare = Q.compute(Object.assign({}, flat, {
    ltvPct: 0, exitMonth: '2029-01', reviewType: 'fixed', reviewEvery: 1, reviewUpliftPct: 10,
    groundBasis: 'pct', groundPct: 5, groundEvery: 1, groundUpliftPct: 10,
    groundRents: [{basis: 'pct', amount: 5, every: 1, upliftPct: 10}]
  }));
  sameFlows(oneShare, oldShare);
  assert.ok(oneShare.warnings.some((line) => /percentage of the passing rent/i.test(line)));
  // A saved uplift on the old fields still stops the model when there is no list. A percentage row ignores it.
  const oldBreak = Q.compute(Object.assign({}, flat, {groundUpliftPct: -100}));
  assert.equal(oldBreak.ok, false);
  assert.ok(oldBreak.missing.includes('ground rent uplift'));
  const ignored = Q.compute(Object.assign({}, flat, {ltvPct: 0, groundRents: [{basis: 'pct', amount: 5, every: 1, upliftPct: -100}]}));
  assert.equal(ignored.ok, true);
  near(ignored.rows[0].ground, 100000 / 12 * 0.05);
  assert.ok(ignored.warnings.some((line) => /percentage of the passing rent/i.test(line)));
});

test('several flat ground rents each keep their own review', () => {
  const out = Q.compute(Object.assign({}, flat, {
    ltvPct: 0, exitMonth: '2031-01',
    groundRents: [
      {label: 'Peppercorn', basis: 'pa', amount: 1200, every: 1, upliftPct: 10},
      {label: 'Garage', basis: 'pa', amount: 2400, every: 3, upliftPct: 5}
    ]
  }));
  assert.equal(out.months, 48);
  near(out.rows[0].ground, 100 + 200);
  near(out.rows[0].noi, 80000 / 12 - 300);
  near(out.rows[12].ground, 1200 * 1.1 / 12 + 200);
  near(out.rows[36].ground, 1200 * Math.pow(1.1, 3) / 12 + 2400 * 1.05 / 12);
  const exitGround = 1200 * Math.pow(1.1, 4) + 2400 * 1.05;
  near(out.exitNoi, 80000 - exitGround);
  near(out.exitValue, out.exitNoi / 0.08);
  near(out.years[0].ground, 300 * 12);
  near(out.years[3].ground, out.rows.slice(36, 48).reduce((sum, row) => sum + row.ground, 0));
  assert.deepEqual(out.groundLines.map((line) => line.label), ['Peppercorn', 'Garage']);
});

test('several percentage ground rents add up to one share of the reviewed rent', () => {
  const many = Q.compute(Object.assign({}, flat, {
    ltvPct: 0, exitMonth: '2029-01', rentFreeMonths: 2,
    reviewType: 'fixed', reviewEvery: 1, reviewUpliftPct: 10,
    groundRents: [
      {basis: 'pct', amount: 2},
      {basis: 'pct', amount: 3, every: 1, upliftPct: 10}
    ]
  }));
  const one = Q.compute(Object.assign({}, flat, {
    ltvPct: 0, exitMonth: '2029-01', rentFreeMonths: 2,
    reviewType: 'fixed', reviewEvery: 1, reviewUpliftPct: 10,
    groundBasis: 'pct', groundPct: 5
  }));
  assert.equal(many.rows[0].ground, 0);
  assert.equal(many.rows[1].ground, 0);
  near(many.rows[2].ground, 100000 / 12 * 0.05);
  near(many.rows[12].rent, 110000 / 12);
  near(many.rows[12].ground, 110000 / 12 * 0.05);
  assert.ok(Math.abs(many.rows[12].ground - 110000 / 12 * 0.055) > 1);
  sameFlows(many, one);
  assert.equal(many.warnings.filter((line) => /percentage of the passing rent/i.test(line)).length, 1);
  near(many.exitNoi, one.exitNoi);
});

test('flat fees and a percentage are summed, and empty rows are left out', () => {
  const rows = [
    {label: 'Peppercorn', basis: 'pa', amount: '1,200', every: 2, upliftPct: 25},
    {label: 'Garage', basis: 'pa', amount: 600},
    {label: 'Estate', basis: 'pct', amount: 5, every: 2, upliftPct: 25},
    {label: 'Blank', basis: 'pa', amount: ''},
    {basis: 'pa', amount: '   '},
    {basis: 'off', amount: 9000},
    null,
    {label: 'Zero', basis: 'pct', amount: 0}
  ];
  const mix = {
    basis: 'price', price: 1000000, rent1: 120000, opexPct: 20, growthPct: 0, costsPct: 0, ltvPct: 0,
    entryMonth: '2027-01', exitMonth: '2030-01', exitYieldPct: 8, saleCostsPct: 0,
    reviewType: 'fixed', reviewEvery: 2, reviewUpliftPct: 10, rentFreeMonths: 3,
    groundRents: rows
  };
  const out = Q.compute(mix);
  const clean = Q.compute(Object.assign({}, mix, {groundRents: rows.slice(0, 3)}));
  sameFlows(out, clean);
  assert.deepEqual(out.groundLines.map((line) => line.label), ['Peppercorn', 'Garage', 'Estate']);
  assert.equal(out.groundLines[2].upliftPct, null);
  // Month 1 is rent-free: both flat fees run, the percentage does not.
  assert.equal(out.rows[0].rent, 0);
  near(out.rows[0].ground, 150);
  near(out.rows[0].noi, -150);
  // Month 4 is full rent, before either review.
  near(out.rows[3].rent, 10000);
  near(out.rows[3].ground, 650);
  near(out.rows[3].noi, 7350);
  // Month 25: rent and the peppercorn both step. The 5% does not step again.
  near(out.rows[24].rent, 11000);
  near(out.rows[24].ground, 725);
  assert.ok(Math.abs(out.rows[24].ground - (125 + 50 + 11000 * 0.05 * 1.25)) > 1);
  near(out.rows[24].noi, 8075);
  near(out.years[0].ground, 6300);
  near(out.years[1].ground, 7800);
  near(out.years[2].ground, 8700);
  near(out.exitNoi, 96900);
  near(out.exitValue, 1211250);
  assert.equal(out.warnings.filter((line) => /percentage of the passing rent/i.test(line)).length, 1);
});

test('every ground rent stops when the headlease ends', () => {
  const out = Q.compute(Object.assign({}, flat, {
    ltvPct: 0, exitMonth: '2030-01', rent1: 120000,
    reviewType: 'fixed', reviewEvery: 2, reviewUpliftPct: 10, rentFreeMonths: 3,
    headlease: 'on', headleaseTerm: 2.5,
    groundRents: [
      {label: 'Peppercorn', basis: 'pa', amount: 1200, every: 2, upliftPct: 25},
      {label: 'Garage', basis: 'pa', amount: 600},
      {label: 'Estate', basis: 'pct', amount: 5}
    ]
  }));
  assert.equal(out.exitBasis, 'expired');
  assert.equal(out.exitValue, 0);
  assert.equal(out.exitNoi, 0);
  near(out.rows[0].ground, 150);
  near(out.rows[24].ground, 725);
  near(out.rows[29].ground, 725);
  assert.equal(out.rows[30].rent, 0);
  assert.equal(out.rows[30].ground, 0);
  assert.equal(out.rows[30].noi, 0);
  assert.equal(out.rows[35].ground, 0);
  near(out.years[2].ground, 725 * 6);
  assert.ok(out.warnings.some((line) => /expires in month 30/.test(line)));
});

test('a ground rent above 100%, a flat uplift of -100%, or a negative fee stops the model', () => {
  const share = Q.compute(Object.assign({}, flat, {groundRents: [{basis: 'pct', amount: 101}, {basis: 'pa', amount: 100}]}));
  assert.equal(share.ok, false);
  assert.ok(share.missing.includes('ground rent share of rent'));
  const uplift = Q.compute(Object.assign({}, flat, {groundRents: [{basis: 'pa', amount: 100, every: 5, upliftPct: -100}]}));
  assert.equal(uplift.ok, false);
  assert.ok(uplift.missing.includes('ground rent uplift'));
  const negative = Q.compute(Object.assign({}, flat, {groundRents: [{basis: 'pa', amount: -1}, {basis: 'pct', amount: -5}]}));
  assert.equal(negative.ok, false);
  assert.deepEqual(negative.missing, ['ground rent']);
  const legacy = Q.compute(Object.assign({}, flat, {groundRent: -1}));
  assert.equal(legacy.ok, false);
  assert.ok(legacy.missing.includes('ground rent'));
});

test('opex is nil in a rent-free month unless void costs are switched on', () => {
  const nil = Q.compute(Object.assign({}, flat, {ltvPct: 0, rentFreeMonths: 3}));
  assert.equal(nil.rows[0].rent, 0);
  assert.equal(nil.rows[0].opex, 0);
  near(nil.rows[3].opex, 100000 / 12 * 0.2);
  const blank = Q.compute(Object.assign({}, flat, {ltvPct: 0, rentFreeMonths: 3, rentFreeOpex: ''}));
  near(blank.noi1, nil.noi1, 1e-9);
  near(blank.rows[0].opex, 0);
  const accrue = Q.compute(Object.assign({}, flat, {ltvPct: 0, rentFreeMonths: 3, rentFreeOpex: 'passing'}));
  assert.equal(accrue.rows[0].rent, 0);
  near(accrue.rows[0].opex, 100000 / 12 * 0.2);
  near(accrue.rows[0].noi, -100000 / 12 * 0.2);
  near(accrue.rows[3].opex, 100000 / 12 * 0.2);
  assert.ok(accrue.noi1 < nil.noi1);
});

