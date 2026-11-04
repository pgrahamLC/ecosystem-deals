import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const tax = (p, n, mode = 'auto') => {
  const non = mode === 'nonres' || (mode === 'auto' && n >= 6);
  const bounds = non ? [150000, 250000, Infinity] : [125000, 250000, 925000, 1500000, Infinity];
  const rates = non ? [0, .02, .05] : [.05, .07, .10, .15, .17];
  let t = 0, lo = 0;
  for (let i = 0; i < bounds.length; i++) { t += Math.max(0, Math.min(p, bounds[i]) - lo) * rates[i]; lo = bounds[i]; }
  return t;
};
const bid = (noi, y, n, fees, mode) => {
  if (noi <= 0 || y <= 0) return 0;
  const target = noi / y;
  let lo = 0, hi = target;
  for (let i = 0; i < 100; i++) { const p = (lo + hi) / 2; if (p + tax(p, n, mode) + p * fees > target) hi = p; else lo = p; }
  return (lo + hi) / 2;
};

const window = {};
vm.runInNewContext(fs.readFileSync('assets/rent-scenarios.js', 'utf8'), { window, document: { querySelectorAll: () => [] }, fetch: () => Promise.reject(new Error('offline')), Promise, UW: undefined, console });
const api = window.lcRentScenarios;

test('bedroom text is used only when the lot states a count', () => {
  assert.equal(api.bedsFrom('2 bedroom flat, Bristol'), '2');
  assert.equal(api.bedsFrom('3-bed house'), '3');
  assert.equal(api.bedsFrom('Studio apartment, Edinburgh'), '');
});

test('Edinburgh and Bristol resolve from the town or postcode', () => {
  assert.equal(api.areaOf({ city: 'Edinburgh' }), 'Edinburgh');
  assert.equal(api.areaOf({ city: 'City Of Bristol' }), 'Bristol');
  assert.equal(api.areaOf({ pc: 'EH11 1JX' }), 'Edinburgh');
  assert.equal(api.areaOf({ pc: 'BS11 9TD' }), 'Bristol');
});

test('base and downside bids use the same yield and a lower allowance rent', () => {
  const state = { opexMargin: 25, entryYield: 5.55, acqCostsPct: 3.6, taxMode: 'auto', price: 250000 };
  const helpers = { bid, tax };
  const base = api.figures(1544, 1, state, helpers);
  const down = api.figures(1095, 1, state, helpers);
  assert.equal(base.annual, 1544 * 12);
  assert.equal(down.annual, 1095 * 12);
  assert.ok(down.bid < base.bid);
  assert.ok(down.niy < base.niy);
  assert.equal(base.onPrice, true);
});

test('stored Bristol and Lothian rates match the official monthly tables', () => {
  const book = JSON.parse(fs.readFileSync('data/rent-scenarios.json', 'utf8'));
  assert.deepEqual(book.lha.areas.Bristol.monthly, { shared: 511.33, 1: 900, 2: 1095, 3: 1300, 4: 1850 });
  assert.deepEqual(book.lha.areas.Edinburgh.monthly, { shared: 475, 1: 750, 2: 970, 3: 1375, 4: 2180 });
  assert.equal(book.omr.areas.Bristol.monthly[2], 1544);
  assert.equal(book.omr.areas.Edinburgh.monthly[2], 1324);
  assert.equal(book.omr.areas.Glasgow, null);
});
