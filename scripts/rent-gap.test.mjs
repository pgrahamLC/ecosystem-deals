import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const book = JSON.parse(fs.readFileSync('data/rent-scenarios.json', 'utf8'));
const window = {};
vm.runInNewContext(fs.readFileSync('assets/rent-gap.js', 'utf8'), {
  window, document: { getElementById: () => null, querySelector: () => null },
  fetch: () => Promise.reject(new Error('offline')), Promise, console
});
const table = window.lcRentGap.build(book);

test('published bedroom pairs are ranked and shared or 4-bed is not given a gap', () => {
  assert.equal(table.ranked.some(row => row.beds === 'shared' || row.beds === '4'), false);
  assert.ok(table.ranked.length > 9);
  const liverpool = table.ranked.find(row => row.area === 'Liverpool' && row.beds === '2');
  const wirral = table.ranked.find(row => row.area === 'Wirral' && row.beds === '1');
  const birmingham = table.ranked.find(row => row.area === 'Birmingham' && row.beds === '3');
  const warrington = table.ranked.find(row => row.area === 'Warrington' && row.beds === '2');
  assert.equal(liverpool.omr, 840);
  assert.equal(liverpool.lha, 595);
  assert.equal(liverpool.gap, 245);
  assert.equal(wirral.omr, 574);
  assert.equal(wirral.lha, 425);
  assert.equal(birmingham.omr, 1141);
  assert.equal(birmingham.lha, 825);
  assert.equal(warrington.gap, 839 - 590);
  assert.equal(table.ranked.some(row => row.area === 'Cheshire East' || row.area === 'Cheshire West and Chester' || row.area === 'Sefton'), false);
  assert.equal(table.missing.some(row => row.area === 'Cheshire East' && row.beds === '2'), true);
});

test('September 2026 Manchester and Bristol gaps use the new rents', () => {
  const manchester = table.ranked.find(row => row.area === 'Manchester' && row.beds === '3');
  const bristol = table.ranked.find(row => row.area === 'Bristol' && row.beds === '2');
  assert.equal(manchester.omr, 1441);
  assert.equal(manchester.lha, 950);
  assert.equal(manchester.gap, 491);
  assert.ok(Math.abs(manchester.pct - 491 / 1441) < 1e-12);
  assert.equal(bristol.omr, 1551);
  assert.equal(bristol.lha, 1095);
  assert.equal(bristol.gap, 456);
  const gaps = table.ranked.map(row => row.gap);
  assert.deepEqual(gaps, gaps.slice().sort((a, b) => b - a));
});

test('a lead uses a stated bedroom and does not invent one', () => {
  window.lcRentGap.load = () => {};
  const ready = window.lcRentGap;
  // forLead needs the loaded table; attach it by rebuilding through the public build and a local assignment.
  const ctx = vm.createContext({
    window, document: { getElementById: () => null },
    fetch: () => Promise.resolve({ json: () => Promise.resolve(book) }), Promise, console, dmDraw: undefined, DM: undefined
  });
  vm.runInContext(fs.readFileSync('assets/rent-gap.js', 'utf8'), ctx);
  return ctx.window.lcRentGap.load().then(function () {
    const lead = ctx.window.lcRentGap.forLead({ city: 'City Of Bristol', pc: 'BS1 4ST', addr: '14 Highridge Road', auction: { type: '2 Bedroom Flat' } });
    assert.equal(lead.gap, 456);
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Glasgow', addr: '2 bedroom flat' }).gap, 241);
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Edinburgh', addr: 'Flat 2', auction: { type: '2 Bedroom Flat' } }).gap, 354);
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Liverpool', pc: 'CH42 4DF', addr: '2 bedroom flat, Birkenhead' }).gap, 743 - 525);
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Birmingham', pc: 'B15 2HG', addr: '3 bedroom house' }).gap, 1141 - 825);
    assert.equal(ctx.window.lcRentGap.areaOf({ city: 'Cheshire' }), 'Cheshire');
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Manchester', addr: '20 Amberley Walk, Chadderton, Oldham', auction: { type: '3 Bedroom House' } }).gap, null);
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Edinburgh', addr: 'Studio flat' }).label, 'Rent gap: bedrooms not stated');
    assert.equal(ready.bedsFrom('studio'), '');
  });
});
