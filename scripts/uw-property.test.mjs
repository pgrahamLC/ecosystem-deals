import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'vm';

const sandbox = {console, TextEncoder, Uint8Array, Uint32Array, DataView, Math, Date, Number, String, Array, Object, isNaN};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('assets/uw-property.js', 'utf8'), sandbox);
const P = sandbox.UwProperty;

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('/* UWExcel');
const end = html.indexOf('function uwPercentInput');
vm.runInContext(html.slice(start, end) + '\nthis.UW=UW;', sandbox);
const UW = sandbox.UW;

function base(extra) {
  const s = UW.defaults();
  s.rows = [{tenure: 'Rent', units: 4, beds: '2', omv: 200000, annualRent: 12000}];
  s.opexMargin = 20;
  s.price = 800000;
  s.completionMonth = 0;
  s.holdYears = 5;
  s.startDate = '2026-01-01';
  s.rentGrowth = 4;
  return Object.assign(s, extra || {});
}

function run(extra) {
  const result = UW.compute(base(extra), []);
  assert.equal(result.errors.length, 0, (result.errors || []).join(' | '));
  return result;
}

const BEFORE = {
  annualRent: 48000,
  noi: 38400,
  totalCapex: 0,
  allIn: 898800,
  sdlt: 70000,
  exitNoi: 44922.56870400001,
  entryNiy: 38400 / 898800,
  m1: 4000,
  m13: 4160,
  m49: 48000 / 12 * Math.pow(1.04, 4)
};

test('defaults leave the previous underwriting numbers unchanged', () => {
  const r = run();
  assert.equal(r.annualRent, BEFORE.annualRent);
  assert.equal(r.headlineRent, BEFORE.annualRent);
  assert.equal(r.noi, BEFORE.noi);
  assert.equal(r.totalCapex, BEFORE.totalCapex);
  assert.equal(r.allIn, BEFORE.allIn);
  assert.equal(r.sdlt, BEFORE.sdlt);
  assert.equal(r.exitNoi, BEFORE.exitNoi);
  assert.equal(r.entryNiy, BEFORE.entryNiy);
  assert.equal(r.schedule.find(x => x.m === 1).rent, BEFORE.m1);
  assert.equal(r.schedule.find(x => x.m === 13).rent, BEFORE.m13);
  assert.equal(r.schedule.find(x => x.m === 49).rent, BEFORE.m49);
  assert.equal(r.schedule.find(x => x.m === 1).noi, 3200);
  assert.equal(r.yearDeductions.total, 0);
});

test('a saved deal with none of the new keys still matches', () => {
  const s = base();
  Object.keys(P.defaults()).forEach(k => delete s[k]);
  const r = UW.compute(s, []);
  assert.equal(r.noi, BEFORE.noi);
  assert.equal(r.exitNoi, BEFORE.exitNoi);
  assert.equal(r.schedule.find(x => x.m === 13).rent, BEFORE.m13);
});

test('review left off ignores uplift figures and keeps annual growth', () => {
  const r = run({reviewType: 'off', reviewYears: 5, reviewUpliftPct: 50, reviewIndexPct: 9});
  assert.equal(r.schedule.find(x => x.m === 13).rent, BEFORE.m13);
});

test('a fixed review replaces annual growth', () => {
  const r = run({reviewType: 'fixed', reviewYears: 2, reviewUpliftPct: 10, rentGrowth: 50});
  assert.equal(r.schedule.find(x => x.m === 1).rent, 4000);
  assert.equal(r.schedule.find(x => x.m === 13).rent, 4000);
  assert.equal(r.schedule.find(x => x.m === 25).rent, 4400);
  assert.ok(Math.abs(r.schedule.find(x => x.m === 49).rent - 4840) < 1e-6);
});

test('an index review compounds the capped annual rate over the frequency', () => {
  const factor = Math.pow(1.04, 3);
  assert.equal(P.periodFactor('index', 3, 0, 8, 4, 1), factor);
  const r = run({reviewType: 'index', reviewYears: 3, reviewIndexPct: 8, reviewCapPct: 4, reviewCollarPct: 1, rentGrowth: 0});
  assert.equal(r.schedule.find(x => x.m === 36).rent, 4000);
  assert.ok(Math.abs(r.schedule.find(x => x.m === 37).rent - 4000 * factor) < 1e-9);
});

test('a collar lifts a low index, and a cap below the collar is rejected', () => {
  assert.equal(P.periodFactor('index', 3, 0, 0, 5, 2), Math.pow(1.02, 3));
  const bad = UW.compute(base({reviewType: 'index', reviewYears: 5, reviewIndexPct: 3, reviewCapPct: 1, reviewCollarPct: 2}), []);
  assert.ok(bad.errors.some(e => /cap must be at least the collar/.test(e)));
});

test('rent-free months are zero rent, then the full rent', () => {
  const r = run({rentFreeMonths: 3});
  assert.equal(r.schedule.find(x => x.m === 1).rent, 0);
  assert.equal(r.schedule.find(x => x.m === 3).rent, 0);
  assert.equal(r.schedule.find(x => x.m === 4).rent, 4000);
  assert.equal(r.annualRent, 36000);
  assert.equal(r.noi, 36000 * 0.8);
});

