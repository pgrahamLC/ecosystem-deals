import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

await import('./gates-model.js');
const G = globalThis.GatesModel;
const config = JSON.parse(readFileSync(new URL('../data/market-entry/gates.json', import.meta.url)));
const t = G.thresholds(config);
assert.equal(Math.round(t.unleveredIrr * 1000), 105);
assert.equal(Math.round(t.yoc * 1000), 75);
assert.equal(Math.round(t.leveredIrr * 1000), 150);
assert.equal(Math.round(t.postTaxIrr * 1000), 95);
assert.equal(Math.round(t.profitOnCost * 1000), 158);
assert.equal(t.multiple, 1.5);

const evidence = {attribution: true, bridge: true, fees: true, term: true};
const metrics = {
  noi: 40000,
  annualRent: 50000,
  annualOpex: 10000,
  fees: 30000,
  allIn: 1100000,
  price: 1000000,
  debt: 550000,
  interestRate: 0.065,
  annualInterest: 35750,
  yieldOnCost: 40000 / 1100000,
  profitOnCost: 0.04,
  unleveredIrr: 0.08,
  leveredIrr: 0.11,
  postTaxIrr: 0.07,
  leveredMultiple: 1.2,
  peakEquity: 500000,
  cheque: 2000000,
  paybackYears: 4,
  holdYears: 3,
  cashOnCash: 0.02,
  ltv: 0.55,
  ltc: 0.5,
  dscr: 40000 / 35750,
  breakEvenUnlev: 0.062,
  breakEvenLev: 0.061,
  downside: {multiple: 0.9, dscr: 0.8, unleveredIrr: -0.02, ltv: 0.55},
  operatorCover: null
};
const result = G.score(metrics, evidence, config);
assert.equal(result.verdict, 'FAIL');
assert.equal(result.gates.length, 14);
assert.equal(result.gates.filter((row) => row.status === 'pass').length < 14, true);
assert.equal(result.gates[8].status, 'fail');
assert.equal(result.gates[2].status, 'fail');
assert.equal(result.takeaway || G.takeaway(result).includes(';'), false);
assert.equal(G.takeaway(result).includes('\u2014'), false);
assert.equal(G.lotScreen({guide_price: 100000, title: 'House'}, config).tag, 'untested');
assert.equal(G.lotScreen({guide_price: 100000, title: 'Let at £2,000 pa'}, config).tag, 'out');
assert.equal(G.lotScreen({guide_price: 100000, title: 'Let at £12,000 pa'}, config).reason.includes('not a pass'), true);

const copy = JSON.stringify(result.gates.map((row) => row.name + row.thresholdText + row.calc));
assert.equal(copy.includes(';'), false);
assert.equal(copy.includes('\u2014'), false);
console.log('gates model tests passed');
console.log(G.takeaway(result));
console.log('cleared', result.cleared, 'fails', result.fails, 'binding', result.binding.n, result.binding.name);
