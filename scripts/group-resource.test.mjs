import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = {};
vm.runInNewContext(fs.readFileSync('assets/group-resource.js', 'utf8'), { window: root, globalThis: root, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, fetch() { return Promise.reject(new Error('no fetch')); }, location: { hash: '' }, setTimeout() {} });
const api = root.lcGroup;

const weights = JSON.parse(fs.readFileSync('data/score-weights.json', 'utf8'));
const mack = JSON.parse(fs.readFileSync('data/mack-living.json', 'utf8'));
const contracts = JSON.parse(fs.readFileSync('data/contract-opportunities.json', 'utf8'));
const benchmarks = JSON.parse(fs.readFileSync('data/market-benchmarks.json', 'utf8'));
const vip = JSON.parse(fs.readFileSync('data/vip-tracker.json', 'utf8'));

test('proposed weights are explicit, sum to 100, and are not marked final', () => {
  const proposed = weights.proposed.weights;
  const sum = Object.values(proposed).reduce((n, v) => n + v, 0);
  assert.equal(sum, 100);
  assert.equal(proposed.financial_health, 30);
  assert.equal(proposed.ownership, 20);
  assert.equal(proposed.company_size, 20);
  assert.equal(proposed.contracts, 15);
  assert.equal(proposed.trading_history, 15);
  assert.match(weights.status, /not agreed with Luke and Liza/);
  assert.equal(weights.current.partner_screen.model, 'gates, not weights');
  assert.equal(weights.current.covenant_points_in_operator_scoring['Stable partner'], 25);
  assert.equal(weights.current.operator_market_score.fit, 40);
});

test('a pass scores the full weight and a fail scores nothing', () => {
  const pass = api.evaluatePartner({
    form: 'PLC', board: 6, n_frameworks: 2, called_off: true, started: '2000-01-01',
    turnover: 5e6, profit: 100000, employees: 40, net_assets: 2e6
  }, api.thresholds(), '2026-11-10');
  assert.equal(pass.res, 'Stable partner');
  assert.equal(api.scorePartner(pass, weights.proposed.weights).score, 100);
  const fail = api.evaluatePartner({
    form: 'Private company', board: 1, owner_managed: true, n_frameworks: 0, started: '2024-01-01',
    turnover: 100000, profit: -1, employees: 2, net_assets: 1000
  }, api.thresholds(), '2026-11-10');
  assert.equal(fail.res, 'Weak');
  assert.equal(api.scorePartner(fail, weights.proposed.weights).score, 0);
});

test('a disclosure gap scores half of that heading', () => {
  const gap = api.evaluatePartner({
    form: 'PLC', board: 5, n_frameworks: 1, started: '2000-01-01',
    turnover: 5e6, profit: null, employees: 40, net_assets: null
  }, api.thresholds(), '2026-11-10');
  assert.equal(gap.r.pro, 'C');
  assert.equal(gap.r.bs, 'C');
  const scored = api.scorePartner(gap, { financial_health: 30, ownership: 0, company_size: 0, contracts: 0, trading_history: 0 });
  assert.equal(scored.score, 50);
});

test('Mack Living is seeded from the five existing towns and marked as a placeholder', () => {
  assert.deepEqual(mack.regions.map(row => row.name), ['Greater Manchester', 'Glasgow', 'Edinburgh', 'Bristol', 'Cheltenham']);
  assert.ok(mack.regions.every(row => row.status === 'placeholder to confirm'));
  assert.match(mack.note, /Patrick has not supplied/);
});

test('Manchester CAS is present and unverified', () => {
  const row = contracts.items.find(item => item.id === 'manchester-cas');
  assert.equal(row.status, 'to verify with Chris');
  assert.equal(row.value, null);
  assert.equal(row.deadline, null);
  assert.equal(row.buyer, null);
});

test('benchmark slots are empty and labelled to be supplied', () => {
  assert.ok(benchmarks.slots.length >= 3);
  assert.ok(benchmarks.slots.every(slot => slot.amount == null && slot.status === 'to be supplied'));
});

test('VIP Tracker is recorded as absent, with a stale-data warning', () => {
  assert.equal(vip.present_in_repo, false);
  assert.match(vip.consider.join(' '), /stale/i);
  assert.match(vip.note, /no screen, file or import named VIP Tracker/);
});

test('new copy has no em dash or semicolon', () => {
  const files = ['data/mack-living.json', 'data/score-weights.json', 'data/contract-opportunities.json', 'data/market-benchmarks.json', 'data/vip-tracker.json'];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.includes('\u2014'), false, file);
    assert.equal(text.includes(';'), false, file);
  }
});
