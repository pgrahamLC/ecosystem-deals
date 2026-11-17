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

test('Liverpool, Cheshire and Birmingham resolve to the council, not Manchester', () => {
  assert.equal(api.areaOf({ city: 'Liverpool' }), 'Liverpool');
  assert.equal(api.areaOf({ pc: 'L1 4DE' }), 'Liverpool');
  assert.equal(api.areaOf({ pc: 'CH42 4DF' }), 'Wirral');
  assert.equal(api.areaOf({ pc: 'WA10 3PW' }), 'St. Helens');
  assert.equal(api.areaOf({ city: 'Cheshire' }), 'Cheshire');
  assert.equal(api.areaOf({ pc: 'CH1 3AG' }), 'Cheshire West and Chester');
  assert.equal(api.areaOf({ pc: 'CW1 4PN' }), 'Cheshire East');
  assert.equal(api.areaOf({ pc: 'SK9 1AA' }), 'Cheshire East');
  assert.equal(api.areaOf({ pc: 'WA16 0AA' }), 'Cheshire East');
  assert.equal(api.areaOf({ pc: 'WA7 1AA' }), 'Halton');
  assert.equal(api.areaOf({ pc: 'WA1 1AA' }), 'Warrington');
  assert.equal(api.areaOf({ pc: 'B15 2HG' }), 'Birmingham');
  assert.equal(api.areaOf({ pc: 'B91 1AA' }), 'Solihull');
  assert.equal(api.areaOf({ pc: 'SK1 1AA' }), 'Manchester');
  assert.equal(api.areaOf({ pc: 'WA14 1AA' }), 'Manchester');
  assert.equal(api.areaOf({ pc: 'M1 1AA' }), 'Manchester');
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
  assert.equal(book.omr.areas.Bristol.monthly[2], 1551);
  assert.equal(book.omr.areas.Edinburgh.monthly[2], 1324);
  assert.equal(book.omr.areas.Glasgow.monthly[2], 1091);
  assert.equal(book.omr.areas.Liverpool.monthly[2], 840);
  assert.equal(book.omr.areas.Wirral.monthly[1], 574);
  assert.equal(book.omr.areas['Cheshire East'].monthly[2], 905);
  assert.equal(book.omr.areas['Cheshire West and Chester'].monthly[3], 1132);
  assert.equal(book.omr.areas.Warrington.monthly[2], 839);
  assert.equal(book.omr.areas.Halton.monthly[2], 690);
  assert.equal(book.omr.areas.Birmingham.monthly[2], 1009);
  assert.equal(book.omr.month, 'Sep 2026');
  assert.equal(book.lha.areas.Liverpool.monthly[2], 595);
  assert.equal(book.lha.areas.Birmingham.monthly[2], 750);
  assert.equal(book.lha.areas.Warrington.brma, 'North Cheshire');
  assert.equal(book.lha.areas['Cheshire East'].monthly, undefined);
  assert.equal(book.omr.areas.Cheshire, null);
});