test('worked example: review, rent-free, headlease, ground rent, service charge, areas and capex', () => {
  const r = run({
    niaSqft: 3200,
    giaSqft: 4000,
    reviewType: 'index',
    reviewYears: 3,
    reviewIndexPct: 3,
    reviewCapPct: 4,
    reviewCollarPct: 1,
    rentFreeMonths: 3,
    headlease: 'yes',
    headleaseRentPa: 6000,
    headleaseReviewYears: 2,
    headleaseUpliftPct: 10,
    headleaseTermYears: 99,
    groundMode: 'gbp',
    groundRentPa: 1200,
    scMode: 'psf',
    scPsf: 4,
    scRecoverablePct: 75,
    capexMode: 'pct',
    capexPct: 2,
    capex: 99999,
    renoPsf: 25,
    renoArea: 'gia'
  });
  const factor = Math.pow(1.03, 3);
  assert.equal(r.headlineRent, 48000);
  assert.equal(r.annualRent, 36000);
  assert.equal(r.annualOpex, 7200);
  assert.equal(r.yearDeductions.headlease, 6000);
  assert.equal(r.yearDeductions.ground, 1200);
  assert.ok(Math.abs(r.yearDeductions.service - 3200) < 1e-6);
  assert.equal(r.noi, 18400);
  assert.equal(r.schedule.find(x => x.m === 1).rent, 0);
  assert.ok(r.schedule.find(x => x.m === 1).noi < 0);
  assert.equal(r.schedule.find(x => x.m === 4).rent, 4000);
  assert.ok(Math.abs(r.schedule.find(x => x.m === 37).rent - 4000 * factor) < 1e-6);
  const exitRent = 48000 * factor;
  const exitNoi = exitRent * 0.8 - 6000 * 1.21 - 1200 - 3200;
  assert.ok(Math.abs(r.exitNoi - exitNoi) < 1e-6);
  assert.equal(r.totalCapex, 116000);
  assert.equal(r.capexLump, 16000);
  assert.equal(r.renoCapex, 100000);
  assert.equal(r.allIn, 898800 + 116000);
  assert.equal(r.entryNiy, 18400 / 898800);
  assert.equal(r.yieldOnCost, 18400 / (898800 + 116000));
  assert.equal(r.areas.efficiency, 0.8);
  assert.equal(r.areas.rentPsf, 15);
  assert.equal(r.areas.noiPsf, 18400 / 3200);
  assert.equal(r.areas.pricePsfNia, 250);
  assert.equal(r.areas.pricePsfGia, 200);
  assert.ok(r.levered.irr < BEFORE.annualRent && r.levered.irr != null);
  assert.ok(r.levered.multiple > 0);
  assert.ok(r.unlevered.irr != null);
});

test('percentage ground rent follows the rent line, including rent-free months', () => {
  const r = run({groundMode: 'pct', groundRentPct: 10, rentFreeMonths: 3, rentGrowth: 0});
  assert.equal(r.schedule.find(x => x.m === 1).ground, 0);
  assert.equal(r.schedule.find(x => x.m === 4).ground, -400);
  assert.equal(r.yearDeductions.ground, 3600);
});

test('a fully recoverable service charge does not change NOI', () => {
  const r = run({scMode: 'total', scTotalPa: 10000, scRecoverablePct: 100, niaSqft: 1000});
  assert.equal(r.noi, BEFORE.noi);
  assert.equal(r.yearDeductions.service, 0);
});

test('headlease expiry stops income and values the exit at nil', () => {
  const r = run({headlease: 'yes', headleaseRentPa: 1000, headleaseTermYears: 2});
  assert.equal(r.schedule.find(x => x.m === 24).rent, 4000 * Math.pow(1.04, 1));
  assert.equal(r.schedule.find(x => x.m === 25).rent, 0);
  assert.equal(r.schedule.find(x => x.m === 25).headlease, 0);
  assert.equal(r.exitNoi, 0);
  assert.equal(r.exitValue, 0);
  assert.equal(r.exitExpired, true);
  assert.ok(r.levered.irr == null || Number.isFinite(r.levered.irr));
});

test('service charge per sq ft and renovation per sq ft need the chosen area', () => {
  const sc = UW.compute(base({scMode: 'psf', scPsf: 5, niaSqft: 0}), []);
  assert.ok(sc.errors.some(e => /net internal area/i.test(e)));
  const reno = UW.compute(base({renoPsf: 20, renoArea: 'gia', giaSqft: 0}), []);
  assert.ok(reno.errors.some(e => /gross internal area/i.test(e)));
});

test('capex as a percentage of price replaces the scheme-level pounds', () => {
  const r = run({capexMode: 'pct', capexPct: 5, capex: 99999, capexPerUnit: 1000});
  assert.equal(r.totalCapex, 800000 * 0.05 + 4 * 1000);
});

test('the Excel model stores the new inputs and folds them into rent, NOI and capex', () => {
  const state = base({
    reviewType: 'index', reviewYears: 3, reviewIndexPct: 3, reviewCapPct: 4, reviewCollarPct: null,
    rentFreeMonths: 3, headlease: 'yes', headleaseRentPa: 6000, headleaseTermYears: 99,
    groundMode: 'gbp', groundRentPa: 1200, scMode: 'psf', scPsf: 4, scRecoverablePct: 75,
    niaSqft: 3200, giaSqft: 4000, capexMode: 'pct', capexPct: 2, renoPsf: 25, renoArea: 'gia'
  });
  const result = UW.compute(state, []);
  const bytes = sandbox.UWExcel.build(state, result, []);
  const xml = Buffer.from(bytes).toString('latin1');
  assert.match(xml, /Rent review/);
  assert.match(xml, /Headlease rent/);
  assert.match(xml, /Ground rent/);
  assert.match(xml, /Service charge/);
  assert.match(xml, /Net internal area/);
  assert.match(xml, /B68=&quot;pct&quot;/);
  assert.match(xml, /Inputs!\$B\$47/);
  assert.match(xml, /Inputs!\$B\$41/);
  assert.doesNotMatch(xml, /B38\*Units!B13\+B39</);
});
